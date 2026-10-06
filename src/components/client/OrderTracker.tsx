"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { OrderStatusValue, TrackedOrder } from "@/types/order";
import { formatBRL } from "@/lib/money";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { itemTitle } from "@/lib/item-title";
import { Logo } from "@/components/brand/Logo";
import { PixQrCode } from "./PixQrCode";

const POLL_MS = 8000;

const STEPS: { status: OrderStatusValue; label: string; icon: string }[] = [
  { status: "PENDING", label: "Recebido", icon: "📝" },
  { status: "PREPARING", label: "Em preparo", icon: "👨‍🍳" },
  { status: "OUT_FOR_DELIVERY", label: "A caminho", icon: "🛵" },
  { status: "COMPLETED", label: "Concluído", icon: "🎉" },
];

function stepLabel(order: TrackedOrder, step: (typeof STEPS)[number]) {
  if (step.status === "OUT_FOR_DELIVERY" && order.type !== "DELIVERY") return { ...step, label: "Pronto", icon: "✅" };
  return step;
}

function headline(order: TrackedOrder): string {
  switch (order.status) {
    case "PENDING":
      return "Aguardando a loja confirmar";
    case "PREPARING":
      return "Seu pedido está sendo preparado";
    case "OUT_FOR_DELIVERY":
      return order.type === "DELIVERY" ? "Saiu para entrega!" : order.type === "TABLE" ? "Já vai chegar na sua mesa!" : "Pronto para retirada!";
    case "COMPLETED":
      return "Pedido concluído. Bom apetite!";
    case "CANCELED":
      return "Pedido cancelado";
  }
}

