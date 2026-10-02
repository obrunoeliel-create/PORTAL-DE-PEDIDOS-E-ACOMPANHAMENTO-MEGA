import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { PayloadError, getClientIp, jsonError, readJson, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE, signSession } from "@/lib/jwt";
import { sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

// Hash fictício: compara mesmo quando o e-mail não existe, para não vazar (por tempo de resposta) quais contas existem.
const DUMMY_HASH = bcrypt.hashSync("orderflow-dummy-password", 12);

const GENERIC_ERROR = "E-mail ou senha inválidos.";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = rateLimit(`login:ip:${ip}`, 10, 15 * 60_000);
  if (!ipLimit.ok) return tooManyRequests(ipLimit);

  let body: unknown;
  try {
    body = await readJson(req, 2048);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jsonError(GENERIC_ERROR, 401);
  const { email, password } = parsed.data;

  // Limite por conta: freia ataques distribuídos contra um mesmo usuário.
  const accountLimit = rateLimit(`login:acct:${email}`, 5, 15 * 60_000);
  if (!accountLimit.ok) return tooManyRequests(accountLimit);

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !valid) return jsonError(GENERIC_ERROR, 401);

  const token = await signSession({ sub: user.id, role: user.role, name: user.name });
  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
