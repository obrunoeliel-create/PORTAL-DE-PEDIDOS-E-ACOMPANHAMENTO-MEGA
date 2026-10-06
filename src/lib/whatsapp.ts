import { formatBRL } from "./money";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL } from "./labels";
import { itemTitle } from "./item-title";
import type { OrderTypeValue, PaymentMethodValue } from "@/types/order";

export type MessageItem = {
  quantity: number;
  productName: string;
  halfProductName?: string | null;
  categoryLabel?: string | null;
  variantName?: string | null;
  addonNames: string[];
  notes?: string | null;
  totalPrice: number;
};

export type MessageOrder = {
  number?: number;
  storeName: string;
  type: OrderTypeValue;
  tableNumber?: number | null;
  customerName: string;
  customerPhone: string;
  address?: string | null;
  paymentMethod: PaymentMethodValue;
  changeFor?: number | null;
  items: MessageItem[];
  subtotal: number;
  /** null = delivery com taxa ainda a definir pela loja */
  deliveryFee: number | null;
  total: number;
  notes?: string | null;
  estimated?: boolean;
};

const feePending = (o: { type: OrderTypeValue; deliveryFee: number | null }) =>
  o.type === "DELIVERY" && o.deliveryFee === null;

export function buildOrderMessage(o: MessageOrder): string {
  const lines: string[] = [];
  lines.push(`*${o.storeName}*`);
  lines.push(o.number ? `*Pedido #${o.number}*` : "*Novo pedido*");
  lines.push("");
  lines.push(`Modalidade: ${ORDER_TYPE_LABEL[o.type]}${o.type === "TABLE" && o.tableNumber ? ` ${o.tableNumber}` : ""}`);
  lines.push(o.customerPhone ? `Cliente: ${o.customerName} (${o.customerPhone})` : `Cliente: ${o.customerName}`);
  if (o.address) lines.push(`Endereço: ${o.address}`);
  lines.push("");
  for (const item of o.items) {
    const name = itemTitle(item);
    lines.push(`${item.quantity}x ${name}${item.variantName ? ` (${item.variantName})` : ""} — ${formatBRL(item.totalPrice)}`);
    if (item.addonNames.length) lines.push(`   + ${item.addonNames.join(", ")}`);
    if (item.notes) lines.push(`   Obs: ${item.notes}`);
  }
  lines.push("");
  lines.push(`Subtotal: ${formatBRL(o.subtotal)}`);
  if (feePending(o)) {
    lines.push("Taxa de entrega: a definir pela loja");
    lines.push(`*Total (sem a taxa): ${formatBRL(o.total)}*`);
  } else {
    if (o.deliveryFee) lines.push(`Taxa de entrega: ${formatBRL(o.deliveryFee)}`);
    lines.push(`*Total: ${formatBRL(o.total)}*${o.estimated ? " (valor a confirmar)" : ""}`);
  }
  lines.push(`Pagamento: ${PAYMENT_LABEL[o.paymentMethod]}`);
  if (o.paymentMethod === "CASH" && o.changeFor) {
    lines.push(
      feePending(o)
        ? `Troco para ${formatBRL(o.changeFor)}`
        : `Troco para ${formatBRL(o.changeFor)} (troco: ${formatBRL(Math.max(0, o.changeFor - o.total))})`,
    );
  }
  if (o.notes) lines.push(`Obs. do pedido: ${o.notes}`);
  return lines.join("\n");
}

/** Mensagem do cliente para a loja, enviando o comprovante do PIX. */
export function buildReceiptMessage(o: { storeName: string; number: number; total: number; customerName?: string }) {
  return [
    `Olá, ${o.storeName}! Segue o comprovante do PIX do *pedido #${o.number}*.`,
    `Valor: *${formatBRL(o.total)}*`,
    o.customerName ? `Nome: ${o.customerName}` : null,
    "",
    "(anexe o comprovante abaixo 📎)",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** Mensagem da loja para o cliente com o valor final e o link de acompanhamento. */
export function buildCustomerUpdateMessage(o: {
  storeName: string;
  number: number;
  deliveryFee: number | null;
  total: number;
  paymentMethod: PaymentMethodValue;
  trackingUrl: string;
}) {
  return [
    `Olá! Aqui é da *${o.storeName}*. Recebemos seu *pedido #${o.number}*.`,
    o.deliveryFee !== null ? `Taxa de entrega: ${formatBRL(o.deliveryFee)}` : null,
    `Total: *${formatBRL(o.total)}*`,
    o.paymentMethod === "PIX" ? "O QR Code do PIX com o valor final está no link abaixo." : null,
    "",
    `Acompanhe seu pedido: ${o.trackingUrl}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** Telefone do cliente (só dígitos, com DDD) → número internacional para wa.me. */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 11 ? `55${digits}` : digits;
}

/** "+5511983557367" → "(11) 98355-7367" */
export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export function buildWhatsAppUrl(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function formatAddress(a: {
  street?: string | null;
  number?: string | null;
  district?: string | null;
  complement?: string | null;
  reference?: string | null;
}): string {
  return [
    [a.street, a.number].filter(Boolean).join(", "),
    a.complement,
    a.district,
    a.reference ? `Ref: ${a.reference}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
}
