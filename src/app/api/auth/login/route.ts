import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { PayloadError, getClientIp, jsonError, readJson } from "@/lib/http";
import { clearRateLimit, rateLimitCheck, rateLimitFail, type RateLimitResult } from "@/lib/rate-limit";
import { SESSION_COOKIE, signSession } from "@/lib/jwt";
import { sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

// Hash fictício: compara mesmo quando o e-mail não existe, para não vazar (por tempo de resposta) quais contas existem.
const DUMMY_HASH = bcrypt.hashSync("orderflow-dummy-password", 12);

const GENERIC_ERROR = "E-mail ou senha inválidos.";

// Só as tentativas ERRADAS contam, e o bloqueio é curto: entrar e sair várias vezes com a senha certa
// (ou vários aparelhos da loja no mesmo Wi-Fi) nunca trava o acesso. Login certo zera os contadores.
const IP_MAX_FAILS = 40;
const ACCOUNT_MAX_FAILS = 8;
const LOCK_WINDOW_MS = 5 * 60_000;

function locked(result: Extract<RateLimitResult, { ok: false }>) {
  const min = Math.ceil(result.retryAfterSec / 60);
  return jsonError(
    `Muitas tentativas com e-mail ou senha errados. Confira os dados e tente de novo em ${min} minuto${min > 1 ? "s" : ""}.`,
    429,
    { "Retry-After": String(result.retryAfterSec) },
  );
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipKey = `login:ip:${ip}`;
  const ipLimit = rateLimitCheck(ipKey, IP_MAX_FAILS);
  if (!ipLimit.ok) return locked(ipLimit);

  let body: unknown;
  try {
    body = await readJson(req, 2048);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    rateLimitFail(ipKey, LOCK_WINDOW_MS);
    return jsonError(GENERIC_ERROR, 401);
  }
  const { email, password } = parsed.data;

  // Limite por conta: freia ataques distribuídos contra um mesmo usuário.
  const accountKey = `login:acct:${email}`;
  const accountLimit = rateLimitCheck(accountKey, ACCOUNT_MAX_FAILS);
  if (!accountLimit.ok) return locked(accountLimit);

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !valid) {
    rateLimitFail(ipKey, LOCK_WINDOW_MS);
    rateLimitFail(accountKey, LOCK_WINDOW_MS);
    return jsonError(GENERIC_ERROR, 401);
  }
  clearRateLimit(accountKey);
  clearRateLimit(ipKey);

  const token = await signSession({ sub: user.id, role: user.role, name: user.name });
  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
