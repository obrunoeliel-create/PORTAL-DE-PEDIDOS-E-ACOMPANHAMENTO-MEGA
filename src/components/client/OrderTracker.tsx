"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { OrderStatusValue, TrackedOrder } from "@/types/order";
import { formatBRL } from "@/lib/money";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { PixQrCode } from "./PixQrCode";

const POLL_MS = 8000;

const STEPS: { status: OrderStatusValue; label: string }[] = [
  { status: "PENDING", label: "Recebido" },
  { status: "PREPARING", label: "Em preparo" },
  { status: "OUT_FOR_DELIVERY", label: "A caminho" },
  { status: "COMPLETED", label: "Concluído" },
];

function stepLabel(order: TrackedOrder, step: (typeof STEPS)[number]) {
  if (step.status === "OUT_FOR_DELIVERY" && order.type !== "DELIVERY") return "Pronto";
  return step.label;
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
        <p className="text-stone-600">{error}</p>
        <Link href="/" className="btn-primary mt-4 inline-block">
          Ir para o cardápio
        </Link>
      </Centered>
    );
  }
  if (!order) return <Centered>Carregando pedido...</Centered>;

  const currentIdx = STEPS.findIndex((s) => s.status === order.status);

  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 p-4 pb-10">
      <header className="pt-4">
        <p className="text-sm text-stone-500">{order.store.name}</p>
        <h1 className="text-2xl font-bold">Pedido #{order.number}</h1>
        <p className="text-sm text-stone-500">
          {order.type === "TABLE" ? `Mesa ${order.tableNumber}` : ORDER_TYPE_LABEL[order.type]} ·{" "}
          {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </header>

      {order.status === "CANCELED" ? (
        <div className="rounded-xl bg-red-50 p-4 font-semibold text-red-700">
          Este pedido foi cancelado. Em caso de dúvida, fale com a loja.
        </div>
      ) : (
        <ol className="grid grid-cols-4 gap-1 text-center text-xs">
          {STEPS.map((s, i) => (
            <li key={s.status}>
              <div className={`mb-1 h-1.5 rounded-full ${i <= currentIdx ? "bg-brand-600" : "bg-stone-200"}`} />
              <span className={i === currentIdx ? "font-bold text-brand-700" : "text-stone-500"}>
                {stepLabel(order, s)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <section className="rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-stone-200">
        <ul className="space-y-1.5">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-3">
              <span>
                {i.quantity}x {i.halfProductName ? `1/2 ${i.productName} + 1/2 ${i.halfProductName}` : i.productName}
                {i.variantName && <span className="text-stone-500"> ({i.variantName})</span>}
                {i.addons.length > 0 && <span className="block text-stone-500">+ {i.addons.join(", ")}</span>}
              </span>
              <span className="whitespace-nowrap">{formatBRL(i.totalPrice)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-stone-100 pt-3">
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
          {order.paymentMethod === "CASH" && order.changeFor && (
            <Row label="Troco para" value={formatBRL(order.changeFor)} />
          )}
        </div>
      </section>

      {order.feePending && order.status !== "CANCELED" && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          ⏳ A loja está calculando a taxa de entrega para o seu endereço. Esta página atualiza sozinha
          {order.paymentMethod === "PIX" ? " e o QR Code do PIX aparece aqui com o valor final." : "."}
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

      <p className="text-center text-xs text-stone-400">
        {finished ? "Pedido finalizado." : "Atualização automática a cada poucos segundos."} Guarde este link para
        acompanhar seu pedido.
      </p>
      <Link href="/" className="btn-ghost block text-center">
        Voltar ao cardápio
      </Link>
    </main>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : "text-stone-600"}`}>
      <span>{label}</span>
      <span className={highlight ? "font-medium text-amber-700" : ""}>{value}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">{children}</main>;
}
