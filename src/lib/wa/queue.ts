import "server-only";
import { Prisma, type WaMessage } from "@prisma/client";
import { prisma } from "../prisma";
import { emitToStaff } from "../socket-server";
import { orderInclude, toBoardOrder } from "../orders";
import { couponLabel, createPersonalCoupon } from "../coupons";
import { configuredPublicUrl } from "../public-url";
import { sendOrderUpdate, whatsappCloudConfigured, type OrderUpdateEvent } from "../whatsapp-cloud";
import { robotConnected, robotSendText } from "./robot";
import { TEMPLATE_MAP, renderTemplate, withAutoNotice, type TemplateKey, type TemplateVars } from "./templates";

/**
 * Fila de mensagens do WhatsApp, guardada no banco (sobrevive a reinícios — não precisa de Redis
 * para o volume de uma loja). Regras:
 * - dedupeKey única: a mesma mensagem nunca é enviada duas vezes;
 * - pausa entre envios e limite por hora (reduz o risco de bloqueio do número);
 * - cliente que respondeu SAIR não recebe nada automático; cupom e campanha só com consentimento;
 * - aviso de pedido que ficou parado (robô desconectado) por mais de 3 h expira: não chega atrasado.
 */

export type EnqueueInput = {
  dedupeKey: string;
  kind: "STATUS" | "RATING" | "COUPON" | "CAMPAIGN" | "MANUAL" | "REPLY";
  phone: string;
  templateKey?: TemplateKey;
  vars?: TemplateVars;
  body?: string;
  orderId?: string;
  campaignId?: string;
  createdBy?: string;
  notBefore?: Date;
};

export async function enqueue(input: EnqueueInput): Promise<WaMessage | null> {
  try {
    const msg = await prisma.waMessage.create({
      data: {
        dedupeKey: input.dedupeKey,
        kind: input.kind,
        phone: input.phone,
        templateKey: input.templateKey ?? null,
        vars: (input.vars ?? {}) as Prisma.InputJsonValue,
        body: input.body ?? null,
        orderId: input.orderId ?? null,
        campaignId: input.campaignId ?? null,
        createdBy: input.createdBy ?? null,
        notBefore: input.notBefore ?? new Date(),
      },
    });
    kickQueue();
    return msg;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null; // já existe: não duplica
    throw err;
  }
}

const g = globalThis as unknown as { __waQueue?: { running: boolean; lastSendAt: number } };
const Q = (g.__waQueue ??= { running: false, lastSendAt: 0 });

export function kickQueue() {
  setImmediate(() => void processQueue().catch((err) => console.error("[whatsapp] fila:", err instanceof Error ? err.message : err)));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STALE_STATUS_MS = 3 * 60 * 60 * 1000;
const MARKETING = new Set(["COUPON", "CAMPAIGN"]);

/** Cupom e campanha só saem das 9h às 21h (horário de Brasília); avisos de pedido saem a qualquer hora. */
export function marketingHoursNow(d = new Date()): boolean {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(d));
  return h >= 9 && h < 21;
}

/** Texto do modelo: o do portal (se editado) ou o padrão. null = mensagem desativada. */
export async function templateBody(key: TemplateKey): Promise<string | null> {
  const row = await prisma.waTemplate.findUnique({ where: { key } });
  if (row) return row.active ? row.body : null;
  return TEMPLATE_MAP[key]?.body ?? null;
}

// Modelos aprovados na API oficial da Meta (reserva quando o robô está desconectado).
const META_FALLBACK: Partial<Record<TemplateKey, OrderUpdateEvent>> = {
  ORDER_PREPARING: "ACCEPTED",
  ORDER_OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  ORDER_READY_PICKUP: "READY_PICKUP",
};

