import "server-only";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { orderInclude } from "./orders";

/**
 * Comanda aberta da mesa (cria se não existir). Trava a linha da mesa durante a transação para
 * que dois pedidos chegando juntos não abram duas comandas para a mesma mesa.
 */
export async function getOrOpenTableSession(tableNumber: number): Promise<string> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`UPDATE "DiningTable" SET "updatedAt" = now() WHERE "number" = ${tableNumber}`;
      const open = await tx.tableSession.findFirst({ where: { tableNumber, closedAt: null }, select: { id: true } });
      if (open) return open.id;
      const created = await tx.tableSession.create({ data: { tableNumber }, select: { id: true } });
      return created.id;
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

/** Total da comanda: soma dos pedidos não cancelados. */
export async function tableSessionTotals(sessionId: string) {
  const agg = await prisma.order.aggregate({
    where: { tableSessionId: sessionId, status: { not: "CANCELED" } },
    _sum: { total: true },
    _count: true,
  });
  return { total: agg._sum.total ?? 0, orders: agg._count };
}

export const sessionInclude = {
  orders: { include: orderInclude, orderBy: { createdAt: "asc" } },
} satisfies Prisma.TableSessionInclude;

export async function listOpenSessions() {
  return prisma.tableSession.findMany({
    where: { closedAt: null },
    include: sessionInclude,
    orderBy: { tableNumber: "asc" },
  });
}

export class TableSessionError extends Error {}

/**
 * Fecha a comanda: pagamento confirmado no caixa e cliente indo embora.
 * Pedidos ainda em preparo/prontos viram "Concluído"; pedidos aguardando aceite bloqueiam o fechamento.
 */
export async function closeTableSession(sessionId: string, paidWith: PaymentMethod, closedBy: string) {
  return prisma.$transaction(
    async (tx) => {
      const session = await tx.tableSession.findUnique({ where: { id: sessionId }, include: { orders: true } });
      if (!session) throw new TableSessionError("Comanda não encontrada.");
      if (session.closedAt) throw new TableSessionError("Esta mesa já foi fechada.");
      const pending = session.orders.filter((o) => o.status === "PENDING");
      if (pending.length) {
        throw new TableSessionError(
          `Aceite ou cancele o pedido #${pending.map((o) => o.number).join(", #")} antes de fechar a mesa.`,
        );
      }
      const toComplete = session.orders.filter((o) => o.status === "PREPARING" || o.status === "OUT_FOR_DELIVERY").map((o) => o.id);
      if (toComplete.length) {
        await tx.order.updateMany({ where: { id: { in: toComplete } }, data: { status: "COMPLETED", completedAt: new Date() } });
      }
      const total = session.orders.filter((o) => o.status !== "CANCELED").reduce((s, o) => s + o.total, 0);
      await tx.tableSession.update({
        where: { id: sessionId },
        data: { closedAt: new Date(), paidWith, closedBy, total },
      });
      return { completedOrderIds: toComplete, total, tableNumber: session.tableNumber };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}
