import "server-only";
import { headers } from "next/headers";
import { configuredOrigins } from "./jwt";

/** Primeira origem válida do APP_ORIGIN (mesma interpretação da checagem anti-CSRF). */
export function configuredPublicUrl(): string {
  return configuredOrigins()[0] ?? "";
}

/** URL pública do site: APP_ORIGIN, ou o host da requisição atual (páginas do servidor). */
export async function publicUrlFromRequest(): Promise<string> {
  const configured = configuredPublicUrl();
  if (configured) return configured;
  const h = await headers();
  const host = (process.env.TRUST_PROXY === "true" && h.get("x-forwarded-host")) || h.get("host") || "localhost:3000";
  const proto = process.env.TRUST_PROXY === "true" ? h.get("x-forwarded-proto") ?? "https" : host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