export function OrderTracker({ token }: { token: string }) {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/track/${token}`, { cache: "no-store" });
      if (res.status === 404) return setError("Pedido não encontrado. Confira o link.");
      if (!res.ok) return; // falha temporária: tenta de novo no próximo ciclo
      setOrder(await res.json());
      setError(null);
    } catch {
      /* offline: tenta de novo no próximo ciclo */
    }
  }, [token]);

  const finished = order?.status === "COMPLETED" || order?.status === "CANCELED";

  useEffect(() => {
    load();
    if (finished) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load, finished]);

  if (error) {
    return (
      <Centered>
        <Logo size={88} className="shadow-lift" />
        <p className="mt-4 font-semibold text-stone-700">{error}</p>
        <Link href="/" className="btn-primary mt-4">
          Ir para o cardápio
        </Link>
      </Centered>
    );
  }
  if (!order) {
    return (
      <Centered>
        <Logo size={88} className="animate-wiggle shadow-lift" />
        <p className="mt-4 text-stone-500">Carregando seu pedido...</p>
      </Centered>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.status === order.status);
  const canceled = order.status === "CANCELED";

  return (
    <div className="min-h-screen pb-10">
      <header className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white">
        <div className="bg-dots absolute inset-0" aria-hidden />
        <div className="absolute -right-16 -top-20 h-60 w-60 rounded-full bg-mega-400/30 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-md px-4 pb-12 pt-6">
          <div className="flex items-center gap-3">
            <Logo size={52} className="ring-2 ring-white/90" />
            <div>
              <p className="font-display font-bold leading-tight">{order.store.name}</p>
              <p className="text-xs text-white/75">
                {order.type === "TABLE" ? `Mesa ${order.tableNumber}` : ORDER_TYPE_LABEL[order.type]} · feito às{" "}
                {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <p className="mt-6 text-sm text-white/75">Pedido #{order.number}</p>
          <h1 className="text-3xl font-extrabold leading-tight">{headline(order)}</h1>
        </div>
      </header>

      <main className="relative mx-auto -mt-6 max-w-md space-y-4 px-4">
        {canceled ? (
          <div className="card p-4 font-semibold text-brand-700">Este pedido foi cancelado. Em caso de dúvida, fale com a loja.</div>
        ) : (
          <ol className="card grid grid-cols-4 gap-1 p-4 text-center text-xs">
            {STEPS.map((raw, i) => {
              const s = stepLabel(order, raw);
              const done = i <= currentIdx;
              const current = i === currentIdx;
              return (
                <li key={s.status} className="relative flex flex-col items-center">
                  {i > 0 && (
                    <span
                      className={`absolute right-1/2 top-5 h-1 w-full -translate-y-1/2 rounded-full ${done ? "bg-brand-500" : "bg-stone-200"}`}
                      aria-hidden
                    />
                  )}
                  <span
                    className={`relative z-10 grid h-10 w-10 place-items-center rounded-full text-lg transition ${
                      done ? "bg-brand-600 shadow-glow" : "bg-stone-100 grayscale"
                    } ${current && !finished ? "ring-4 ring-brand-200" : ""}`}
                    aria-hidden
                  >
                    {s.icon}
                  </span>
                  <span className={`mt-1.5 ${current ? "font-bold text-brand-700" : done ? "text-stone-700" : "text-stone-400"}`}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {order.feePending && !canceled && (
          <div className="flex gap-3 rounded-2xl bg-mega-100 p-4 text-sm text-ink-900 ring-1 ring-mega-300">
            <span className="text-2xl" aria-hidden>
              ⏳
            </span>
            <p>
              A loja está calculando a <strong>taxa de entrega</strong> para o seu endereço. Esta página atualiza sozinha
              {order.paymentMethod === "PIX" ? " e o QR Code do PIX aparece aqui com o valor final." : "."}
            </p>
          </div>
        )}

        {order.tableTab && (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between bg-ink-950 px-4 py-3 text-white">
              <div>
                <p className="text-xs uppercase tracking-widest text-mega-400">Conta da mesa {order.tableTab.tableNumber}</p>
                <p className="font-display text-3xl font-extrabold">{formatBRL(order.tableTab.total)}</p>
              </div>
              <span className="text-4xl" aria-hidden>
                🧾
              </span>
            </div>
            <p className="p-4 text-sm text-stone-600">
              {order.tableTab.closed ? (
                <>✅ Conta paga e mesa fechada. Obrigado pela visita!</>
              ) : (
                <>
                  Soma de {order.tableTab.orders} {order.tableTab.orders === 1 ? "pedido" : "pedidos"} desta mesa. 💰{" "}
                  <strong>Pague no caixa antes de sair.</strong>
                </>
              )}
            </p>
          </div>
        )}

        {order.pix && order.status !== "COMPLETED" && (
          <PixQrCode
            payload={order.pix.payload}
            pixKey={order.pix.key}
            holderName={order.pix.holderName}
            amount={order.total}
            orderNumber={order.number}
            storeName={order.store.name}
            storeWhatsapp={order.store.whatsappNumber}
            customerName={order.customerName}
          />
        )}

        <section className="card p-4 text-sm">
          <h2 className="mb-3 font-display text-base font-bold">Resumo do pedido</h2>
          <ul className="space-y-2">
            {order.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span>
                  <span className="font-semibold">{i.quantity}x</span>{" "}
                  {itemTitle(i)}
                  {i.variantName && <span className="text-stone-500"> ({i.variantName})</span>}
                  {i.addons.length > 0 && <span className="block text-stone-500">+ {i.addons.join(", ")}</span>}
                </span>
                <span className="whitespace-nowrap font-medium">{formatBRL(i.totalPrice)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1.5 border-t border-dashed border-stone-200 pt-3">
            <Row label="Subtotal" value={formatBRL(order.subtotal)} />
            {order.type === "DELIVERY" && (
              <Row
                label="Taxa de entrega"
                value={order.feePending ? "aguardando a loja" : formatBRL(order.deliveryFee ?? 0)}
                highlight={order.feePending}
              />
            )}
            <Row label={order.feePending ? "Total (sem a taxa)" : "Total"} value={formatBRL(order.total)} bold />
            <Row label="Pagamento" value={PAYMENT_LABEL[order.paymentMethod]} />
            {order.paymentMethod === "CASH" && order.changeFor && <Row label="Troco para" value={formatBRL(order.changeFor)} />}
          </div>
        </section>

        <p className="text-center text-xs text-stone-400">
          {finished ? "Pedido finalizado." : "🔄 Atualiza sozinho a cada poucos segundos."} Guarde este link para acompanhar.
        </p>
        <Link href="/" className="btn-ghost w-full py-3">
          Voltar ao cardápio
        </Link>
      </main>
    </div>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-display text-lg font-bold" : "text-stone-500"}`}>
      <span>{label}</span>
      <span className={highlight ? "font-semibold text-mega-700" : ""}>{value}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">{children}</main>;
}
