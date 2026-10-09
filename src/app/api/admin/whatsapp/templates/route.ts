import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Modelos de mensagem que o sistema usa. Variáveis: pedidos = {{1}} nome, {{2}} nº, {{3}} total, {{4}} link.
const ORDER_EXAMPLE = ["Maria", "123", "R$ 45,00", "https://megaesfihajurema.com/pedido/exemplo"];
const TEMPLATES: { name: string; text: string; example: string[] }[] = [
  {
    name: "pedido_aceito_v2",
    text: "Olá, {{1}}! Seu pedido nº {{2}} na Mega Esfiha Jurema foi aceito e já está em preparo. Total: {{3}}. Acompanhe por aqui: {{4}} Obrigado pela preferência!",
    example: ORDER_EXAMPLE,
  },
  {
    name: "pedido_saiu_entrega_v2",
    text: "Olá, {{1}}! Seu pedido nº {{2}} saiu para entrega. Total: {{3}}. Acompanhe por aqui: {{4}} Bom apetite!",
    example: ORDER_EXAMPLE,
  },
  {
    name: "pedido_pronto_retirada_v2",
    text: "Olá, {{1}}! Seu pedido nº {{2}} está pronto para retirada no balcão. Total: {{3}}. Detalhes: {{4}} Esperamos você!",
    example: ORDER_EXAMPLE,
  },
  {
    name: "cadastro_confirmado",
    text: "Olá, {{1}}! Seu cadastro na Mega Esfiha Jurema foi confirmado. A partir de agora seus dados ficam salvos para você pedir mais rápido pelo nosso site. Seja bem-vindo(a) e obrigado pela preferência!",
    example: ["Maria"],
  },
];

/**
 * Cria na conta do WhatsApp informada (WABA) os modelos de mensagem do sistema que ainda não existem lá.
 * Corpo: { "wabaId": "..." }. Só gerente. A Meta ainda analisa cada modelo antes de liberar.
 */
export async function POST(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const token = process.env.WHATSAPP_TOKEN ?? "";
  if (!token) return NextResponse.json({ error: "WhatsApp não configurado." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { wabaId?: unknown };
  const wabaId = typeof body.wabaId === "string" ? body.wabaId : "";
  if (!/^[0-9]{8,24}$/.test(wabaId)) return NextResponse.json({ error: "Informe o ID da conta do WhatsApp." }, { status: 422 });

  const base = process.env.WHATSAPP_API_BASE ?? "https://graph.facebook.com";
  const version = process.env.WHATSAPP_API_VERSION ?? "v23.0";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const existingRes = await fetch(`${base}/${version}/${wabaId}/message_templates?fields=name,status,language&limit=100`, { headers, signal: AbortSignal.timeout(15_000) });
  const existingJson = (await existingRes.json().catch(() => ({}))) as { data?: { name: string; status: string }[]; error?: { message?: string; code?: number } };
  if (!existingRes.ok) return NextResponse.json({ error: `${existingJson.error?.message ?? "erro"} (código ${existingJson.error?.code ?? existingRes.status})` }, { status: 502 });
  const existing = new Map((existingJson.data ?? []).map((t) => [t.name, t.status]));

  const results = [];
  for (const t of TEMPLATES) {
    if (existing.has(t.name)) {
      results.push({ name: t.name, result: `já existe (${existing.get(t.name)})` });
      continue;
    }
    const res = await fetch(`${base}/${version}/${wabaId}/message_templates`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: t.name,
        language: process.env.WHATSAPP_TEMPLATE_LANG ?? "pt_BR",
        category: "UTILITY",
        components: [{ type: "BODY", text: t.text, example: { body_text: [t.example] } }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string; category?: string; error?: { message?: string; code?: number; error_user_msg?: string } };
    results.push({
      name: t.name,
      result: res.ok ? `criado: ${json.status ?? "enviado para análise"}${json.category ? ` · ${json.category}` : ""}` : `erro: ${json.error?.error_user_msg ?? json.error?.message ?? res.status} (código ${json.error?.code ?? "-"})`,
    });
  }
  return NextResponse.json({ wabaId, results });
}
