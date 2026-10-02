import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { changeTableSchema, cuidParam } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { ACTIVE_STATUSES, orderInclude, toBoardOrder } from "@/lib/orders";
import { emitToStaff } from "@/lib/socket-server";

export const runtime = "nodejs";

// Só a loja troca a mesa de um pedido (o cliente fica travado na mesa do QR Code).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Pedido não encontrado.", 404);

  let body: unknown;
  try {
    body = await readJson(req, 256);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = changeTableSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { tableNumber } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: id.data }, select: { type: true, status: true } });
  if (!order) return jsonError("Pedido não encontrado.", 404);
  if (order.type !== "TABLE") return jsonError("Somente pedidos de mesa têm número de mesa.", 409);
  if (!ACTIVE_STATUSES.includes(order.status)) return jsonError("Pedido já finalizado.", 409);

  const table = await prisma.diningTable.findUnique({ where: { number: tableNumber }, select: { active: true } });
  if (!table?.active) return jsonError(`A mesa ${tableNumber} não está cadastrada.`, 422);

  const updated = toBoardOrder(
    await prisma.order.update({ where: { id: id.data }, data: { tableNumber }, include: orderInclude }),
  );
  emitToStaff("order:updated", updated);
  return NextResponse.json({ order: updated });
}
