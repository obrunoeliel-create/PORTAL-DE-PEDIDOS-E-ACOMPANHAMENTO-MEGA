import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { SESSION_COOKIE, SESSION_MAX_AGE, verifySession, type Session } from "./jwt";

export const sessionCookieOptions = {
  httpOnly: true,
  // Chrome/Edge/Firefox tratam http://localhost como contexto seguro, então funciona em dev.
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

/**
 * Valida o JWT e confirma no banco que o usuário continua ativo.
 * O papel (role) vem do banco, então rebaixamentos têm efeito imediato.
 */
async function loadActiveUser(session: Session | null) {
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, role: true, active: true },
  });
  return user?.active ? user : null;
}

export async function requirePageSession(roles?: Role[]) {
  const user = await loadActiveUser(await getSession());
  if (!user) redirect("/admin/login");
  if (roles && !roles.includes(user.role)) redirect("/admin");
  return user;
}

type ApiAuth =
  | { ok: true; user: { id: string; name: string; role: Role } }
  | { ok: false; response: NextResponse };

export async function requireApiSession(roles?: Role[]): Promise<ApiAuth> {
  const user = await loadActiveUser(await getSession());
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }
  if (roles && !roles.includes(user.role)) {
    return { ok: false, response: NextResponse.json({ error: "Acesso negado." }, { status: 403 }) };
  }
  return { ok: true, user };
}
