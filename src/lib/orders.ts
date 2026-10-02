import "server-only";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { BoardOrder } from "@/types/order";

export const orderInclude = {
  items: true,
  driver: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const ACTIVE_STATUSES: OrderStatus[] = ["PENDING", "PREPARING", "OUT_FOR_DELIVERY"];

/** Máquina de estados do pedido: só estas transições são aceitas pela API. */
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PREPARING", "CANCELED"],
  PREPARING: ["OUT_FOR_DELIVERY", "CANCELED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "CANCELED"],
  COMPLETED: [],
  CANCELED: [],
};

export function statusTimestamp(status: OrderStatus): Prisma.OrderUpdateManyMutationInput {
  const now = new Date();
  switch (status) {
    case "PREPARING":
      return { acceptedAt: now };
    case "OUT_FOR_DELIVERY":
      return { dispatchedAt: now };
    case "COMPLETED":
      return { completedAt: now };
    case "CANCELED":
      return { canceledAt: now };
    default:
      return {};
  }
}

/** Converte Dates em strings — mesmo formato que chega via Socket.IO e fetch. */
export function toBoardOrder(order: OrderWithRelations): BoardOrder {
  return JSON.parse(JSON.stringify(order)) as BoardOrder;
}

export async function getBoardOrders(): Promise<BoardOrder[]> {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { status: { in: ACTIVE_STATUSES } },
        { status: { in: ["COMPLETED", "CANCELED"] }, updatedAt: { gte: since } },
      ],
    },
    include: orderInclude,
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  return orders.map(toBoardOrder);
}
