import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { RateLimitResult } from "./rate-limit";

/**
 * IP do cliente. O server.ts SOBRESCREVE `x-real-ip` com o IP do socket
 * (ou do X-Forwarded-For quando TRUST_PROXY=true), então o cliente não consegue forjá-lo.
 */
export function getClientIp(req: Request): string {
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function jsonError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

export function tooManyRequests(result: Extract<RateLimitResult, { ok: false }>) {
  return jsonError("Muitas requisições. Tente novamente em instantes.", 429, {
    "Retry-After": String(result.retryAfterSec),
  });
}

export class PayloadError extends Error {}

/** Lê o corpo como JSON com limite de tamanho (evita payloads gigantes). */
export async function readJson(req: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new PayloadError("Payload muito grande.");
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new PayloadError("Content-Type deve ser application/json.");
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new PayloadError("Payload muito grande.");
  try {
    return JSON.parse(text);
  } catch {
    throw new PayloadError("JSON inválido.");
  }
}

/** Resposta 422 com erros por campo — sem ecoar os valores recebidos. */
export function validationError(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    fields[path] ??= issue.message;
  }
  return NextResponse.json({ error: "Dados inválidos.", fields }, { status: 422 });
}
