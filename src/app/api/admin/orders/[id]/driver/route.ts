import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { assignDriverSchema, cuidParam } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { orderInclude, toBoardOrder } from "@/lib/orders";
import { emitToStaff } from "@/lib/socket-server";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Pedido não encontrado.", 404);

  let body: unknown;
  try {
    body = await readJson(req, 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = assignDriverSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { driverId } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: id.data }, select: { type: true, status: true } });
  if (!order) return jsonError("Pedido não encontrado.", 404);
  if (order.type !== "DELIVERY") return jsonError("Somente pedidos de delivery recebem entregador.", 409);
  if (!["PENDING", "PREPARING", "OUT_FOR_DELIVERY"].includes(order.status)) {
    return jsonError("Pedido já finalizado.", 409);
  }

  if (driverId) {
    const driver = await prisma.driver.findFirst({ where: { id: driverId, active: true }, select: { id: true } });
    if (!driver) return jsonError("Entregador inválido ou inativo.", 422);
  }

  const updated = toBoardOrder(
    await prisma.order.update({ where: { id: id.data }, data: { driverId }, include: orderInclude }),
  );
  emitToStaff("order:updated", updated);
  return NextResponse.json({ order: updated });
}
