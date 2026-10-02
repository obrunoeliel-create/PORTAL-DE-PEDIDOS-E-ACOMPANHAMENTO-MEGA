import "server-only";
import { headers } from "next/headers";

/** Primeira origem configurada em APP_ORIGIN (aceita sem esquema; assume https). */
export function configuredPublicUrl(): string {
  const first = (process.env.APP_ORIGIN ?? "").split(",")[0]?.trim().replace(/\/+$/, "");
  if (!first) return "";
  return /^https?:\/\//i.test(first) ? first : `https://${first}`;
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
