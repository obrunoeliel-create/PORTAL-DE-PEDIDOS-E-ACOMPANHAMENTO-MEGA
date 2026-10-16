import "server-only";
import type { Order } from "@prisma/client";
import { prisma } from "../prisma";
import { formatBRL } from "../money";
import { configuredPublicUrl } from "../public-url";
import { enqueue } from "./queue";
import { onOrderRated } from "../club/core";
import { HUMAN_WHATSAPP, firstName, type TemplateKey, type TemplateVars } from "./templates";

/**
 * Automações do robô do WhatsApp:
 * - aviso a cada mudança de status do pedido (delivery e balcão com telefone);
 * - pedido de avaliação X horas depois de concluído;
 * - cupom "volte sempre" X dias depois (só para quem aceitou promoções);
 * - respostas do cliente: SAIR, VOLTAR e nota de 1 a 5;
 * - campanhas para clientes que aceitaram promoções.
 */

export type OrderEvent = "CREATED" | "PREPARING" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELED";

/** "(11) 91234-5678" / "5511912345678" → "11912345678". */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return /^\d{10,11}$/.test(d) ? d : null;
}

/** Registra o contato e, se o cliente marcou, o consentimento para promoções. */
export async function touchContact(phone: string, name: string | null, marketingOptIn?: boolean) {
  const now = new Date();
  await prisma.waContact.upsert({
    where: { phone },
    create: { phone, name, marketingOptIn: !!marketingOptIn, optInAt: marketingOptIn ? now : null },
    update: { ...(name && { name }), ...(marketingOptIn && { marketingOptIn: true, optInAt: now }) },
  });
}

function orderVars(order: Order, eta: string): TemplateVars {
  return {
    nome: firstName(order.customerName),
    pedido: String(order.number),
    valor: formatBRL(order.total),
    link: `${configuredPublicUrl()}/pedido/${order.trackingToken}`,
    tempo: eta,
    site: configuredPublicUrl(),
  };
}

/** Mudança no pedido → mensagens na fila. Nunca lança erro (não pode atrapalhar o pedido). */
export async function onOrderEvent(orderId: string, event: OrderEvent, extra: TemplateVars = {}): Promise<void> {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.type === "TABLE" || !order.whatsappUpdates) return;
    const phone = normalizePhone(order.customerPhone);
    if (!phone) return;
    const cfg = await prisma.waConfig.findUnique({ where: { id: 1 } });
    if (!cfg) return;

    let key: TemplateKey | null = null;
    if (event === "CREATED") key = order.status === "PENDING" ? "ORDER_RECEIVED" : "ORDER_PREPARING";
    else if (event === "PREPARING") key = "ORDER_PREPARING";
    else if (event === "OUT_FOR_DELIVERY") key = order.type === "DELIVERY" ? "ORDER_OUT_FOR_DELIVERY" : "ORDER_READY_PICKUP";
    else if (event === "COMPLETED") key = order.type === "DELIVERY" ? "ORDER_DELIVERED" : "ORDER_PICKED_UP";
    else if (event === "CANCELED") key = "ORDER_CANCELED";
    if (!key) return;

    await touchContact(phone, order.customerName);
    const vars = { ...orderVars(order, cfg.deliveryEta), ...extra };
    await enqueue({ dedupeKey: `order:${order.id}:${key}`, kind: "STATUS", phone, templateKey: key, vars, orderId: order.id });

    if (event === "CANCELED") {
      // Pedido cancelado: avaliação e cupom agendados deixam de valer.
      await prisma.waMessage.updateMany({
        where: { orderId: order.id, status: "QUEUED", kind: { in: ["RATING", "COUPON"] } },
        data: { status: "CANCELED", error: "Pedido cancelado." },
      });
    }

    if (event === "COMPLETED") {
      const now = Date.now();
      if (cfg.ratingEnabled) {
        await enqueue({
          dedupeKey: `rating:${order.id}`,
          kind: "RATING",
          phone,
          templateKey: "RATING_REQUEST",
          vars,
          orderId: order.id,
          notBefore: new Date(now + cfg.ratingDelayHours * 3_600_000),
        });
      }
      if (cfg.couponEnabled) {
        // O consentimento é conferido de novo na hora do envio.
        await enqueue({
          dedupeKey: `coupon:${order.id}`,
          kind: "COUPON",
          phone,
          templateKey: "COUPON_COMEBACK",
          vars,
          orderId: order.id,
          notBefore: new Date(now + cfg.couponDelayDays * 86_400_000),
        });
      }
    }
  } catch (err) {
    console.error("[whatsapp] automação do pedido:", err instanceof Error ? err.message : err);
  }
}

