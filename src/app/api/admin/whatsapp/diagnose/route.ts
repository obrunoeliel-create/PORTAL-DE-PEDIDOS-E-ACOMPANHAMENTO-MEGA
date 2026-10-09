import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GraphError = { message?: string; code?: number; error_subcode?: number };

async function graph(path: string, token: string) {
  const base = process.env.WHATSAPP_API_BASE ?? "https://graph.facebook.com";
  const version = process.env.WHATSAPP_API_VERSION ?? "v23.0";
  try {
    const res = await fetch(`${base}/${version}/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: GraphError };
    return { ok: res.ok, json };
  } catch (err) {
    return { ok: false, json: { error: { message: err instanceof Error ? err.message : "falha de rede" } as GraphError } };
  }
}

const errText = (e?: GraphError) => (e ? `${e.message ?? "erro"}${e.code ? ` (código ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : ""}` : null);

/**
 * Diagnóstico do WhatsApp automático (só gerente): confere com a Meta se o token é válido, quais
 * permissões e contas ele alcança, e se o ID do número configurado existe para esse token.
 * Nunca devolve o token.
 */
export async function GET() {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;

  const token = process.env.WHATSAPP_TOKEN ?? "";
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const config = {
    tokenPresent: !!token,
    tokenLength: token.length,
    tokenHasSpaces: /\s/.test(token),
    phoneNumberId: phoneId,
    templates: {
      accepted: process.env.WHATSAPP_TEMPLATE_ACCEPTED ?? null,
      outForDelivery: process.env.WHATSAPP_TEMPLATE_OUT_FOR_DELIVERY ?? null,
      readyPickup: process.env.WHATSAPP_TEMPLATE_READY_PICKUP ?? null,
      welcome: process.env.WHATSAPP_TEMPLATE_WELCOME ?? null,
    },
    lang: process.env.WHATSAPP_TEMPLATE_LANG ?? "pt_BR",
  };
  if (!token || !phoneId) return NextResponse.json({ config, problem: "WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurado." });

  // 1) O token: é válido? de que tipo? quais permissões e a quais contas dá acesso?
  const dbg = await graph(`debug_token?input_token=${encodeURIComponent(token)}`, token);
  const d = (dbg.json.data ?? {}) as {
    is_valid?: boolean;
    type?: string;
    app_id?: string;
    application?: string;
    expires_at?: number;
    scopes?: string[];
    granular_scopes?: { scope: string; target_ids?: string[] }[];
    error?: GraphError;
  };
  const tokenInfo = {
    error: errText(dbg.json.error) ?? errText(d.error),
    valid: d.is_valid ?? null,
    type: d.type ?? null,
    app: d.application ?? d.app_id ?? null,
    expires: d.expires_at === 0 ? "nunca" : d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
    scopes: d.scopes ?? [],
    whatsappAccountIds: [...new Set((d.granular_scopes ?? []).filter((g) => g.scope.startsWith("whatsapp_business")).flatMap((g) => g.target_ids ?? []))],
  };

  // 2) O ID do número configurado existe para este token?
  const phone = await graph(`${encodeURIComponent(phoneId)}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,status,platform_type,name_status,new_name_status,account_mode,is_pin_enabled,messaging_limit_tier,health_status`, token);
  const phoneInfo = phone.ok ? phone.json : { error: errText(phone.json.error) };

  // Contas do WhatsApp atribuídas ao usuário do sistema dono do token.
  const me = await graph("me?fields=id,name", token);
  const assigned = me.ok ? await graph(`${me.json.id}/assigned_whatsapp_business_accounts?fields=id,name`, token) : null;
  const assignedIds = assigned?.ok ? ((assigned.json.data as { id: string }[]) ?? []).map((a) => a.id) : [];
  const systemUser = { id: me.json.id ?? null, name: me.json.name ?? null, error: errText(me.json.error), assignedError: assigned && !assigned.ok ? errText(assigned.json.error) : null };

  // 3) Números e modelos de cada conta do WhatsApp que o token alcança (para achar o ID certo).
  const accounts = [];
  // A conta (WABA) dona do número configurado vem no "health_status" do próprio número.
  const health = (phone.json.health_status as { entities?: { entity_type: string; id: string }[] } | undefined)?.entities ?? [];
  const phoneWabaIds = health.filter((e) => e.entity_type === "WABA").map((e) => e.id);
  const businessIds = health.filter((e) => e.entity_type === "BUSINESS").map((e) => e.id);
  // Todas as contas do WhatsApp da empresa (para achar duplicidades do mesmo número).
  const owned = [];
  for (const b of businessIds.slice(0, 2)) {
    const r = await graph(`${b}/owned_whatsapp_business_accounts?fields=id,name`, token);
    if (r.ok) owned.push(...(((r.json.data as { id: string }[]) ?? []).map((a) => a.id)));
  }
  for (const id of [...new Set([...phoneWabaIds, ...tokenInfo.whatsappAccountIds, ...assignedIds, ...owned])].slice(0, 6)) {
    const [numbers, templates, self] = await Promise.all([
      graph(`${id}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,status`, token),
      graph(`${id}/message_templates?fields=name,status,category,language&limit=50`, token),
      graph(`${id}?fields=name`, token),
    ]);
    accounts.push({
      id,
      name: (self.json.name as string) ?? null,
      phoneNumbers: numbers.ok ? numbers.json.data : { error: errText(numbers.json.error) },
      templates: templates.ok ? templates.json.data : { error: errText(templates.json.error) },
    });
  }

  return NextResponse.json({ config, tokenInfo, systemUser, phoneInfo, phoneWabaIds, accounts });
}

/**
 * Registra o número configurado na Cloud API (o passo que tira o número de "Pendente").
 * Corpo: { "pin": "6 dígitos" } — o PIN vira a verificação em duas etapas do número. Só gerente.
 */
export async function POST(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const token = process.env.WHATSAPP_TOKEN ?? "";
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  if (!token || !phoneId) return NextResponse.json({ error: "WhatsApp não configurado." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!/^\d{6}$/.test(pin)) return NextResponse.json({ error: "Informe um PIN de 6 números." }, { status: 422 });

  const base = process.env.WHATSAPP_API_BASE ?? "https://graph.facebook.com";
  const version = process.env.WHATSAPP_API_VERSION ?? "v23.0";
  try {
    const res = await fetch(`${base}/${version}/${encodeURIComponent(phoneId)}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: GraphError & { error_data?: { details?: string } } };
    if (!res.ok) return NextResponse.json({ ok: false, error: errText(json.error), details: json.error?.error_data?.details ?? null }, { status: 502 });
    return NextResponse.json({ ok: json.success ?? true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "falha de rede" }, { status: 502 });
  }
}
