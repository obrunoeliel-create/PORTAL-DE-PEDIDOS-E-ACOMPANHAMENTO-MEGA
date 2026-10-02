"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardOrder, OrderStatusValue } from "@/types/order";
import { STATUS_LABEL } from "@/lib/labels";
import { OrderCard } from "./OrderCard";
import { fetchBoardOrders, upsertOrder, useStaffSocket } from "./useStaffSocket";

const COLUMNS: { status: OrderStatusValue; title: string; accent: string }[] = [
  { status: "PENDING", title: STATUS_LABEL.PENDING, accent: "border-red-500" },
  { status: "PREPARING", title: STATUS_LABEL.PREPARING, accent: "border-amber-500" },
  { status: "OUT_FOR_DELIVERY", title: STATUS_LABEL.OUT_FOR_DELIVERY, accent: "border-blue-500" },
  { status: "COMPLETED", title: STATUS_LABEL.COMPLETED, accent: "border-green-600" },
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
      document.title = "Pedidos · OrderFlow OS";
      return;
    }
    let on = false;
    const id = setInterval(() => {
      on = !on;
      document.title = on ? `🔴 (${pendingCount}) NOVO PEDIDO` : `(${pendingCount}) Pedidos · OrderFlow OS`;
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Monitor de Pedidos</h1>
        <span className={`flex items-center gap-1.5 text-sm ${connected ? "text-green-700" : "text-red-600"}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          {connected ? "Tempo real conectado" : "Desconectado — tentando reconectar"}
        </span>
        <div className="flex-1" />
        {!soundOn ? (
          <button onClick={enableSound} className="btn-primary">
            🔔 Ativar alerta sonoro
          </button>
        ) : (
          <span className="text-sm text-stone-600">🔔 Som ativo</span>
        )}
      </div>

      {toast && (
        <div className="animate-flash rounded-xl border border-red-300 p-4 font-semibold text-red-800" role="status">
          🔔 {toast}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status);
          const shown = col.status === "COMPLETED" ? list.slice(-15).reverse() : list;
          return (
            <section key={col.status} className={`rounded-xl border-t-4 bg-stone-200/60 p-3 ${col.accent}`}>
              <h2 className="mb-3 flex items-center justify-between font-semibold">
                {col.title}
                <span className="rounded-full bg-white px-2 text-sm">{list.length}</span>
              </h2>
              <div className="space-y-3">
                {shown.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    busy={busyId === o.id}
                    onStatus={changeStatus}
                    onSetFee={setFee}
                    storeName={storeName}
                    highlight={o.status === "PENDING"}
                  />
                ))}
                {shown.length === 0 && <p className="py-6 text-center text-sm text-stone-500">Nenhum pedido</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