async function finish(msg: WaMessage, data: Prisma.WaMessageUpdateInput) {
  const updated = await prisma.waMessage.update({ where: { id: msg.id }, data });
  emitToStaff("wa:message", { id: updated.id, status: updated.status });
  // Avisos de pedido: mantém o selo de WhatsApp do card do pedido no painel.
  if (msg.orderId && msg.kind === "STATUS" && (updated.status === "SENT" || updated.status === "FAILED")) {
    const sentAt = updated.sentAt ?? new Date();
    const orderData: Prisma.OrderUpdateInput =
      updated.status === "FAILED"
        ? { waError: updated.error?.slice(0, 200) ?? "falha no envio" }
        : msg.templateKey === "ORDER_PREPARING" || msg.templateKey === "ORDER_RECEIVED"
          ? { waAcceptedAt: sentAt, waError: null }
          : msg.templateKey === "ORDER_OUT_FOR_DELIVERY" || msg.templateKey === "ORDER_READY_PICKUP"
            ? { waDispatchedAt: sentAt, waError: null }
            : {};
    if (Object.keys(orderData).length) {
      const order = await prisma.order.update({ where: { id: msg.orderId }, data: orderData, include: orderInclude }).catch(() => null);
      if (order) emitToStaff("order:updated", toBoardOrder(order));
    }
  }
}

/** Monta o texto final (gera o cupom de volta na hora do envio). null = não enviar (motivo em `skip`). */
async function prepare(msg: WaMessage): Promise<{ text: string } | { skip: string }> {
  const contact = await prisma.waContact.findUnique({ where: { phone: msg.phone } });
  if (contact?.optOutAt && msg.kind !== "REPLY") return { skip: "Cliente pediu para não receber mensagens (SAIR)." };
  if (MARKETING.has(msg.kind) && !contact?.marketingOptIn) return { skip: "Cliente não aceitou receber promoções." };

  const vars = { ...(msg.vars as TemplateVars) };
  if (msg.kind === "COUPON" && msg.orderId && !msg.body) {
    // Se o cliente já voltou a pedir depois deste pedido, o cupom de "volte" não faz sentido.
    const base = await prisma.order.findUnique({ where: { id: msg.orderId }, select: { createdAt: true } });
    const newer = base && (await prisma.order.count({ where: { customerPhone: msg.phone, createdAt: { gt: base.createdAt }, status: { not: "CANCELED" } } }));
    if (newer) return { skip: "Cliente já fez outro pedido depois deste." };
    const cfg = await prisma.waConfig.findUniqueOrThrow({ where: { id: 1 } });
    const coupon = await createPersonalCoupon({
      prefix: cfg.couponPrefix,
      percent: cfg.couponPercent,
      validityDays: cfg.couponValidityDays,
      minOrder: cfg.couponMinOrder,
      phone: msg.phone,
      source: "COMEBACK",
    });
    vars.cupom = coupon.code;
    vars.desconto = couponLabel(coupon);
    vars.validade = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(coupon.validUntil);
  }
  vars.site ??= configuredPublicUrl();

  // Toda mensagem termina com o aviso de que este número é só de avisos automáticos.
  if (msg.body) return { text: withAutoNotice(renderTemplate(msg.body, vars)) };
  if (!msg.templateKey) return { skip: "Mensagem sem texto." };
  const body = await templateBody(msg.templateKey as TemplateKey);
  if (body === null) return { skip: "Esta mensagem automática está desativada no portal." };
  return { text: withAutoNotice(renderTemplate(body, vars)) };
}

