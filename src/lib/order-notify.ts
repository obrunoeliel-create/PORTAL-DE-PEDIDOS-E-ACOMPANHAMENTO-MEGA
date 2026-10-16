import "server-only";
import type { OrderStatus } from "@prisma/client";
import { onOrderEvent, type OrderEvent } from "./wa/automations";

/**
 * Após uma mudança de status, coloca o aviso do cliente na fila do WhatsApp (robô da loja; se o robô
 * estiver desconectado, a API oficial da Meta serve de reserva para os avisos que têm modelo aprovado).
 * Nunca lança erro: falhas ficam registradas na mensagem e no pedido (waError).
 */
export async function notifyStatusChange(orderId: string, status: OrderStatus): Promise<void> {
  const map: Partial<Record<OrderStatus, OrderEvent>> = {
    PREPARING: "PREPARING",
    OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
    COMPLETED: "COMPLETED",
    CANCELED: "CANCELED",
  };
  const event = map[status];
  if (event) await onOrderEvent(orderId, event);
}

/** Pedido novo (cliente ou loja): aviso de "recebido" (ou "em preparo", se a loja lançou já aceito). */
export const notifyOrderCreated = (orderId: string) => onOrderEvent(orderId, "CREATED");
