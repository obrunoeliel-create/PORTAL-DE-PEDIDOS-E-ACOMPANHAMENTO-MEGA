"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardOrder, OrderStatusValue } from "@/types/order";
import { STATUS_LABEL } from "@/lib/labels";
import { OrderCard } from "./OrderCard";
import { fetchBoardOrders, upsertOrder, useStaffSocket } from "./useStaffSocket";

const COLUMNS: { status: OrderStatusValue; title: string; icon: string; dot: string; head: string }[] = [
  { status: "PENDING", title: STATUS_LABEL.PENDING, icon: "🔔", dot: "bg-brand-500", head: "bg-brand-600 text-white" },
  { status: "PREPARING", title: STATUS_LABEL.PREPARING, icon: "👨‍🍳", dot: "bg-mega-500", head: "bg-mega-400 text-ink-900" },
  { status: "OUT_FOR_DELIVERY", title: "Saiu p/ entrega / Pronto", icon: "🛵", dot: "bg-sky-500", head: "bg-sky-600 text-white" },
  { status: "COMPLETED", title: STATUS_LABEL.COMPLETED, icon: "✅", dot: "bg-emerald-500", head: "bg-emerald-600 text-white" },
];

/** Alerta sonoro via Web Audio API (sem arquivo de áudio). */
function playAlert(ctx: AudioContext) {
  const t = ctx.currentTime;
  [0, 0.25, 0.5].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = i === 2 ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, t + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.22);
  });
}

export function OrderBoard({ initialOrders, storeName }: { initialOrders: BoardOrder[]; storeName: string }) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const pendingCount = orders.filter((o) => o.status === "PENDING").length;

  const resync = useCallback(async () => {
    const fresh = await fetchBoardOrders();
    if (fresh) setOrders(fresh);
  }, []);

  const connected = useStaffSocket({
    onNew: (order) => {
      setOrders((prev) => upsertOrder(prev, order));
      setToast(`Novo pedido #${order.number} — ${order.customerName}`);
      if (audioRef.current) playAlert(audioRef.current);
    },
    onUpdated: (order) => setOrders((prev) => upsertOrder(prev, order)),
    onConnect: resync,
  });

  // Repete o alerta a cada 15s enquanto houver pedidos aguardando aceite.
  useEffect(() => {
    if (!soundOn || pendingCount === 0) return;
    const id = setInterval(() => audioRef.current && playAlert(audioRef.current), 15_000);
    return () => clearInterval(id);
  }, [soundOn, pendingCount]);

  // Alerta visual na aba do navegador.
  useEffect(() => {
    if (pendingCount === 0) {
      document.title = "Mega Esfiha Jurema · Pedidos";
      return;
    }
    let on = false;
    const id = setInterval(() => {
      on = !on;
      document.title = on ? `🔴 (${pendingCount}) NOVO PEDIDO · Mega Esfiha Jurema` : `(${pendingCount}) Mega Esfiha Jurema · Pedidos`;
    }, 1000);
    return () => clearInterval(id);
  }, [pendingCount]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);

  function enableSound() {
    // Navegadores só liberam áudio após um gesto do usuário.
    audioRef.current ??= new AudioContext();
    audioRef.current.resume();
    playAlert(audioRef.current);
    setSoundOn(true);
  }

  async function changeStatus(order: BoardOrder, status: OrderStatusValue) {
    setBusyId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao atualizar o pedido.");
        if (res.status === 409) resync();
        return;
      }
      setOrders((prev) => upsertOrder(prev, data.order));
    } catch {
      setError("Falha de conexão.");
    } finally {
      setBusyId(null);
    }
  }

  async function changeTable(order: BoardOrder, tableNumber: number): Promise<boolean> {
    setBusyId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/table`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao trocar a mesa.");
        return false;
      }
      setOrders((prev) => upsertOrder(prev, data.order));
      return true;
    } catch {
      setError("Falha de conexão.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function setFee(order: BoardOrder, deliveryFee: number): Promise<boolean> {
    setBusyId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/delivery-fee`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryFee }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao salvar a taxa de entrega.");
        return false;
      }
      setOrders((prev) => upsertOrder(prev, data.order));
      return true;
    } catch {
      setError("Falha de conexão.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Monitor de pedidos</h1>
          <span className={`mt-1 inline-flex items-center gap-1.5 text-sm font-medium ${connected ? "text-emerald-700" : "text-brand-700"}`}>
            <span className="relative flex h-2.5 w-2.5">
              {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-brand-500"}`} />
            </span>
            {connected ? "Tempo real conectado" : "Desconectado — tentando reconectar"}
          </span>
        </div>
        <div className="flex-1" />
        {!soundOn ? (
          <button onClick={enableSound} className="btn-primary animate-pulse py-3">
            🔔 Ativar alerta sonoro
          </button>
        ) : (
          <span className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-stone-600 shadow-card">🔔 Som ativo</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {COLUMNS.map((col) => (
          <div key={col.status} className="card flex items-center gap-3 p-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f4f1ec] text-2xl" aria-hidden>
              {col.icon}
            </span>
            <div>
              <p className="font-display text-2xl font-extrabold leading-none">{orders.filter((o) => o.status === col.status).length}</p>
              <p className="text-xs text-stone-500">{col.title}</p>
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="flex animate-slide-up items-center gap-3 rounded-2xl bg-brand-600 p-4 font-semibold text-white shadow-glow" role="status">
          <span className="animate-wiggle text-2xl" aria-hidden>🔔</span>
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-brand-50 p-3 text-sm font-medium text-brand-800 ring-1 ring-brand-200" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status);
          const shown = col.status === "COMPLETED" ? list.slice(-15).reverse() : list;
          return (
            <section key={col.status} className="flex flex-col rounded-3xl bg-stone-200/50 p-2">
              <h2 className={`mb-2 flex items-center justify-between rounded-2xl px-4 py-3 font-display font-bold ${col.head}`}>
                <span className="flex items-center gap-2">
                  <span aria-hidden>{col.icon}</span>
                  {col.title}
                </span>
                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white/90 px-2 text-sm text-ink-900">{list.length}</span>
              </h2>
              <div className="space-y-2.5">
                {shown.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    busy={busyId === o.id}
                    onStatus={changeStatus}
                    onSetFee={setFee}
                    onChangeTable={changeTable}
                    storeName={storeName}
                    highlight={o.status === "PENDING"}
                  />
                ))}
                {shown.length === 0 && (
                  <p className="py-10 text-center text-sm text-stone-400">
                    <span className="mb-1 block text-2xl opacity-50" aria-hidden>{col.icon}</span>
                    Nenhum pedido
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
