"use client";

import { useState } from "react";
import type { BoardOrder, OrderStatusValue } from "@/types/order";
import { formatBRL, parseBRL } from "@/lib/money";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { itemTitle } from "@/lib/item-title";
import { buildCustomerUpdateMessage, buildWhatsAppUrl, toWhatsAppNumber } from "@/lib/whatsapp";

const TYPE_BADGE: Record<BoardOrder["type"], string> = {
  DELIVERY: "bg-sky-100 text-sky-800",
  PICKUP: "bg-mega-100 text-mega-700",
  TABLE: "bg-emerald-100 text-emerald-800",
};

type Action = { status: OrderStatusValue; label: string; className: string };

function nextActions(order: BoardOrder): Action[] {
  switch (order.status) {
    case "PENDING":
      return [{ status: "PREPARING", label: "✓ Aceitar pedido", className: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_8px_20px_-8px_rgb(5_150_105/0.7)]" }];
    case "PREPARING":
      return [
        {
          status: "OUT_FOR_DELIVERY",
          label: order.type === "DELIVERY" ? "🛵 Saiu p/ entrega" : "✅ Pronto",
          className: "bg-sky-600 hover:bg-sky-700 text-white",
        },
      ];
    case "OUT_FOR_DELIVERY":
      return [{ status: "COMPLETED", label: "Concluir", className: "bg-ink-900 hover:bg-black text-white" }];
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
  onChangeTable,
  storeName,
  highlight,
}: {
  order: BoardOrder;
  busy: boolean;
  onStatus: (order: BoardOrder, status: OrderStatusValue) => void;
  onSetFee: (order: BoardOrder, fee: number) => Promise<boolean>;
  onChangeTable: (order: BoardOrder, tableNumber: number) => Promise<boolean>;
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
      className={`relative space-y-3 rounded-2xl bg-white p-4 text-sm shadow-card transition ${
        highlight ? "ring-2 ring-brand-500" : "ring-1 ring-stone-900/5"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-display text-xl font-extrabold">
            #{order.number}
            {highlight && <span className="animate-pulse rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Novo</span>}
          </p>
          <p className="text-stone-500" suppressHydrationWarning>
            {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · há{" "}
            {minutesSince(order.createdAt)} min
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TYPE_BADGE[order.type]}`}>
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

      <ul className="space-y-1 rounded-xl bg-[#faf7f2] p-3">
        {order.items.map((i) => (
          <li key={i.id}>
            <span className="font-semibold">{i.quantity}x</span>{" "}
            {itemTitle(i)}
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
          <span className="block font-display text-lg font-extrabold">{formatBRL(order.total)}</span>
          {isDelivery && (
            <span className={`block text-xs ${feePending ? "font-semibold text-red-600" : "text-stone-500"}`}>
              {feePending ? "+ taxa a definir" : `inclui taxa ${formatBRL(order.deliveryFee ?? 0)}`}
            </span>
          )}
        </span>
      </div>

      {order.type === "TABLE" && canCancel && (
        <TableEditor key={order.tableNumber ?? 0} order={order} disabled={busy} onSave={(n) => onChangeTable(order, n)} />
      )}

      {isDelivery && canCancel && (
        <FeeEditor key={order.deliveryFee ?? "pending"} order={order} pending={feePending} disabled={busy} onSave={(fee) => onSetFee(order, fee)} />
      )}

      {canCancel && !feePending && (
        <button
          onClick={notifyCustomer}
          className="w-full rounded-xl bg-[#25d366]/10 px-3 py-2 text-sm font-semibold text-[#128c4a] transition hover:bg-[#25d366]/20"
        >
          Enviar valor final e link ao cliente (WhatsApp)
        </button>
      )}

      {order.whatsappUpdates && <WhatsAppStatus order={order} />}

      {order.driver && <p className="text-stone-600">🛵 {order.driver.name}</p>}

      {(nextActions(order).length > 0 || canCancel) && (
        <div className="flex gap-2">
          {nextActions(order).map((a) => (
            <button
              key={a.status}
              disabled={busy || feePending}
              title={feePending ? "Defina a taxa de entrega primeiro" : undefined}
              onClick={() => onStatus(order, a.status)}
              className={`flex-1 rounded-xl px-3 py-2.5 font-semibold transition active:scale-[0.98] disabled:opacity-40 ${a.className}`}
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
              className="rounded-xl border border-stone-200 px-3 py-2.5 font-medium text-stone-500 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
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
      className={`flex items-center gap-2 rounded-xl p-2.5 ${pending ? "bg-brand-50 ring-2 ring-brand-300" : "bg-stone-50"}`}
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

/** Situação das atualizações automáticas no WhatsApp (só aparece se o cliente aceitou receber). */
function WhatsAppStatus({ order }: { order: BoardOrder }) {
  const dispatchLabel = order.type === "DELIVERY" ? "Saiu p/ entrega" : "Pronto p/ retirada";
  const step = (label: string, sentAt: string | null) => (
    <span className={sentAt ? "text-[#128c4a]" : "text-stone-400"}>
      {sentAt ? "✓" : "○"} {label}
    </span>
  );
  return (
    <div className="rounded-xl bg-[#25d366]/10 px-3 py-2 text-xs">
      <p className="font-semibold text-[#128c4a]">📲 Cliente quer atualizações no WhatsApp</p>
      <p className="mt-0.5 flex flex-wrap gap-x-3">
        {step("Aceito", order.waAcceptedAt)}
        {step(dispatchLabel, order.waDispatchedAt)}
      </p>
      {order.waError && (
        <p className="mt-1 font-medium text-brand-700">⚠️ Não enviado: {order.waError}. Use o botão abaixo para avisar.</p>
      )}
    </div>
  );
}

/** Só a loja troca a mesa de um pedido (o cliente fica travado na mesa do QR Code). */
function TableEditor({ order, disabled, onSave }: { order: BoardOrder; disabled: boolean; onSave: (n: number) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(order.tableNumber ?? ""));
  const [saving, setSaving] = useState(false);
  const n = Number(value);
  const valid = /^d{1,3}$/.test(value) && n >= 1 && n !== order.tableNumber;

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs font-medium text-stone-500 underline">
        Trocar mesa
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setSaving(true);
        const ok = await onSave(n);
        setSaving(false);
        if (ok) setEditing(false);
      }}
      className="flex items-center gap-2 rounded-xl bg-stone-50 p-2.5"
    >
      <label className="text-xs font-semibold text-stone-700" htmlFor={`table-${order.id}`}>
        Mesa
      </label>
      <input
        id={`table-${order.id}`}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/D/g, "").slice(0, 3))}
        inputMode="numeric"
        className="input w-16 py-1 text-center"
      />
      <button type="submit" disabled={!valid || saving || disabled} className="btn-primary px-3 py-1.5 text-xs">
        {saving ? "..." : "Salvar"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-stone-500">
        Cancelar
      </button>
    </form>
  );
}
