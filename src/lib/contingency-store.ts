// Modo contingência: cópia das mesas e pedidos guardada no navegador (IndexedDB) do computador da loja,
// e a fila de mesas fechadas sem internet. Só roda no navegador.
import type { QueuedClose, Snapshot } from "@/types/contingency";

const DB = "of-contingency";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get<T>(key: string): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function set(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // navegador sem armazenamento: o modo contingência fica sem cópia
  }
}

export const loadSnapshot = () => get<Snapshot>("snapshot");
export const saveSnapshot = (s: Snapshot) => set("snapshot", s);
export const loadQueue = async () => (await get<QueuedClose[]>("queue")) ?? [];
export const saveQueue = (q: QueuedClose[]) => set("queue", q);
/** Anotações locais "entregue" de pedidos (não vão para o servidor). */
export const loadDone = async () => (await get<Record<string, true>>("done")) ?? {};
export const saveDone = (d: Record<string, true>) => set("done", d);

/** Apaga a cópia local (usado ao sair do portal). A fila de mesas fechadas sem internet é mantida. */
export async function clearSnapshot() {
  await set("snapshot", null);
  await set("done", {});
}

export type FetchResult = { kind: "ok"; snapshot: Snapshot } | { kind: "offline" } | { kind: "unauthorized" };

/** Baixa a cópia mais nova do servidor e guarda. "offline" = sem internet ou servidor fora do ar. */
export async function fetchSnapshot(): Promise<FetchResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };
  try {
    const res = await fetch("/api/admin/contingency/snapshot", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (res.status === 401) return { kind: "unauthorized" };
    if (!res.ok) return { kind: "offline" };
    const snapshot = (await res.json()) as Snapshot;
    await saveSnapshot(snapshot);
    return { kind: "ok", snapshot };
  } catch {
    return { kind: "offline" };
  }
}

/**
 * Internet voltou: envia ao servidor as mesas fechadas durante a queda.
 * Só fecha se o total da mesa for o mesmo que foi cobrado; se chegou pedido novo nesse meio tempo,
 * a mesa fica aberta e marcada para a loja conferir. Devolve a fila que sobrou.
 */
export async function flushQueue(fresh: Snapshot): Promise<QueuedClose[]> {
  const queue = await loadQueue();
  if (queue.length === 0) return queue;
  const left: QueuedClose[] = [];
  for (const item of queue) {
    const table = fresh.tables.find((t) => t.sessionId === item.sessionId);
    if (!table) continue; // já foi fechada (por outro aparelho ou numa tentativa anterior)
    if (table.total !== item.expectedTotal) {
      left.push({ ...item, problem: `Chegou pedido novo durante a queda: a mesa agora soma R$ ${(table.total / 100).toFixed(2).replace(".", ",")} e continua aberta. Confira em Comandas.` });
      continue;
    }
    try {
      const res = await fetch(`/api/admin/table-sessions/${item.sessionId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidWith: item.paidWith, expectedTotal: item.expectedTotal }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) continue;
      if (res.status === 401) {
        left.push(item);
        continue;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409 && /já foi fechada/i.test(data.error ?? "")) continue;
      left.push({ ...item, problem: data.error ?? "O servidor recusou o fechamento. Confira em Comandas." });
    } catch {
      left.push(item); // sem conexão de novo: tenta na próxima
    }
  }
  await saveQueue(left);
  return left;
}
