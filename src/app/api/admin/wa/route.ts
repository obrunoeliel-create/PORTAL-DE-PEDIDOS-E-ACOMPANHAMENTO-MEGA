import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { logout, reconnect, requestQr, robotSnapshot } from "@/lib/wa/robot";
import { kickQueue, marketingHoursNow } from "@/lib/wa/queue";
import { whatsappCloudConfigured } from "@/lib/whatsapp-cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meia-noite de hoje no horário de Brasília (UTC-3). */
function startOfTodayBrt() {
  const d = new Date(Date.now() - 3 * 3_600_000);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + 3 * 3_600_000);
}

/** Tela "WhatsApp" do portal: conexão, configuração, indicadores do dia e últimos eventos. */
export async function GET() {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;

  const today = startOfTodayBrt();
  const [config, byStatus, queued, activeOrders, done, events, ratings] = await Promise.all([
    prisma.waConfig.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.waMessage.groupBy({ by: ["status"], where: { createdAt: { gte: today } }, _count: { _all: true } }),
    prisma.waMessage.count({ where: { status: { in: ["QUEUED", "SENDING"] }, notBefore: { lte: new Date() } } }),
    prisma.order.count({ where: { status: { in: ["PENDING", "PREPARING", "OUT_FOR_DELIVERY"] }, type: { not: "TABLE" } } }),
    prisma.order.findMany({
      where: { completedAt: { gte: today }, type: { not: "TABLE" }, status: "COMPLETED" },
      select: { createdAt: true, completedAt: true },
    }),
    prisma.waEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.orderRating.aggregate({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _avg: { stars: true }, _count: { _all: true } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const avgMinutes = done.length
    ? Math.round(done.reduce((sum, o) => sum + (o.completedAt!.getTime() - o.createdAt.getTime()), 0) / done.length / 60_000)
    : null;
  const { leaseOwner: _o, leaseUntil: _u, ...cfg } = config;

  return NextResponse.json({
    robot: robotSnapshot(),
    config: cfg,
    metaFallback: whatsappCloudConfigured(),
    marketingHours: marketingHoursNow(),
    stats: {
      // "Enviadas" inclui as que já chegaram e as já lidas.
      sent: count("SENT") + count("DELIVERED") + count("READ"),
      delivered: count("DELIVERED") + count("READ"),
      read: count("READ"),
      failed: count("FAILED"),
      canceled: count("CANCELED"),
      queued,
      activeOrders,
      avgMinutes,
      ratingAvg: ratings._avg.stars ? Math.round(ratings._avg.stars * 10) / 10 : null,
      ratingCount: ratings._count._all,
    },
    events: events.map((e) => ({ id: e.id, kind: e.kind, detail: e.detail, at: e.createdAt })),
  });
}

const actionSchema = z.object({ action: z.enum(["connect", "reconnect", "logout"]) }).strict();

/** Conectar (gera o QR Code), reconectar ou desconectar/trocar o número. */
export async function POST(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readJson(req, 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const a = parsed.data.action;
  if (a === "connect") return NextResponse.json({ robot: await requestQr() });
  if (a === "reconnect") return NextResponse.json({ robot: await reconnect() });
  await logout(auth.user.name);
  return NextResponse.json({ robot: robotSnapshot() });
}

const configSchema = z
  .object({
    enabled: z.boolean(),
    ratingEnabled: z.boolean(),
    ratingDelayHours: z.number().int().min(1).max(72),
    couponEnabled: z.boolean(),
    couponDelayDays: z.number().int().min(1).max(60),
    couponPercent: z.number().int().min(1).max(50),
    couponValidityDays: z.number().int().min(1).max(90),
    couponPrefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/, "Use só letras (2 a 10)."),
    couponMinOrder: z.number().int().min(0).max(100_000),
    deliveryEta: z.string().trim().min(2).max(40),
    minIntervalSeconds: z.number().int().min(3).max(120),
    maxPerHour: z.number().int().min(10).max(400),
  })
  .partial()
  .strict();

/** Liga/desliga o envio e ajusta as automações (avaliação, cupom, ritmo). */
export async function PATCH(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readJson(req, 4096);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const config = await prisma.waConfig.update({ where: { id: 1 }, data: parsed.data });
  await prisma.waEvent.create({ data: { kind: "CONFIG", detail: `Configuração alterada por ${auth.user.name}: ${Object.keys(parsed.data).join(", ")}` } });
  if (parsed.data.enabled) kickQueue();
  const { leaseOwner: _o, leaseUntil: _u, ...cfg } = config;
  return NextResponse.json({ config: cfg });
}
