import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { trackingTokenParam } from "@/lib/validators";
import { PayloadError, getClientIp, jsonError, readJson, tooManyRequests, validationError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { canRate } from "@/lib/rating";
import { emitToStaff } from "@/lib/socket-server";
import { onOrderRated } from "@/lib/club/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    stars: z.number().int().min(1).max(5),
    comment: z.string().max(600).optional().transform((v) => (v ? sanitizeText(v).slice(0, 300) || undefined : undefined)),
  })
  .strict();

/** Avaliação pelo link "Acompanhe seu pedido" (1 a 5 estrelas e um comentário opcional). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(`rating:${getClientIp(req)}`, 10, 10 * 60_000);
  if (!rl.ok) return tooManyRequests(rl);
  const token = trackingTokenParam.safeParse((await params).token);
  if (!token.success) return jsonError("Pedido não encontrado.", 404);
  let body: unknown;
  try {
    body = await readJson(req, 2048);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const order = await prisma.order.findUnique({ where: { trackingToken: token.data }, include: { rating: true } });
  if (!order) return jsonError("Pedido não encontrado.", 404);
  if (!canRate(order)) return jsonError(order.rating ? "Este pedido já foi avaliado. Obrigado!" : "Este pedido não pode mais ser avaliado.", 409);
  try {
    await prisma.orderRating.create({ data: { orderId: order.id, stars: parsed.data.stars, comment: parsed.data.comment ?? null, source: "LINK" } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return jsonError("Este pedido já foi avaliado. Obrigado!", 409);
    throw err;
  }
  // Já avaliou pelo link: o pedido de avaliação no WhatsApp (se ainda na fila) não precisa sair.
  await prisma.waMessage.updateMany({ where: { orderId: order.id, kind: "RATING", status: "QUEUED" }, data: { status: "CANCELED", error: "Cliente já avaliou pelo link." } });
  await prisma.waEvent.create({ data: { kind: "RATING", detail: `Pedido #${order.number} avaliado com nota ${parsed.data.stars} (link)` } });
  emitToStaff("wa:message", { rating: order.number });
  // Clube: bônus por avaliar.
  await onOrderRated(order.id);
  return NextResponse.json({ ok: true, stars: parsed.data.stars });
}
