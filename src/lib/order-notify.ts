import "server-only";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { formatBRL } from "./money";
import { orderInclude, toBoardOrder } from "./orders";
import { emitToStaff } from "./socket-server";
import { sendOrderUpdate, type OrderUpdateEvent } from "./whatsapp-cloud";
import { configuredPublicUrl } from "./public-url";


/**
 * Após uma mudança de status, envia a atualização automática no WhatsApp — só para pedidos de
 * delivery/balcão cujo cliente aceitou receber. Registra o resultado no pedido e avisa o painel.
 * Nunca lança erro: falhas ficam em `waError` e o operador pode usar o botão manual.
 */
export async function notifyStatusChange(orderId: string, status: OrderStatus): Promise<void> {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || !order.whatsappUpdates || order.type === "TABLE") return;

    let event: OrderUpdateEvent | null = null;
    if (status === "PREPARING") event = "ACCEPTED";
    else if (status === "OUT_FOR_DELIVERY") event = order.type === "DELIVERY" ? "OUT_FOR_DELIVERY" : "READY_PICKUP";
    if (!event) return;

    const alreadySent = event === "ACCEPTED" ? order.waAcceptedAt : order.waDispatchedAt;
    if (alreadySent) return;

    const result = await sendOrderUpdate({
      event,
      phone: order.customerPhone,
      customerName: order.customerName,
      orderNumber: order.number,
      total: formatBRL(order.total),
      trackingUrl: `${configuredPublicUrl()}/pedido/${order.trackingToken}`,
    });

    const sentAt = new Date();
    const data: Prisma.OrderUpdateInput = result.ok
      ? event === "ACCEPTED"
        ? { waAcceptedAt: sentAt, waError: null }
        : { waDispatchedAt: sentAt, waError: null }
      : { waError: result.error };
    if (!result.ok) console.warn(`[whatsapp] pedido #${order.number}: ${result.error}`);

    const updated = await prisma.order.update({ where: { id: orderId }, data, include: orderInclude });
    emitToStaff("order:updated", toBoardOrder(updated));
  } catch (err) {
    console.error("[whatsapp] falha inesperada ao notificar:", err instanceof Error ? err.message : err);
  }
}
