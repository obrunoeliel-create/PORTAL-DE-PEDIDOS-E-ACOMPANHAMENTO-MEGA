import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { cuidParam, updateStatusSchema } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { STATUS_TRANSITIONS, orderInclude, statusTimestamp, toBoardOrder } from "@/lib/orders";
import { emitToStaff } from "@/lib/socket-server";
import { notifyStatusChange } from "@/lib/order-notify";

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
  const parsed = updateStatusSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const next = parsed.data.status;

  const current = await prisma.order.findUnique({
    where: { id: id.data },
    select: { status: true, type: true, deliveryFee: true },
  });
  if (!current) return jsonError("Pedido não encontrado.", 404);
  if (!STATUS_TRANSITIONS[current.status].includes(next)) {
    return jsonError("Transição de status não permitida.", 409);
  }
  // Delivery só avança com a taxa definida (o cliente precisa saber o valor final).
  if (current.type === "DELIVERY" && current.deliveryFee === null && next !== "CANCELED") {
    return jsonError("Defina a taxa de entrega antes de aceitar o pedido.", 409);
  }

  // Concorrência otimista: só atualiza se o status ainda for o lido (dois operadores clicando ao mesmo tempo).
  const { count } = await prisma.order.updateMany({
    where: { id: id.data, status: current.status },
    data: { status: next, ...statusTimestamp(next) },
  });
  if (count === 0) return jsonError("O pedido foi alterado por outro usuário. Atualize a tela.", 409);

  const order = toBoardOrder(await prisma.order.findUniqueOrThrow({ where: { id: id.data }, include: orderInclude }));
  emitToStaff("order:updated", order);
  // WhatsApp automático em segundo plano: não atrasa o operador; o resultado chega ao painel via socket.
  void notifyStatusChange(id.data, next);
  return NextResponse.json({ order });
}
