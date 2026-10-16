import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, WaMessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { enqueue } from "@/lib/wa/queue";
import { normalizePhone, touchContact } from "@/lib/wa/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "CANCELED"];
const PAGE = 40;

/** Histórico de envios com busca (telefone, nome, nº do pedido ou texto) e filtros. */
export async function GET(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const status = sp.get("status") ?? "";
  const kind = sp.get("kind") ?? "";
  const page = Math.max(0, Math.min(200, Number(sp.get("page")) || 0));

  const where: Prisma.WaMessageWhereInput = {};
  if (STATUSES.includes(status)) where.status = status as WaMessageStatus;
  if (/^[A-Z]{4,10}$/.test(kind)) where.kind = kind;
  if (q) {
    const or: Prisma.WaMessageWhereInput[] = [{ body: { contains: q, mode: "insensitive" } }];
    const digits = q.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if (digits.length >= 4) or.push({ phone: { contains: digits } });
    if (/^\d{1,7}$/.test(q)) {
      const orders = await prisma.order.findMany({ where: { number: Number(q) }, select: { id: true } });
      if (orders.length) or.push({ orderId: { in: orders.map((o) => o.id) } });
    }
    const contacts = await prisma.waContact.findMany({ where: { name: { contains: q, mode: "insensitive" } }, select: { phone: true }, take: 50 });
    if (contacts.length) or.push({ phone: { in: contacts.map((c) => c.phone) } });
    where.OR = or;
  }

  const [rows, total] = await Promise.all([
    prisma.waMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * PAGE, take: PAGE }),
    prisma.waMessage.count({ where }),
  ]);
  const phones = [...new Set(rows.map((r) => r.phone))];
  const orderIds = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => !!x))];
  const [contacts, orders] = await Promise.all([
    prisma.waContact.findMany({ where: { phone: { in: phones } }, select: { phone: true, name: true } }),
    prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } }),
  ]);
  const nameOf = new Map(contacts.map((c) => [c.phone, c.name]));
  const numberOf = new Map(orders.map((o) => [o.id, o.number]));

  return NextResponse.json({
    total,
    pageSize: PAGE,
    messages: rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      templateKey: m.templateKey,
      phone: m.phone,
      name: nameOf.get(m.phone) ?? null,
      orderNumber: m.orderId ? (numberOf.get(m.orderId) ?? null) : null,
      body: m.body,
      status: m.status,
      error: m.error,
      provider: m.provider,
      createdBy: m.createdBy,
      createdAt: m.createdAt,
      notBefore: m.notBefore,
      sentAt: m.sentAt,
      deliveredAt: m.deliveredAt,
      readAt: m.readAt,
    })),
  });
}

const sendSchema = z
  .object({
    phone: z.string().max(30),
    name: z.string().trim().max(80).optional(),
    text: z.string().trim().min(1, "Escreva a mensagem.").max(1500, "Máximo de 1500 caracteres."),
  })
  .strict();

/** Envio manual para um cliente (entra na fila, respeitando a pausa entre mensagens). */
export async function POST(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readJson(req, 8 * 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: "Telefone inválido.", fields: { phone: "Informe o WhatsApp com DDD." } }, { status: 422 });
  const contact = await prisma.waContact.findUnique({ where: { phone } });
  if (contact?.optOutAt) return jsonError("Este cliente pediu para não receber mensagens (respondeu SAIR).", 409);
  await touchContact(phone, parsed.data.name || null);
  const msg = await enqueue({ dedupeKey: `manual:${phone}:${Date.now()}`, kind: "MANUAL", phone, body: parsed.data.text, createdBy: auth.user.name });
  return NextResponse.json({ id: msg?.id ?? null }, { status: 201 });
}
