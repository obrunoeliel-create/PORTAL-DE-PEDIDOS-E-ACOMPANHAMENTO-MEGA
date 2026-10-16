import { NextResponse } from "next/server";
import { getClientIp, jsonError, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import type { CepAddress } from "@/lib/cep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Lookup = (cep: string) => Promise<CepAddress | null>;

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" }, cache: "no-store" });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// ViaCEP primeiro; se estiver fora do ar, BrasilAPI.
const viaCep: Lookup = async (cep) => {
  const j = await getJson(`https://viacep.com.br/ws/${cep}/json/`);
  if (!j || j.erro) return null;
  return { cep, street: str(j.logradouro), district: str(j.bairro), city: str(j.localidade), uf: str(j.uf) };
};
const brasilApi: Lookup = async (cep) => {
  const j = await getJson(`https://brasilapi.com.br/api/cep/v1/${cep}`);
  if (!j) return null;
  return { cep, street: str(j.street), district: str(j.neighborhood), city: str(j.city), uf: str(j.state) };
};

/**
 * Endereço a partir do CEP (cadastro do cliente, carrinho e pedido lançado pela loja).
 * Passa pelo servidor para não depender do navegador do cliente acessar serviços de fora.
 */
export async function GET(req: Request, { params }: { params: Promise<{ cep: string }> }) {
  const rl = rateLimit(`cep:${getClientIp(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl);

  const cep = (await params).cep.replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) return jsonError("CEP inválido.", 400);

  for (const lookup of [viaCep, brasilApi]) {
    try {
      const address = await lookup(cep);
      if (address) return NextResponse.json({ address }, { headers: { "Cache-Control": "public, max-age=86400" } });
      return jsonError("CEP não encontrado. Confira o número ou preencha o endereço.", 404);
    } catch {
      // serviço fora do ar: tenta o próximo
    }
  }
  return jsonError("Busca de CEP indisponível agora. Preencha o endereço.", 503);
}
