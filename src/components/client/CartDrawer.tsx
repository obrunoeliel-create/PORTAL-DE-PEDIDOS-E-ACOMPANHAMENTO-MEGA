"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import type { CartItem, OrderMode, PublicSettings } from "@/types/menu";
import type { PaymentMethodValue } from "@/types/order";
import { formatBRL, parseBRL } from "@/lib/money";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { buildOrderMessage, buildWhatsAppUrl, formatAddress } from "@/lib/whatsapp";
import { PixQrCode } from "./PixQrCode";

type Props = {
  cart: CartItem[];
  setCart: Dispatch<SetStateAction<CartItem[]>>;
  mode: OrderMode | null;
  onChangeMode: () => void;
  settings: PublicSettings;
  onClose: () => void;
  onOrderPlaced?: (order: { number: number; token: string }) => void;
};

type OrderResult = {
  number: number;
  trackingToken: string;
  total: number;
  feePending: boolean;
  paymentMethod: PaymentMethodValue;
  pix: { payload: string; key: string; holderName: string | null } | null;
  whatsappUrl: string | null;
};

/** Último pedido feito neste navegador — o cardápio mostra o atalho "Acompanhar pedido". */
export const LAST_ORDER_KEY = "orderflow:lastOrder:v1";

export function CartDrawer({ cart, setCart, mode, onChangeMode, settings, onClose, onOrderPlaced }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState({ street: "", number: "", district: "", complement: "", reference: "" });
  const [payment, setPayment] = useState<PaymentMethodValue>(settings.pixEnabled ? "PIX" : "CARD");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);

  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  // Delivery: a taxa é definida pela loja depois do pedido (null = a definir).
  const deliveryFee = mode?.type === "DELIVERY" ? null : 0;
  const total = subtotal;
  const changeCents = changeFor ? parseBRL(changeFor) : null;
  const changeValue = changeCents !== null ? changeCents - total : null;

  const payments: PaymentMethodValue[] = settings.pixEnabled ? ["PIX", "CARD", "CASH"] : ["CARD", "CASH"];

  function updateQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.key === key ? { ...i, quantity: Math.min(50, i.quantity + delta) } : i))
        .filter((i) => i.quantity > 0),
    );
  }

  /** Fallback: se a API falhar, monta a mensagem no próprio navegador e abre o WhatsApp. */
  function buildFallbackUrl(): string | null {
    if (!settings.whatsappNumber || !mode) return null;
    const msg = buildOrderMessage({
      storeName: settings.storeName,
      type: mode.type,
      tableNumber: mode.type === "TABLE" ? mode.tableNumber : null,
      customerName: name,
      customerPhone: phone,
      address: mode.type === "DELIVERY" ? formatAddress(address) : null,
      paymentMethod: payment,
      changeFor: payment === "CASH" ? changeCents : null,
      items: cart.map((i) => ({ ...i, totalPrice: i.unitPrice * i.quantity })),
      subtotal,
      deliveryFee,
      total,
      notes,
      estimated: true,
    });
    return buildWhatsAppUrl(settings.whatsappNumber, msg);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) return onChangeMode();
    if (payment === "CASH" && changeFor && (changeCents === null || changeCents < total)) {
      setFieldErrors({ changeFor: "O valor para troco deve ser maior ou igual ao total." });
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    setFallbackUrl(null);

    const payload = {
      type: mode.type,
      ...(mode.type === "TABLE" && { tableNumber: mode.tableNumber }),
      ...(mode.type === "DELIVERY" && {
        address: {
          street: address.street,
          number: address.number,
          district: address.district,
          complement: address.complement || undefined,
          reference: address.reference || undefined,
        },
      }),
      customerName: name,
      customerPhone: phone,
      paymentMethod: payment,
      changeFor: payment === "CASH" && changeCents ? changeCents : undefined,
      notes: notes || undefined,
      items: cart.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        halfProductId: i.halfProductId,
        addonIds: i.addonIds,
        quantity: i.quantity,
        notes: i.notes,
      })),
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível enviar o pedido.");
        setFieldErrors(data.fields ?? {});
        if (res.status >= 500) setFallbackUrl(buildFallbackUrl());
        return;
      }
      const created = data as OrderResult;
      setResult(created);
      onOrderPlaced?.({ number: created.number, token: created.trackingToken });
      setCart([]);
      try {
        localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ number: created.number, token: created.trackingToken }));
      } catch {
        /* armazenamento indisponível */
      }
    } catch {
      setError("Falha de conexão ao enviar o pedido.");
      setFallbackUrl(buildFallbackUrl());
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Shell onClose={onClose} title="Pedido enviado!">
        <div className="space-y-4 p-5 text-center">
          <p className="text-5xl">✅</p>
          <p className="text-lg font-bold">Pedido #{result.number} recebido</p>
          <p className="text-stone-600">
            {result.feePending ? "Total sem a taxa de entrega" : "Total"}: {formatBRL(result.total)}
          </p>
          {result.feePending && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              A loja vai calcular a taxa de entrega para o seu endereço.
              {result.paymentMethod === "PIX"
                ? " O QR Code do PIX com o valor final aparece na página de acompanhamento."
                : " Você acompanha o valor final na página do pedido."}
            </p>
          )}
          {result.pix && (
            <PixQrCode
              payload={result.pix.payload}
              pixKey={result.pix.key}
              holderName={result.pix.holderName}
              amount={result.total}
              orderNumber={result.number}
              storeName={settings.storeName}
              storeWhatsapp={settings.whatsappNumber}
              customerName={name}
            />
          )}
          <Link href={`/pedido/${result.trackingToken}`} className="btn-primary block py-3">
            {result.feePending && result.paymentMethod === "PIX" ? "Acompanhar pedido e pagar" : "Acompanhar pedido"}
          </Link>
          {result.whatsappUrl && (
            <a
              href={result.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-green-600 px-4 py-3 font-semibold text-green-700 hover:bg-green-50"
            >
              Enviar resumo do pedido no WhatsApp
            </a>
          )}
          <button onClick={onClose} className="btn-ghost w-full">
            Voltar ao cardápio
          </button>
        </div>
      </Shell>
    );
  }

  const err = (field: string) =>
    fieldErrors[field] ? <p className="mt-1 text-xs text-red-600">{fieldErrors[field]}</p> : null;

  return (
    <Shell onClose={onClose} title="Seu pedido">
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <div className="flex items-center justify-between rounded-lg bg-stone-100 px-3 py-2 text-sm">
            <span>
              Modalidade:{" "}
              <strong>
                {mode ? (mode.type === "TABLE" ? `Mesa ${mode.tableNumber}` : ORDER_TYPE_LABEL[mode.type]) : "—"}
              </strong>
            </span>
            <button type="button" onClick={onChangeMode} className="font-medium text-brand-700">
              Alterar
            </button>
          </div>

          {cart.length === 0 ? (
            <p className="py-8 text-center text-stone-500">Seu carrinho está vazio.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {cart.map((i) => (
                <li key={i.key} className="flex gap-3 py-3">
                  <div className="flex-1 text-sm">
                    <p className="font-medium">
                      {i.halfProductName ? `1/2 ${i.productName} + 1/2 ${i.halfProductName}` : i.productName}
                      {i.variantName && <span className="text-stone-500"> · {i.variantName}</span>}
                    </p>
                    {i.addonNames.length > 0 && <p className="text-stone-500">+ {i.addonNames.join(", ")}</p>}
                    {i.notes && <p className="text-stone-500">Obs: {i.notes}</p>}
                    <p className="mt-1 font-semibold">{formatBRL(i.unitPrice * i.quantity)}</p>
                  </div>
                  <div className="flex h-fit items-center rounded-lg border border-stone-300 text-sm">
                    <button type="button" onClick={() => updateQty(i.key, -1)} className="px-2.5 py-1" aria-label="Diminuir">
                      −
                    </button>
                    <span className="w-6 text-center">{i.quantity}</span>
                    <button type="button" onClick={() => updateQty(i.key, 1)} className="px-2.5 py-1" aria-label="Aumentar">
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Seus dados</legend>
            <div>
              <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" />
              {err("customerName")}
            </div>
            <div>
              <input className="input" placeholder="Telefone / WhatsApp (com DDD)" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" required autoComplete="tel" />
              {err("customerPhone")}
            </div>
          </fieldset>

          {mode?.type === "DELIVERY" && (
            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-semibold">Endereço de entrega</legend>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <input className="input" placeholder="Rua" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} maxLength={120} required autoComplete="address-line1" />
                <input className="input" placeholder="Nº" value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} maxLength={15} required />
              </div>
              {err("address.street")}
              <input className="input" placeholder="Bairro" value={address.district} onChange={(e) => setAddress({ ...address, district: e.target.value })} maxLength={80} required />
              {err("address.district")}
              <input className="input" placeholder="Complemento (opcional)" value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} maxLength={80} />
              <input className="input" placeholder="Ponto de referência (opcional)" value={address.reference} onChange={(e) => setAddress({ ...address, reference: e.target.value })} maxLength={120} />
            </fieldset>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Pagamento</legend>
            <div className="grid grid-cols-3 gap-2">
              {payments.map((p) => (
                <label
                  key={p}
                  className={`cursor-pointer rounded-lg border p-2.5 text-center text-sm font-medium ${
                    payment === p ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stone-200"
                  }`}
                >
                  <input type="radio" name="payment" className="sr-only" checked={payment === p} onChange={() => setPayment(p)} />
                  {p === "CARD" ? "Cartão" : PAYMENT_LABEL[p]}
                </label>
              ))}
            </div>
            {payment === "CARD" && <p className="mt-2 text-xs text-stone-500">Pagamento na maquininha, na entrega ou no balcão.</p>}
            {payment === "CASH" && (
              <div className="mt-3">
                <input className="input" placeholder="Troco para quanto? (opcional)" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} inputMode="decimal" maxLength={10} />
                {changeValue !== null && changeValue >= 0 && (
                  <p className="mt-1 text-sm text-green-700">
                    {mode?.type === "DELIVERY"
                      ? `Troco sem contar a taxa de entrega: ${formatBRL(changeValue)}`
                      : `Seu troco: ${formatBRL(changeValue)}`}
                  </p>
                )}
                {err("changeFor")}
              </div>
            )}
          </fieldset>

          <div>
            <textarea className="input resize-none" rows={2} placeholder="Observações do pedido (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={280} />
          </div>
        </div>

        <div className="space-y-2 border-t border-stone-100 p-5 text-sm">
          <Row label="Subtotal" value={formatBRL(subtotal)} />
          {mode?.type === "DELIVERY" && <Row label="Taxa de entrega" value="a definir pela loja" />}
          <Row label={mode?.type === "DELIVERY" ? "Total (sem a taxa)" : "Total"} value={formatBRL(total)} bold />
          {error && <p className="rounded-lg bg-red-50 p-2 text-red-700" role="alert">{error}</p>}
          {fallbackUrl && (
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-green-600 px-4 py-2.5 text-center font-semibold text-white">
              Enviar pedido pelo WhatsApp
            </a>
          )}
          <button type="submit" disabled={submitting || cart.length === 0 || !settings.isOpen} className="btn-primary w-full py-3 text-base">
            {submitting ? "Enviando..." : "Finalizar pedido"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : "text-stone-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" role="dialog" aria-modal>
      <div className="flex h-full w-full max-w-md flex-col bg-white">
        <div className="flex items-center justify-between border-b border-stone-100 p-5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-stone-400" aria-label="Fechar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
