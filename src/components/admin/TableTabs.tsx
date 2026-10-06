"use client";

import { useCallback, useState } from "react";
import type { BoardOrder } from "@/types/order";
import { formatBRL } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/labels";
import { itemTitle } from "@/lib/item-title";
import { useStaffSocket } from "./useStaffSocket";

export type OpenSession = { id: string; tableNumber: number; openedAt: string; orders: BoardOrder[] };

const PAY = [
  { v: "CASH", label: "💵 Dinheiro" },
  { v: "CARD", label: "💳 Cartão" },
  { v: "PIX", label: "⚡ PIX" },
] as const;

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-brand-100 text-brand-800",
  PREPARING: "bg-mega-100 text-mega-700",
  OUT_FOR_DELIVERY: "bg-sky-100 text-sky-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELED: "bg-stone-100 text-stone-500 line-through",
};

function minutesSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function TableTabs({ initialSessions }: { initialSessions: OpenSession[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [closing, setClosing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/table-sessions", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setSessions((await res.json()).sessions);
  }, []);

  // Qualquer pedido novo/atualizado pode mudar uma comanda: recarrega a lista.
  const connected = useStaffSocket({ onNew: refresh, onUpdated: refresh, onConnect: refresh });

  async function close(session: OpenSession, paidWith: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/table-sessions/${session.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidWith }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao fechar a mesa.");
      setMsg({ ok: true, text: `Mesa ${data.tableNumber} fechada — ${formatBRL(data.total)} recebido. A mesa está livre.` });
      setClosing(null);
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const openTotal = sessions.reduce(
    (s, x) => s + x.orders.filter((o) => o.status !== "CANCELED").reduce((a, o) => a + o.total, 0),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Comandas das mesas</h1>
          <p className="text-sm text-stone-500">
            Os pedidos de cada mesa somam numa conta só. Ao receber no caixa, feche a mesa — ela volta zerada para o próximo
            cliente.
          </p>
        </div>
        <div className="card flex items-center gap-4 px-4 py-3">
          <div>
            <p className="font-display text-2xl font-extrabold leading-none">{sessions.length}</p>
            <p className="text-xs text-stone-500">mesas abertas</p>
          </div>
          <div className="h-8 w-px bg-stone-200" />
          <div>
            <p className="font-display text-2xl font-extrabold leading-none">{formatBRL(openTotal)}</p>
            <p className="text-xs text-stone-500">a receber</p>
          </div>
          <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-brand-500"}`} title={connected ? "Tempo real conectado" : "Desconectado"} />
        </div>
      </div>

      {msg && (
        <p
          className={`rounded-2xl p-3 text-sm font-medium ring-1 ${msg.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-brand-50 text-brand-800 ring-brand-200"}`}
          role="status"
        >
          {msg.text}
        </p>
      )}

      {sessions.length === 0 && (
        <div className="card p-10 text-center text-stone-500">
          <p className="text-4xl">🍽️</p>
          <p className="mt-2 font-semibold">Nenhuma mesa com conta aberta</p>
          <p className="text-sm">A comanda abre sozinha no primeiro pedido feito pelo QR Code da mesa.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sessions.map((s) => {
          const valid = s.orders.filter((o) => o.status !== "CANCELED");
          const total = valid.reduce((a, o) => a + o.total, 0);
          const pending = s.orders.some((o) => o.status === "PENDING");
          return (
            <article key={s.id} className="card flex flex-col overflow-hidden">
              <header className="flex items-center justify-between bg-ink-950 px-4 py-3 text-white">
                <div>
                  <p className="text-xs uppercase tracking-widest text-mega-400">Mesa</p>
                  <p className="font-display text-3xl font-black leading-none">{s.tableNumber}</p>
                </div>
                <div className="text-right text-xs text-white/70" suppressHydrationWarning>
                  aberta há {minutesSince(s.openedAt)} min
                  <p className="font-display text-xl font-extrabold text-white">{formatBRL(total)}</p>
                </div>
              </header>

              <ul className="flex-1 divide-y divide-stone-100 px-4">
                {s.orders.map((o) => (
                  <li key={o.id} className="py-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-display font-bold">
                        #{o.number} <span className="font-sans font-normal text-stone-500">· {o.customerName}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[o.status]}`}>
                        {STATUS_LABEL[o.status].split(" / ")[0]}
                      </span>
                    </div>
                    <ul className="text-stone-600">
                      {o.items.map((i) => (
                        <li key={i.id} className="flex justify-between gap-2">
                          <span>
                            {i.quantity}x {itemTitle(i)}
                            {i.variantName ? ` (${i.variantName})` : ""}
                          </span>
                          <span className="whitespace-nowrap">{formatBRL(i.totalPrice)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              <footer className="border-t border-stone-100 bg-[#faf7f2] p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-sm text-stone-500">
                    Total da mesa ({valid.length} {valid.length === 1 ? "pedido" : "pedidos"})
                  </span>
                  <span className="font-display text-2xl font-extrabold">{formatBRL(total)}</span>
                </div>
                {pending && (
                  <p className="mb-2 rounded-lg bg-brand-50 p-2 text-xs font-medium text-brand-800">
                    Há pedido aguardando aceite: aceite ou cancele antes de fechar.
                  </p>
                )}
                {closing === s.id ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Como o cliente pagou {formatBRL(total)}?</p>
                    <div className="grid grid-cols-3 gap-2">
                      {PAY.map((p) => (
                        <button key={p.v} disabled={busy} onClick={() => close(s, p.v)} className="btn-ghost px-2 py-2.5 text-xs font-bold">
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setClosing(null)} className="w-full text-xs text-stone-500 underline">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setClosing(s.id)} disabled={pending} className="btn-primary w-full py-3">
                    ✅ Receber e fechar mesa
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
