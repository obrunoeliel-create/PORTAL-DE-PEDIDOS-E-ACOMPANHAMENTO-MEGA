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

export async function sendOrderUpdate(params: {
  event: OrderUpdateEvent;
  phone: string;
  customerName: string;
  orderNumber: number;
  total: string;
  trackingUrl: string;
}): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { ok: false, error: "WhatsApp automático não configurado" };

  const template = process.env[TEMPLATE_ENV[params.event]];
  if (!template) return { ok: false, error: `Modelo não configurado (${TEMPLATE_ENV[params.event]})` };

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
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: clean(params.customerName.split(" ")[0] || params.customerName) },
                { type: "text", text: String(params.orderNumber) },
                { type: "text", text: clean(params.total) },
                { type: "text", text: params.trackingUrl },
              ],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: `Meta: ${msg}`.slice(0, 300) };
    }
    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "TimeoutError" ? "Tempo esgotado ao falar com a Meta" : "Falha de rede ao enviar" };
  }
}
