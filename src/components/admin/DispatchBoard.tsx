"use client";

import { useCallback, useState } from "react";
import type { BoardOrder, DriverDTO } from "@/types/order";
import { formatBRL } from "@/lib/money";
import { PAYMENT_LABEL, STATUS_LABEL } from "@/lib/labels";
import { fetchBoardOrders, upsertOrder, useStaffSocket } from "./useStaffSocket";

type Props = { initialOrders: BoardOrder[]; initialDrivers: DriverDTO[]; canManageDrivers: boolean };

const isDispatchable = (o: BoardOrder) =>
  o.type === "DELIVERY" && ["PENDING", "PREPARING", "OUT_FOR_DELIVERY"].includes(o.status);

export function DispatchBoard({ initialOrders, initialDrivers, canManageDrivers }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [drivers, setDrivers] = useState(initialDrivers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newDriver, setNewDriver] = useState({ name: "", phone: "" });

  const resync = useCallback(async () => {
    const fresh = await fetchBoardOrders();
    if (fresh) setOrders(fresh);
  }, []);

  useStaffSocket({
    onNew: (o) => setOrders((prev) => upsertOrder(prev, o)),
    onUpdated: (o) => setOrders((prev) => upsertOrder(prev, o)),
    onConnect: resync,
  });

  const activeDrivers = drivers.filter((d) => d.active);
  const deliveries = orders.filter(isDispatchable);

  async function patch(url: string, body: unknown): Promise<BoardOrder | null> {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Falha na operação.");
    return data.order ?? null;
  }

  async function assign(order: BoardOrder, driverId: string | null) {
    setBusyId(order.id);
    setError(null);
    try {
      const updated = await patch(`/api/admin/orders/${order.id}/driver`, { driverId });
      if (updated) setOrders((prev) => upsertOrder(prev, updated));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function dispatch(order: BoardOrder) {
    setBusyId(order.id);
    setError(null);
    try {
      const updated = await patch(`/api/admin/orders/${order.id}/status`, { status: "OUT_FOR_DELIVERY" });
      if (updated) setOrders((prev) => upsertOrder(prev, updated));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function addDriver(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newDriver),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Falha ao cadastrar entregador.");
      return;
    }
    setDrivers((prev) => [...prev, data.driver]);
    setNewDriver({ name: "", phone: "" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-3">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Despacho de Entregas</h1>
        {error && (
          <p className="rounded-2xl bg-brand-50 p-3 text-sm font-medium text-brand-800" role="alert">
            {error}
          </p>
        )}
        {deliveries.length === 0 && <p className="text-stone-500">Nenhuma entrega em andamento.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {deliveries.map((o) => (
            <article key={o.id} className="space-y-2 card p-4 text-sm">
              <div className="flex justify-between">
                <span className="font-display text-lg font-extrabold">#{o.number}</span>
                <span className="rounded-full bg-[#f4f1ec] px-2.5 py-0.5 text-xs font-semibold">{STATUS_LABEL[o.status]}</span>
              </div>
              <p>
                <span className="font-medium">{o.customerName}</span> · {o.customerPhone}
              </p>
              <p className="text-stone-700">
                {o.addressStreet}, {o.addressNumber} {o.addressComplement && `— ${o.addressComplement}`} · {o.addressDistrict}
              </p>
              <p className="text-stone-500">
                {PAYMENT_LABEL[o.paymentMethod]} · {formatBRL(o.total)}
                {o.paymentMethod === "CASH" && o.changeFor ? ` · levar troco p/ ${formatBRL(o.changeFor)}` : ""}
              </p>
              <div className="flex gap-2 pt-1">
                <select
                  className="input flex-1"
                  value={o.driverId ?? ""}
                  disabled={busyId === o.id}
                  onChange={(e) => assign(o, e.target.value || null)}
                  aria-label="Entregador"
                >
                  <option value="">— Sem entregador —</option>
                  {activeDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {o.status === "PREPARING" && (
                  <button
                    onClick={() => dispatch(o)}
                    disabled={busyId === o.id || !o.driverId}
                    className="btn-primary"
                    title={!o.driverId ? "Atribua um entregador primeiro" : undefined}
                  >
                    Despachar
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="space-y-3">
        <h2 className="font-display text-lg font-bold">🛵 Entregadores</h2>
        <ul className="card divide-y divide-stone-100 overflow-hidden">
          {drivers.map((d) => {
            const count = orders.filter((o) => o.driverId === d.id && o.status === "OUT_FOR_DELIVERY").length;
            return (
              <li key={d.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  <span className="font-medium">{d.name}</span>
                  <span className="block text-stone-500">{d.phone}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${count ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}`}>
                  {count ? `${count} em rota` : "Disponível"}
                </span>
              </li>
            );
          })}
          {drivers.length === 0 && <li className="p-3 text-sm text-stone-500">Nenhum entregador cadastrado.</li>}
        </ul>
        {canManageDrivers && (
          <form onSubmit={addDriver} className="space-y-2 card p-4">
            <p className="text-sm font-medium">Novo entregador</p>
            <input className="input" placeholder="Nome" value={newDriver.name} onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })} maxLength={60} required />
            <input className="input" placeholder="Telefone" value={newDriver.phone} onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })} maxLength={20} inputMode="tel" required />
            <button className="btn-primary w-full">Cadastrar</button>
          </form>
        )}
      </aside>
    </div>
  );
}
