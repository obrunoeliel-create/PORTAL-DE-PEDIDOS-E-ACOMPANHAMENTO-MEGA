// Módulo sem dependências do Next.js: usado pelo middleware (Edge), pelas rotas e pelo server.ts (Socket.IO).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "of_session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 horas

const ISSUER = "orderflow-os";
const AUDIENCE = "orderflow-admin";

export type SessionRole = "MANAGER" | "OPERATOR";
export type Session = { sub: string; role: SessionRole; name: string };

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET ausente ou com menos de 32 caracteres");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({ role: session.role, name: session.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const role = payload.role;
    if (typeof payload.sub !== "string" || (role !== "MANAGER" && role !== "OPERATOR")) return null;
    return { sub: payload.sub, role: role as SessionRole, name: typeof payload.name === "string" ? payload.name : "" };
  } catch {
    return null;
  }
}

/** Lê um cookie de um header `Cookie` bruto (usado no handshake do Socket.IO). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Checagem anti-CSRF / Cross-Site WebSocket Hijacking: a origem precisa ser a própria aplicação. */
export function isAllowedOrigin(origin: string | null | undefined, host: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const configured = process.env.APP_ORIGIN;
    if (configured) return url.origin === new URL(configured).origin;
    return !!host && url.host === host;
  } catch {
    return false;
  }
}