const STARS = ["", "⭐", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐"];

/** Nota a partir da resposta: "5", "nota 4", "⭐⭐⭐". */
function parseStars(text: string): number | null {
  const t = text.trim();
  const digit = t.match(/^(?:nota\s*)?([1-5])(?:\s*estrelas?)?[.!]?$/i);
  if (digit) return Number(digit[1]);
  const stars = [...t.matchAll(/⭐/g)].length;
  return stars >= 1 && stars <= 5 && t.replace(/⭐|\s/g, "") === "" ? stars : null;
}

/** Resposta do cliente no WhatsApp da loja. */
export async function handleIncoming(phone: string, text: string, pushName: string | null) {
  const t = text.trim();
  const lower = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const contact = await prisma.waContact.findUnique({ where: { phone } });
  const nome = firstName(contact?.name ?? pushName ?? "");
  const day = new Date().toISOString().slice(0, 10);

  if (/^(sair|parar|pare|stop|descadastrar|cancelar mensagens)$/.test(lower)) {
    await prisma.waContact.upsert({
      where: { phone },
      create: { phone, name: pushName, optOutAt: new Date(), marketingOptIn: false },
      update: { optOutAt: new Date(), marketingOptIn: false },
    });
    await prisma.waMessage.updateMany({ where: { phone, status: "QUEUED", kind: { not: "REPLY" } }, data: { status: "CANCELED", error: "Cliente respondeu SAIR." } });
    await prisma.waEvent.create({ data: { kind: "OPT_OUT", detail: `***${phone.slice(-4)} pediu para sair` } });
    await enqueue({ dedupeKey: `optout:${phone}:${day}`, kind: "REPLY", phone, templateKey: "OPT_OUT_CONFIRM", vars: { nome } });
    return;
  }
  if (/^voltar$/.test(lower)) {
    await prisma.waContact.upsert({ where: { phone }, create: { phone, name: pushName }, update: { optOutAt: null } });
    await prisma.waEvent.create({ data: { kind: "OPT_IN", detail: `***${phone.slice(-4)} voltou a receber` } });
    await enqueue({ dedupeKey: `optin:${phone}:${day}`, kind: "REPLY", phone, body: `Que bom ter você de volta, ${nome || "cliente"}! 🍕 Você voltou a receber os avisos dos seus pedidos.` });
    return;
  }

  const stars = parseStars(t);
  if (stars) {
    // Nota vale para o pedido cujo pedido de avaliação foi enviado nos últimos 3 dias e ainda não tem nota.
    const ask = await prisma.waMessage.findFirst({
      where: { phone, kind: "RATING", status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { gte: new Date(Date.now() - 3 * 86_400_000) }, orderId: { not: null } },
      orderBy: { sentAt: "desc" },
    });
    if (ask?.orderId && !(await prisma.orderRating.findUnique({ where: { orderId: ask.orderId } }))) {
      await prisma.orderRating.create({ data: { orderId: ask.orderId, stars, source: "WHATSAPP" } });
      await onOrderRated(ask.orderId);
      await prisma.waEvent.create({ data: { kind: "RATING", detail: `***${phone.slice(-4)} deu nota ${stars}` } });
      await enqueue({ dedupeKey: `rating-thanks:${ask.orderId}`, kind: "REPLY", phone, templateKey: "RATING_THANKS", vars: { nome, estrelas: STARS[stars] } });
      return;
    }
  }

  // Qualquer outra mensagem: este número não tem atendimento humano — indica o WhatsApp oficial
  // (no máximo uma vez a cada 12 horas por cliente, para não virar conversa com o robô).
  if (contact?.optOutAt) return;
  const halfDay = Math.floor(Date.now() / (12 * 3_600_000));
  await enqueue({
    dedupeKey: `human:${phone}:${halfDay}`,
    kind: "REPLY",
    phone,
    body: `Oi${nome ? `, ${nome}` : ""}! 👋 Este número é só para avisos automáticos dos pedidos da Mega Esfiha Jurema e as mensagens enviadas aqui não são lidas.\n\nPara falar com a gente (pedidos, dúvidas, reclamações), chame no WhatsApp oficial da loja: *${HUMAN_WHATSAPP}* 📲`,
  });
}

/** Destinatários da campanha: só quem aceitou promoções e não pediu para sair. */
export async function campaignAudience(audience: string, inactiveDays?: number | null) {
  const contacts = await prisma.waContact.findMany({ where: { marketingOptIn: true, optOutAt: null }, select: { phone: true, name: true } });
  if (audience === "OPTIN_ALL" || contacts.length === 0) return contacts;

  const stats = await prisma.order.groupBy({
    by: ["customerPhone"],
    where: { customerPhone: { in: contacts.map((c) => c.phone) }, status: { not: "CANCELED" } },
    _count: { _all: true },
    _sum: { total: true },
    _max: { createdAt: true },
  });
  const byPhone = new Map(stats.map((s) => [s.customerPhone, s]));
  if (audience === "INACTIVE") {
    const limit = Date.now() - (inactiveDays ?? 30) * 86_400_000;
    return contacts.filter((c) => {
      const last = byPhone.get(c.phone)?._max.createdAt;
      return !!last && last.getTime() < limit;
    });
  }
  if (audience === "VIP") {
    return contacts.filter((c) => {
      const s = byPhone.get(c.phone);
      return !!s && isVip(s._count._all, s._sum.total ?? 0);
    });
  }
  return contacts;
}

/** Cliente VIP: 5 pedidos ou mais, ou R$ 500,00 ou mais no total. */
export const isVip = (orders: number, total: number) => orders >= 5 || total >= 50_000;

/** Coloca a campanha na fila (uma mensagem por cliente; a fila controla o ritmo). */
export async function startCampaign(campaignId: string, by: string) {
  const c = await prisma.waCampaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new Error("Campanha não encontrada.");
  if (c.status !== "DRAFT") throw new Error("Esta campanha já foi enviada.");
  const people = await campaignAudience(c.audience, c.inactiveDays);
  const coupon = c.couponCode ? await prisma.coupon.findUnique({ where: { code: c.couponCode } }) : null;
  for (const p of people) {
    await enqueue({
      dedupeKey: `campaign:${c.id}:${p.phone}`,
      kind: "CAMPAIGN",
      phone: p.phone,
      body: c.body,
      vars: {
        nome: firstName(p.name ?? ""),
        cupom: coupon?.code ?? "",
        desconto: coupon ? (coupon.kind === "PERCENT" ? `${coupon.value}%` : formatBRL(coupon.value)) : "",
        validade: coupon ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(coupon.validUntil) : "",
        site: configuredPublicUrl(),
      },
      campaignId: c.id,
      createdBy: by,
    });
  }
  await prisma.waCampaign.update({ where: { id: c.id }, data: { status: "SENDING", total: people.length, startedAt: new Date() } });
  return people.length;
}
