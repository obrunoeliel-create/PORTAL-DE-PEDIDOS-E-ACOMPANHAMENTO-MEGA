"use client";

import { useState } from "react";
import type { BoardOrder, OrderStatusValue } from "@/types/order";
import { formatBRL, parseBRL } from "@/lib/money";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { buildCustomerUpdateMessage, buildWhatsAppUrl, toWhatsAppNumber } from "@/lib/whatsapp";

const TYPE_BADGE: Record<BoardOrder["type"], string> = {
  DELIVERY: "bg-blue-100 text-blue-800",
  PICKUP: "bg-amber-100 text-amber-800",
  TABLE: "bg-emerald-100 text-emerald-800",
};

type Action = { status: OrderStatusValue; label: string; className: string };

function nextActions(order: BoardOrder): Action[] {
  switch (order.status) {
    case "PENDING":
      return [{ status: "PREPARING", label: "Aceitar", className: "bg-green-600 hover:bg-green-700 text-white" }];
    case "PREPARING":
      return [
        {
          status: "OUT_FOR_DELIVERY",
          label: order.type === "DELIVERY" ? "Saiu p/ entrega" : "Pronto",
          className: "bg-blue-600 hover:bg-blue-700 text-white",
        },
      ];
    case "OUT_FOR_DELIVERY":
      return [{ status: "COMPLETED", label: "Concluir", className: "bg-stone-800 hover:bg-stone-900 text-white" }];
    default:
      return [];
  }
}

function minutesSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function OrderCard({
  order,
  busy,
  onStatus,
  onSetFee,
  storeName,
  highlight,
}: {
  order: BoardOrder;
  busy: boolean;
  onStatus: (order: BoardOrder, status: OrderStatusValue) => void;
  onSetFee: (order: BoardOrder, fee: number) => Promise<boolean>;
  storeName: string;
  highlight?: boolean;
}) {
  const canCancel = ["PENDING", "PREPARING", "OUT_FOR_DELIVERY"].includes(order.status);
  const isDelivery = order.type === "DELIVERY";
  const feePending = isDelivery && order.deliveryFee === null;

  function notifyCustomer() {
    const text = buildCustomerUpdateMessage({
      storeName,
      number: order.number,
      deliveryFee: order.deliveryFee,
      total: order.total,
      paymentMethod: order.paymentMethod,
      trackingUrl: `${window.location.origin}/pedido/${order.trackingToken}`,
    });
    window.open(buildWhatsAppUrl(toWhatsAppNumber(order.customerPhone), text), "_blank", "noopener,noreferrer");
  }

  return (
    <article
      className={`space-y-3 rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ${
        highlight ? "animate-flash ring-red-400" : "ring-stone-200"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-bold">#{order.number}</p>
          <p className="text-stone-500" suppressHydrationWarning>
            {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · há{" "}
            {minutesSince(order.createdAt)} min
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGE[order.type]}`}>
          {order.type === "TABLE" ? `Mesa ${order.tableNumber}` : ORDER_TYPE_LABEL[order.type]}
        </span>
      </header>

      <div>
        <p className="font-medium">{order.customerName}</p>
        <p className="text-stone-500">{order.customerPhone}</p>
        {order.type === "DELIVERY" && (
          <p className="mt-1 text-stone-700">
            {order.addressStreet}, {order.addressNumber}
            {order.addressComplement && ` — ${order.addressComplement}`} · {order.addressDistrict}
            {order.addressReference && <span className="block text-stone-500">Ref: {order.addressReference}</span>}
          </p>
        )}
      </div>

      <ul className="space-y-1 border-y border-stone-100 py-2">
        {order.items.map((i) => (
          <li key={i.id}>
            <span className="font-semibold">{i.quantity}x</span>{" "}
            {i.halfProductName ? `1/2 ${i.productName} + 1/2 ${i.halfProductName}` : i.productName}
            {i.variantName && <span className="text-stone-500"> ({i.variantName})</span>}
            {i.addons.length > 0 && (
              <span className="block pl-5 text-stone-500">+ {i.addons.map((a) => a.name).join(", ")}</span>
            )}
            {i.notes && <span className="block pl-5 text-amber-700">Obs: {i.notes}</span>}
          </li>
        ))}
      </ul>

      {order.notes && <p className="rounded bg-amber-50 p-2 text-amber-800">Obs: {order.notes}</p>}

      <div className="flex items-center justify-between">
        <span>
          {PAYMENT_LABEL[order.paymentMethod]}
          {order.paymentMethod === "CASH" && order.changeFor && (
            <span className={`block text-xs ${order.changeFor < order.total ? "font-semibold text-red-600" : "text-stone-500"}`}>
              Troco p/ {formatBRL(order.changeFor)} → {formatBRL(order.changeFor - order.total)}
              {feePending && " (sem taxa)"}
            </span>
          )}
        </span>
        <span className="text-right">
          <span className="block text-base font-bold">{formatBRL(order.total)}</span>
          {isDelivery && (
            <span className={`block text-xs ${feePending ? "font-semibold text-red-600" : "text-stone-500"}`}>
              {feePending ? "+ taxa a definir" : `inclui taxa ${formatBRL(order.deliveryFee ?? 0)}`}
            </span>
          )}
        </span>
      </div>

      {isDelivery && canCancel && (
        <FeeEditor key={order.deliveryFee ?? "pending"} order={order} pending={feePending} disabled={busy} onSave={(fee) => onSetFee(order, fee)} />
      )}

      {canCancel && !feePending && (
        <button
          onClick={notifyCustomer}
          className="w-full rounded-lg border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
        >
          Enviar valor final e link ao cliente (WhatsApp)
        </button>
      )}

      {order.driver && <p className="text-stone-600">🛵 {order.driver.name}</p>}

      {(nextActions(order).length > 0 || canCancel) && (
        <div className="flex gap-2">
          {nextActions(order).map((a) => (
            <button
              key={a.status}
              disabled={busy || feePending}
              title={feePending ? "Defina a taxa de entrega primeiro" : undefined}
              onClick={() => onStatus(order, a.status)}
              className={`flex-1 rounded-lg px-3 py-2 font-semibold disabled:opacity-50 ${a.className}`}
            >
              {a.label}
            </button>
          ))}
          {canCancel && (
            <button
              disabled={busy}
              onClick={() => {
                if (confirm(`Cancelar o pedido #${order.number}?`)) onStatus(order, "CANCELED");
              }}
              className="rounded-lg border border-red-200 px-3 py-2 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function FeeEditor({
  order,
  pending,
  disabled,
  onSave,
}: {
  order: BoardOrder;
  pending: boolean;
  disabled: boolean;
  onSave: (fee: number) => Promise<boolean>;
}) {
  const initial = order.deliveryFee === null ? "" : (order.deliveryFee / 100).toFixed(2).replace(".", ",");
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(pending);
  const [saving, setSaving] = useState(false);
  const cents = value ? parseBRL(value) : null;
  const valid = cents !== null && cents <= 20_000;

  if (!editing && !pending) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs font-medium text-stone-500 underline">
        Alterar taxa de entrega
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || cents === null) return;
        setSaving(true);
        const ok = await onSave(cents);
        setSaving(false);
        if (ok) setEditing(false);
      }}
      className={`flex items-center gap-2 rounded-lg p-2 ${pending ? "bg-red-50 ring-1 ring-red-200" : "bg-stone-50"}`}
    >
      <label className="text-xs font-semibold text-stone-700" htmlFor={`fee-${order.id}`}>
        Taxa R$
      </label>
      <input
        id={`fee-${order.id}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder="0,00"
        maxLength={7}
        className="input w-20 py-1 text-right"
      />
      <button type="submit" disabled={!valid || saving || disabled} className="btn-primary px-3 py-1.5 text-xs">
        {saving ? "..." : "Salvar"}
      </button>
    </form>
  );
}