/** Envia o que estiver na fila, respeitando pausa e limite por hora. Uma execução por vez. */
export async function processQueue() {
  if (Q.running) return;
  Q.running = true;
  try {
    const cfg = await prisma.waConfig.findUnique({ where: { id: 1 } });
    if (!cfg?.enabled) return;

    // Envio interrompido por reinício no meio: não reenvia às cegas (poderia duplicar).
    await prisma.waMessage.updateMany({
      where: { status: "SENDING", createdAt: { lt: new Date(Date.now() - 10 * 60_000) } },
      data: { status: "FAILED", error: "Envio interrompido (reinício do servidor). Use Reenviar se necessário." },
    });
    // Aviso de pedido parado há mais de 3 h: expira.
    await prisma.waMessage.updateMany({
      where: { status: "QUEUED", kind: "STATUS", notBefore: { lt: new Date(Date.now() - STALE_STATUS_MS) } },
      data: { status: "CANCELED", error: "Expirou: o WhatsApp da loja ficou desconectado." },
    });

    const robot = robotConnected();
    const meta = whatsappCloudConfigured();
    if (!robot && !meta) return;

    for (let i = 0; i < 25; i++) {
      const sentLastHour = await prisma.waMessage.count({ where: { sentAt: { gte: new Date(Date.now() - 3_600_000) } } });
      if (sentLastHour >= cfg.maxPerHour) return;

      const next = await prisma.waMessage.findFirst({
        where: {
          status: "QUEUED",
          notBefore: { lte: new Date() },
          // Sem o robô, só os avisos que têm modelo aprovado na Meta.
          ...(!robot && { kind: "STATUS", templateKey: { in: Object.keys(META_FALLBACK) } }),
          ...(robot && !marketingHoursNow() && { kind: { notIn: [...MARKETING] } }),
        },
        orderBy: [{ notBefore: "asc" }, { createdAt: "asc" }],
      });
      if (!next) return;
      const { count } = await prisma.waMessage.updateMany({ where: { id: next.id, status: "QUEUED" }, data: { status: "SENDING", attempts: { increment: 1 } } });
      if (!count) continue;

      const prep = await prepare(next).catch((err) => ({ skip: `Erro ao montar a mensagem: ${err instanceof Error ? err.message : err}` }));
      if ("skip" in prep) {
        await finish(next, { status: "CANCELED", error: prep.skip });
        continue;
      }

      // Pausa entre mensagens (com variação), para o envio parecer humano.
      const wait = Q.lastSendAt + cfg.minIntervalSeconds * 1000 + Math.floor(Math.random() * 2500) - Date.now();
      if (wait > 0) await sleep(wait);

      try {
        if (robotConnected()) {
          const sent = await robotSendText(next.phone, prep.text);
          await finish(next, { status: "SENT", sentAt: new Date(), body: prep.text, providerId: sent.id, provider: "ROBOT", error: null });
        } else {
          const event = META_FALLBACK[next.templateKey as TemplateKey];
          const order = next.orderId ? await prisma.order.findUnique({ where: { id: next.orderId } }) : null;
          if (!event || !order) throw new Error("WhatsApp da loja desconectado.");
          const vars = next.vars as TemplateVars;
          const r = await sendOrderUpdate({
            event,
            phone: next.phone,
            customerName: order.customerName,
            orderNumber: order.number,
            total: vars.valor ?? "",
            trackingUrl: vars.link ?? "",
          });
          if (!r.ok) throw new Error(r.error);
          await finish(next, { status: "SENT", sentAt: new Date(), body: prep.text, providerId: r.messageId ?? null, provider: "META", error: null });
        }
        Q.lastSendAt = Date.now();
        await prisma.waContact.upsert({ where: { phone: next.phone }, create: { phone: next.phone, lastContactAt: new Date() }, update: { lastContactAt: new Date() } });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Falha no envio.";
        const permanent = /não tem WhatsApp/.test(error);
        if (!permanent && next.attempts + 1 < 3) {
          await prisma.waMessage.update({
            where: { id: next.id },
            data: { status: "QUEUED", error, notBefore: new Date(Date.now() + 2 * 60_000 * (next.attempts + 1)) },
          });
        } else {
          await finish(next, { status: "FAILED", error });
        }
        if (!robotConnected() && !meta) return;
      }
    }
  } finally {
    Q.running = false;
  }
}

/** Reenvia uma mensagem (cria uma cópia na fila; a original fica no histórico). */
export async function resend(id: string, by: string) {
  const m = await prisma.waMessage.findUnique({ where: { id } });
  if (!m) throw new Error("Mensagem não encontrada.");
  return enqueue({
    dedupeKey: `resend:${m.id}:${Date.now()}`,
    kind: m.kind === "STATUS" ? "MANUAL" : (m.kind as EnqueueInput["kind"]),
    phone: m.phone,
    templateKey: (m.templateKey as TemplateKey) ?? undefined,
    vars: m.vars as TemplateVars,
    body: m.body ?? undefined,
    orderId: m.orderId ?? undefined,
    createdBy: by,
  });
}
