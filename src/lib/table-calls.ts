import "server-only";
import { prisma } from "./prisma";
import { emitToStaff } from "./socket-server";

export type TableCallReason = "ATENDIMENTO" | "CONTA";
export type TableCallDTO = { id: string; tableNumber: number; reason: TableCallReason; createdAt: string };

/** Chamados ainda não atendidos, do mais antigo para o mais novo. */
export async function pendingTableCalls(): Promise<TableCallDTO[]> {
  const rows = await prisma.tableCall.findMany({ where: { attendedAt: null }, orderBy: { createdAt: "asc" }, take: 100 });
  return rows.map((r) => ({ id: r.id, tableNumber: r.tableNumber, reason: r.reason === "CONTA" ? "CONTA" : "ATENDIMENTO", createdAt: r.createdAt.toISOString() }));
}

/** Avisa todas as telas do portal que a lista de chamados mudou. */
export async function broadcastTableCalls() {
  emitToStaff("tablecalls:changed", { calls: await pendingTableCalls() });
}

/**
 * Registra o chamado da mesa. Se a mesa já tem um chamado aberto, não cria outro (só atualiza o motivo
 * para "conta", se for o caso) — evita a equipe receber vários avisos da mesma mesa.
 */
export async function createTableCall(tableNumber: number, reason: TableCallReason) {
  const open = await prisma.tableCall.findFirst({ where: { tableNumber, attendedAt: null } });
  if (open) {
    if (reason === "CONTA" && open.reason !== "CONTA") await prisma.tableCall.update({ where: { id: open.id }, data: { reason } });
    await broadcastTableCalls();
    return { created: false };
  }
  await prisma.tableCall.create({ data: { tableNumber, reason } });
  await broadcastTableCalls();
  return { created: true };
}
