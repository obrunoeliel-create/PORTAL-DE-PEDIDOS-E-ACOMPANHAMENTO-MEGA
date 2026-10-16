import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/customer-session";
import { PayloadError, getClientIp, jsonError, readJson, tooManyRequests, validationError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { ClubError, cancelRedemption, redeem } from "@/lib/club/core";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ rewardId: z.string().cuid().or(z.string().regex(/^rw_[a-z0-9]{2,20}$/)) }).strict(),
  z.object({ cancel: z.string().regex(/^MJ-[A-Z0-9]{4}-[A-Z0-9]{4}$/) }).strict(),
]);

/** RESGATAR (troca pontos por recompensa) ou cancelar um resgate ainda não usado (devolve os pontos). */
export async function POST(req: Request) {
  const me = await getCurrentCustomer();
  if (!me) return jsonError("Entre na sua conta para resgatar.", 401);
  const rl = rateLimit(`club:redeem:${me.id}:${getClientIp(req)}`, 10, 10 * 60_000);
  if (!rl.ok) return tooManyRequests(rl);
  let body: unknown;
  try {
    body = await readJson(req, 512);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  try {
    if ("cancel" in parsed.data) {
      const red = await prisma.redemption.findUnique({ where: { code: parsed.data.cancel }, select: { customerId: true } });
      if (!red || red.customerId !== me.id) return jsonError("Resgate não encontrado.", 404);
      await cancelRedemption(parsed.data.cancel, "cliente");
      return NextResponse.json({ ok: true });
    }
    const red = await redeem(me.id, parsed.data.rewardId);
    return NextResponse.json({ code: red.code, expiresAt: red.expiresAt }, { status: 201 });
  } catch (err) {
    if (err instanceof ClubError) return jsonError(err.message, 409);
    throw err;
  }
}
