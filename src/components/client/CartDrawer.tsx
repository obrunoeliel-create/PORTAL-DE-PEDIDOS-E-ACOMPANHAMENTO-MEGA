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
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-center">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-7 text-white">
            <div className="bg-dots absolute inset-0" aria-hidden />
            <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-white text-4xl shadow-lift">✅</div>
            <p className="relative mt-3 text-sm text-white/80">Recebemos seu pedido!</p>
            <p className="relative font-display text-4xl font-extrabold">#{result.number}</p>
            <p className="relative mt-1 text-white/90">
              {result.feePending ? "Total sem a taxa de entrega" : "Total"}:{" "}
              <strong className="font-display">{formatBRL(result.total)}</strong>
            </p>
          </div>
          {result.feePending && (
            <p className="rounded-2xl bg-mega-100 p-4 text-left text-sm text-ink-900 ring-1 ring-mega-300">
              🛵 A loja vai calcular a taxa de entrega para o seu endereço.
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
          <Link href={`/pedido/${result.trackingToken}`} className="btn-primary w-full py-3.5 text-base">
            📦 {result.feePending && result.paymentMethod === "PIX" ? "Acompanhar pedido e pagar" : "Acompanhar meu pedido"}
          </Link>
          {result.whatsappUrl && (
            <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-whatsapp w-full">
              💬 Enviar resumo no WhatsApp
            </a>
          )}
          <button onClick={onClose} className="btn-ghost w-full py-3">
            Voltar ao cardápio
          </button>
        </div>
      </Shell>
    );
  }

  const err = (field: string) =>
    fieldErrors[field] ? <p className="mt-1 text-xs font-medium text-brand-700">{fieldErrors[field]}</p> : null;

  const paymentIcon: Record<PaymentMethodValue, string> = { PIX: "⚡", CARD: "💳", CASH: "💵" };
  const modeIcon = { DELIVERY: "🛵", PICKUP: "🏪", TABLE: "🍽️" } as const;
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <Shell onClose={onClose} title="Seu pedido" subtitle={`${itemCount} ${itemCount === 1 ? "item" : "itens"}`}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto bg-[#faf7f2] p-4">
          <button
            type="button"
            onClick={onChangeMode}
            className="card flex w-full items-center justify-between p-3.5 text-left text-sm transition hover:shadow-lift"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-mega-400 text-xl" aria-hidden>
                {mode ? modeIcon[mode.type] : "📍"}
              </span>
              <span>
                <span className="block text-xs text-stone-500">Modalidade</span>
                <strong className="font-display text-base">
                  {mode ? (mode.type === "TABLE" ? `Mesa ${mode.tableNumber}` : ORDER_TYPE_LABEL[mode.type]) : "Escolher"}
                </strong>
              </span>
            </span>
            <span className="font-semibold text-brand-600">Alterar</span>
          </button>

          <Card title="Itens">
            {cart.length === 0 ? (
              <p className="py-6 text-center text-stone-500">🛒 Seu carrinho está vazio.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {cart.map((i) => (
                  <li key={i.key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold">
                        {i.halfProductName ? `½ ${i.productName} + ½ ${i.halfProductName}` : i.productName}
                        {i.variantName && <span className="font-normal text-stone-500"> · {i.variantName}</span>}
                      </p>
                      {i.addonNames.length > 0 && <p className="text-stone-500">+ {i.addonNames.join(", ")}</p>}
                      {i.notes && <p className="text-stone-500">“{i.notes}”</p>}
                      <p className="mt-1 font-display font-bold text-brand-700">{formatBRL(i.unitPrice * i.quantity)}</p>
                    </div>
                    <div className="flex h-fit items-center rounded-xl bg-stone-100 p-0.5 text-sm">
                      <button
                        type="button"
                        onClick={() => updateQty(i.key, -1)}
                        className="grid h-8 w-8 place-items-center rounded-lg font-bold text-brand-600 hover:bg-white"
                        aria-label={i.quantity === 1 ? "Remover" : "Diminuir"}
                      >
                        {i.quantity === 1 ? "🗑" : "−"}
                      </button>
                      <span className="w-6 text-center font-display font-bold">{i.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(i.key, 1)}
                        className="grid h-8 w-8 place-items-center rounded-lg font-bold text-brand-600 hover:bg-white"
                        aria-label="Aumentar"
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Seus dados">
            <div className="space-y-2.5">
              <div>
                <input className="input" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" />
                {err("customerName")}
              </div>
              <div>
                <input className="input" placeholder="WhatsApp com DDD" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" required autoComplete="tel" />
                {err("customerPhone")}
              </div>
            </div>
          </Card>

          {mode?.type === "DELIVERY" && (
            <Card title="Endereço de entrega">
              <div className="space-y-2.5">
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <input className="input" placeholder="Rua" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} maxLength={120} required autoComplete="address-line1" />
                  <input className="input" placeholder="Nº" value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} maxLength={15} required />
                </div>
                {err("address.street")}
                <input className="input" placeholder="Bairro" value={address.district} onChange={(e) => setAddress({ ...address, district: e.target.value })} maxLength={80} required />
                {err("address.district")}
                <input className="input" placeholder="Complemento (opcional)" value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} maxLength={80} />
                <input className="input" placeholder="Ponto de referência (opcional)" value={address.reference} onChange={(e) => setAddress({ ...address, reference: e.target.value })} maxLength={120} />
              </div>
            </Card>
          )}

          <Card title="Pagamento">
            <div className="grid grid-cols-3 gap-2">
              {payments.map((p) => (
                <label key={p} className={`chip text-center font-semibold ${payment === p ? "chip-on" : "chip-off"}`}>
                  <input type="radio" name="payment" className="sr-only" checked={payment === p} onChange={() => setPayment(p)} />
                  <span className="block text-xl" aria-hidden>
                    {paymentIcon[p]}
                  </span>
                  {p === "CARD" ? "Cartão" : PAYMENT_LABEL[p]}
                </label>
              ))}
            </div>
            {payment === "PIX" && <p className="mt-2.5 text-xs text-stone-500">O QR Code aparece depois que você enviar o pedido.</p>}
            {payment === "CARD" && <p className="mt-2.5 text-xs text-stone-500">Pagamento na maquininha, na entrega ou no balcão.</p>}
            {payment === "CASH" && (
              <div className="mt-3">
                <input className="input" placeholder="Troco para quanto? (opcional)" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} inputMode="decimal" maxLength={10} />
                {changeValue !== null && changeValue >= 0 && (
                  <p className="mt-1.5 text-sm font-medium text-green-700">
                    {mode?.type === "DELIVERY"
                      ? `Troco sem contar a taxa de entrega: ${formatBRL(changeValue)}`
                      : `Seu troco: ${formatBRL(changeValue)}`}
                  </p>
                )}
                {err("changeFor")}
              </div>
            )}
          </Card>

          <Card title="Observações do pedido">
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="Opcional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={280}
              aria-label="Observações do pedido"
            />
          </Card>
        </div>

        <div className="space-y-2 border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm">
          <Row label="Subtotal" value={formatBRL(subtotal)} />
          {mode?.type === "DELIVERY" && <Row label="Taxa de entrega" value="a definir pela loja" />}
          <Row label={mode?.type === "DELIVERY" ? "Total (sem a taxa)" : "Total"} value={formatBRL(total)} bold />
          {error && (
            <p className="rounded-xl bg-brand-50 p-3 font-medium text-brand-800" role="alert">
              {error}
            </p>
          )}
          {fallbackUrl && (
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="btn-whatsapp w-full">
              💬 Enviar pedido pelo WhatsApp
            </a>
          )}
          <button
            type="submit"
            disabled={submitting || cart.length === 0 || !settings.isOpen}
            className="btn-primary w-full justify-between py-4 text-base"
          >
            <span>{submitting ? "Enviando..." : "Finalizar pedido"}</span>
            <span className="font-display font-bold">{formatBRL(total)}</span>
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h3 className="mb-3 font-display text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-display text-lg font-bold" : "text-stone-500"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Shell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in justify-end bg-ink-950/60 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="flex h-full w-full max-w-md animate-slide-up flex-col bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="text-xl font-extrabold">{title}</h2>
            {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-xl leading-none text-stone-500 hover:bg-stone-200"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
