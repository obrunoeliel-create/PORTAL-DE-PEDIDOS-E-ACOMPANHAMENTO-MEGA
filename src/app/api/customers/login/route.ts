import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { customerLoginSchema } from "@/lib/validators";
import { PayloadError, getClientIp, jsonError, readJson, tooManyRequests, validationError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { CUSTOMER_COOKIE, customerCookieOptions, customerSelect, signCustomerToken, toProfile } from "@/lib/customer-session";

export const runtime = "nodejs";

// Hash fictício: compara mesmo quando o WhatsApp não existe (não revela quem tem cadastro pelo tempo).
const DUMMY = bcrypt.hashSync("0000-dummy", 10);
const GENERIC = "WhatsApp ou senha incorretos.";

export async function POST(req: Request) {
  const ipLimit = rateLimit(`cust:login:ip:${getClientIp(req)}`, 20, 15 * 60_000);
  if (!ipLimit.ok) return tooManyRequests(ipLimit);

  let body: unknown;
  try {
    body = await readJson(req, 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = customerLoginSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { phone, pin } = parsed.data;

  // Senha de 4 dígitos: no máximo 5 tentativas por WhatsApp a cada 15 minutos.
  const phoneLimit = rateLimit(`cust:login:phone:${phone}`, 5, 15 * 60_000);
  if (!phoneLimit.ok) return tooManyRequests(phoneLimit);

  const found = await prisma.customer.findUnique({ where: { phone }, select: { ...customerSelect, pinHash: true } });
  const valid = await bcrypt.compare(pin, found?.pinHash ?? DUMMY);
  if (!found || !valid) return jsonError(GENERIC, 401);

  const { pinHash: _pinHash, ...customer } = found;
  const res = NextResponse.json({ customer: toProfile(customer) });
  res.cookies.set(CUSTOMER_COOKIE, await signCustomerToken(customer.id), customerCookieOptions);
  return res;
}
