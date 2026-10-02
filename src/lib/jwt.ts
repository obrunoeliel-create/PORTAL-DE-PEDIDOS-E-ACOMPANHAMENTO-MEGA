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

/** APP_ORIGIN aceita uma ou mais origens separadas por vírgula; sem esquema, assume https://. */
export function configuredOrigins(): string[] {
  const raw = process.env.APP_ORIGIN ?? "";
  // Tolera valores colados como link Markdown "[https://x](https://x)" ou com espaços/aspas:
  // extrai os endereços http(s) de verdade; sem esquema, assume https://.
  const found = raw.match(/https?:\/\/[^\s,\[\]()<>"']+/gi);
  const candidates = found?.length
    ? found
    : raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `https://${s}`);
  const origins = new Set<string>();
  for (const c of candidates) {
    try {
      const url = new URL(c.replace(/\/+$/, ""));
      if (url.hostname.includes(".") || url.hostname === "localhost") origins.add(url.origin);
    } catch {
      /* valor inválido: ignorado */
    }
  }
  return [...origins];
}

const firstHeaderValue = (v: string | string[] | null | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim() || undefined;

/**
 * Checagem anti-CSRF / Cross-Site WebSocket Hijacking: a origem precisa ser a própria aplicação.
 * Aceita se o Origin bater com APP_ORIGIN, com o Host, ou — atrás de proxy confiável (TRUST_PROXY=true) —
 * com o X-Forwarded-Host. O navegador da vítima não deixa um site atacante forjar o Origin.
 */
export function isAllowedOrigin(
  origin: string | null | undefined,
  host: string | string[] | null | undefined,
  forwardedHost?: string | string[] | null,
): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (configuredOrigins().includes(url.origin)) return true;
  const hosts = [firstHeaderValue(host)];
  if (process.env.TRUST_PROXY === "true") hosts.push(firstHeaderValue(forwardedHost));
  if (hosts.some((h) => h && h.toLowerCase() === url.host.toLowerCase())) return true;

  console.warn(
    `[csrf] Origem recusada: origin=${url.origin} host=${hosts.filter(Boolean).join("|") || "-"} ` +
      `APP_ORIGIN=${configuredOrigins().join("|") || "(vazio)"}`,
  );
  return false;
}
