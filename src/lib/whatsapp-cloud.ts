import "server-only";

/**
 * Envio automático pela API oficial do WhatsApp Business (Meta Cloud API).
 *
 * Mensagens iniciadas pela loja exigem MODELOS (templates) aprovados pela Meta, categoria "Utilidade",
 * idioma pt_BR, com 4 variáveis no corpo: {{1}} nome, {{2}} nº do pedido, {{3}} total, {{4}} link.
 * Sem as variáveis de ambiente abaixo, nada é enviado (o painel mostra o aviso e o botão manual continua).
 *
 *   WHATSAPP_TOKEN                     token permanente (usuário do sistema)
 *   WHATSAPP_PHONE_NUMBER_ID           ID do número da loja na Meta
 *   WHATSAPP_TEMPLATE_ACCEPTED         ex: pedido_aceito
 *   WHATSAPP_TEMPLATE_OUT_FOR_DELIVERY ex: pedido_saiu_entrega
 *   WHATSAPP_TEMPLATE_READY_PICKUP     ex: pedido_pronto_retirada
 *   WHATSAPP_TEMPLATE_WELCOME          ex: cadastro_confirmado (1 variável: {{1}} nome)
 *   WHATSAPP_TEMPLATE_LANG             padrão pt_BR
 *   WHATSAPP_API_VERSION               padrão v23.0
 */

export type OrderUpdateEvent = "ACCEPTED" | "OUT_FOR_DELIVERY" | "READY_PICKUP";

const TEMPLATE_ENV: Record<OrderUpdateEvent, string> = {
  ACCEPTED: "WHATSAPP_TEMPLATE_ACCEPTED",
  OUT_FOR_DELIVERY: "WHATSAPP_TEMPLATE_OUT_FOR_DELIVERY",
  READY_PICKUP: "WHATSAPP_TEMPLATE_READY_PICKUP",
};

export type SendResult = { ok: true; messageId?: string } | { ok: false; error: string };

export function whatsappCloudConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Número com DDI 55, só dígitos (formato aceito pela Cloud API). */
function toE164Digits(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  const full = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return /^55\d{10,11}$/.test(full) ? full : null;
}

/**
 * Envia um MODELO aprovado pela Meta com as variáveis do corpo ({{1}}, {{2}}...) na ordem dada.
 * Nunca lança erro: devolve ok/erro para quem chamou registrar.
 */
export async function sendTemplate(params: { phone: string; template: string | undefined; templateEnv: string; bodyParams: string[] }): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { ok: false, error: "WhatsApp automático não configurado" };
  if (!params.template) return { ok: false, error: `Modelo não configurado (${params.templateEnv})` };

  const to = toE164Digits(params.phone);
  if (!to) return { ok: false, error: "Telefone do cliente inválido" };

  // Parâmetros de modelo não aceitam quebras de linha nem 4+ espaços seguidos.
  const clean = (v: string) => v.replace(/\s+/g, " ").trim().slice(0, 200);
  const base = process.env.WHATSAPP_API_BASE ?? "https://graph.facebook.com";
  const version = process.env.WHATSAPP_API_VERSION ?? "v23.0";

  try {
    const res = await fetch(`${base}/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: params.template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "pt_BR" },
          components: [{ type: "body", parameters: params.bodyParams.map((text) => ({ type: "text", text: clean(text) })) }],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } };
    };
    if (!res.ok) {
      // Código + detalhe da Meta ajudam a achar a causa (ex: token sem permissão, modelo inexistente).
      const e = data.error;
      const code = e?.code ? ` (código ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : "";
      const msg = `${e?.message ?? `HTTP ${res.status}`}${code}${e?.error_data?.details ? ` — ${e.error_data.details}` : ""}`;
      return { ok: false, error: `Meta: ${msg}`.slice(0, 300) };
    }
    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "TimeoutError" ? "Tempo esgotado ao falar com a Meta" : "Falha de rede ao enviar" };
  }
}

/** Aviso de andamento do pedido: {{1}} nome, {{2}} nº do pedido, {{3}} total, {{4}} link. */
export async function sendOrderUpdate(params: {
  event: OrderUpdateEvent;
  phone: string;
  customerName: string;
  orderNumber: number;
  total: string;
  trackingUrl: string;
}): Promise<SendResult> {
  const templateEnv = TEMPLATE_ENV[params.event];
  return sendTemplate({
    phone: params.phone,
    template: process.env[templateEnv],
    templateEnv,
    bodyParams: [params.customerName.split(" ")[0] || params.customerName, String(params.orderNumber), params.total, params.trackingUrl],
  });
}

/** Boas-vindas do cadastro: {{1}} primeiro nome. Modelo em WHATSAPP_TEMPLATE_WELCOME (ex: cadastro_confirmado). */
export async function sendWelcomeWhatsApp(params: { phone: string; customerName: string }): Promise<SendResult> {
  return sendTemplate({
    phone: params.phone,
    template: process.env.WHATSAPP_TEMPLATE_WELCOME,
    templateEnv: "WHATSAPP_TEMPLATE_WELCOME",
    bodyParams: [params.customerName.split(" ")[0] || params.customerName],
  });
}
