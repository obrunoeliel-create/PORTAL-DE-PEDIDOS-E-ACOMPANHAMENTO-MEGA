import { NextResponse } from "next/server";
import { z } from "zod";
import { PayloadError, getClientIp, jsonError, readJson, tooManyRequests, validationError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { checkCoupon } from "@/lib/coupons";
import { PricingError, priceOrderItems } from "@/lib/pricing";
import { orderItemSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    code: z.string().max(40),
    phone: z.string().max(30).optional(),
    items: z.array(orderItemSchema).min(1).max(50),
  })
  .strict();

/**
 * Carrinho: confere o cupom e mostra o desconto antes de fechar o pedido. O desconto de verdade é
 * recalculado (e o cupom consumido) só quando o pedido é criado.
 */
export async function POST(req: Request) {
  // Limite baixo: evita tentar adivinhar códigos.
  const rl = rateLimit(`coupon:${getClientIp(req)}`, 15, 10 * 60_000);
  if (!rl.ok) return tooManyRequests(rl);
  let body: unknown;
  try {
    body = await readJson(req, 32 * 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  let subtotal: number;
  try {
    subtotal = (await priceOrderItems(parsed.data.items)).subtotal;
  } catch (err) {
    if (err instanceof PricingError) return jsonError(err.message, 422);
    throw err;
  }
  const phone = (parsed.data.phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "");
  const check = await checkCoupon(parsed.data.code, phone, subtotal);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 422 });
  return NextResponse.json({ code: check.code, discount: check.discount, label: check.label });
}
