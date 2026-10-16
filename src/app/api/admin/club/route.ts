import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { brtParts, getClubConfig, getTiers } from "@/lib/club/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Painel do Clube: indicadores, gráficos e o "módulo inteligente" (regras sobre o histórico):
 * clientes em risco de sumir, VIPs, melhor dia/horário para campanhas e sugestões.
 */
export async function GET() {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const now = Date.now();
  const d30 = new Date(now - 30 * DAY);
  const d60 = new Date(now - 60 * DAY);
  const d90 = new Date(now - 90 * DAY);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(3, 0, 0, 0);
  const { month } = brtParts();

  const [cfg, tiers, members, newMembers, activeMembers, byTier, issued, used, redemptions30, orders90, birthdays, top, campaignsActive] = await Promise.all([
    getClubConfig(),
    getTiers(),
    prisma.customer.count({ where: { clubJoinedAt: { not: null } } }),
    prisma.customer.count({ where: { clubJoinedAt: { gte: monthStart } } }),
    prisma.customer.count({ where: { clubJoinedAt: { not: null }, lastOrderAt: { gte: d60 } } }),
    prisma.customer.groupBy({ by: ["tier"], where: { clubJoinedAt: { not: null } }, _count: { _all: true } }),
    prisma.pointsEntry.aggregate({ where: { createdAt: { gte: d30 }, delta: { gt: 0 }, kind: { not: "REDEEM_REFUND" } }, _sum: { delta: true } }),
    prisma.pointsEntry.aggregate({ where: { createdAt: { gte: d30 }, kind: "REDEEM" }, _sum: { delta: true } }),
    prisma.redemption.groupBy({ by: ["status"], where: { createdAt: { gte: d30 } }, _count: { _all: true } }),
    prisma.order.findMany({
      where: { createdAt: { gte: d90 }, status: "COMPLETED", type: { not: "TABLE" } },
      select: { customerId: true, total: true, createdAt: true },
    }),
    prisma.$queryRaw<{ id: string; name: string; phone: string; birthDate: Date; tier: string }[]>`
      SELECT "id", "name", "phone", "birthDate", "tier" FROM "Customer"
      WHERE "clubJoinedAt" IS NOT NULL AND "birthDate" IS NOT NULL AND EXTRACT(MONTH FROM "birthDate") = ${month}
      ORDER BY EXTRACT(DAY FROM "birthDate") LIMIT 100`,
    prisma.customer.findMany({ where: { clubJoinedAt: { not: null } }, orderBy: { pointsEarned12m: "desc" }, take: 10, select: { id: true, name: true, phone: true, tier: true, pointsEarned12m: true, pointsBalance: true, lastOrderAt: true } }),
    prisma.pointsCampaign.count({ where: { active: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } } }),
  ]);

  // Receita e ticket: sócios x não sócios (últimos 30 dias).
  const last30 = orders90.filter((o) => o.createdAt >= d30);
  const memberIds = new Set((await prisma.customer.findMany({ where: { clubJoinedAt: { not: null } }, select: { id: true } })).map((c) => c.id));
  const isMember = (o: { customerId: string | null }) => !!o.customerId && memberIds.has(o.customerId);
  const sum = (list: { total: number }[]) => list.reduce((s, o) => s + o.total, 0);
  const mem = last30.filter(isMember);
  const non = last30.filter((o) => !isMember(o));

  // Dia da semana e horário mais fortes (90 dias): base para "melhor horário para campanhas".
  const byWeekday = WEEKDAYS.map((label) => ({ label, value: 0, count: 0 }));
  const byHour = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, value: 0, count: 0 }));
  for (const o of orders90) {
    const p = brtParts(o.createdAt);
    byWeekday[p.weekday].value += o.total;
    byWeekday[p.weekday].count++;
    byHour[p.hour].value += o.total;
    byHour[p.hour].count++;
  }
  const hours = byHour.filter((h) => h.count > 0);
  const weakestDay = [...byWeekday].sort((a, b) => a.count - b.count)[0];
  const strongestDay = [...byWeekday].sort((a, b) => b.count - a.count)[0];
  const peakHour = [...byHour].sort((a, b) => b.count - a.count)[0];

  // Risco de sumir: sócios que já pediram 2+ vezes e estão há mais que o dobro do intervalo habitual sem pedir.
  const perCustomer = new Map<string, Date[]>();
  const history = await prisma.order.findMany({
    where: { customerId: { in: [...memberIds] }, status: "COMPLETED", createdAt: { gte: new Date(now - 365 * DAY) } },
    select: { customerId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const o of history) {
    if (!o.customerId) continue;
    const list = perCustomer.get(o.customerId) ?? [];
    list.push(o.createdAt);
    perCustomer.set(o.customerId, list);
  }
  const risk: { id: string; days: number; usual: number }[] = [];
  for (const [id, dates] of perCustomer) {
    if (dates.length < 2) continue;
    const usual = (dates[dates.length - 1].getTime() - dates[0].getTime()) / (dates.length - 1) / DAY;
    const days = (now - dates[dates.length - 1].getTime()) / DAY;
    if (days > Math.max(14, usual * 2)) risk.push({ id, days: Math.round(days), usual: Math.max(1, Math.round(usual)) });
  }
  risk.sort((a, b) => b.days - a.days);
  const riskPeople = await prisma.customer.findMany({ where: { id: { in: risk.slice(0, 30).map((r) => r.id) } }, select: { id: true, name: true, phone: true, tier: true, pointsBalance: true } });
  const riskList = risk.slice(0, 30).map((r) => ({ ...r, ...riskPeople.find((p) => p.id === r.id)! }));

  const tierCount = (k: string) => byTier.find((t) => t.tier === k)?._count._all ?? 0;
  const vip = tierCount("OURO") + tierCount("DIAMANTE");
  const redCount = (s: string) => redemptions30.find((r) => r.status === s)?._count._all ?? 0;

  // Sugestões automáticas (regras simples sobre os números acima).
  const insights: string[] = [];
  if (riskList.length) insights.push(`${riskList.length} sócios estão demorando mais que o normal para voltar. Envie uma campanha "Clientes sumidos" com pontos em dobro.`);
  if (weakestDay.count > 0 && strongestDay.count > weakestDay.count * 1.5)
    insights.push(`${weakestDay.label} é o dia mais fraco (${weakestDay.count} pedidos em 90 dias contra ${strongestDay.count} de ${strongestDay.label}). Crie "pontos em dobro às ${weakestDay.label.toLowerCase()}s".`);
  if (peakHour.count > 0) insights.push(`O horário de pico é ${peakHour.label}. Mande campanhas cerca de 1 hora antes (${Math.max(9, Number(peakHour.label.replace("h", "")) - 1)}h) para chegar na hora da fome.`);
  if (birthdays.length) insights.push(`${birthdays.length} aniversariantes neste mês recebem ${cfg.birthdayBonus} pontos automaticamente no dia.`);
  if (mem.length && non.length && sum(mem) / mem.length > sum(non) / non.length)
    insights.push(`Sócios gastam ${Math.round(((sum(mem) / mem.length) / (sum(non) / non.length) - 1) * 100)}% a mais por pedido que não sócios. Vale divulgar o clube no balcão e nas embalagens.`);
  if (!campaignsActive) insights.push("Nenhuma campanha de pontos ativa agora. Campanhas curtas (fim de semana, dia fraco) aumentam a frequência.");
  if (members < 50) insights.push("Clube ainda pequeno: ofereça o cadastro no caixa e no WhatsApp; cada amigo indicado dá pontos para os dois.");

  return NextResponse.json({
    config: cfg,
    tiers,
    kpis: {
      members,
      newMembers,
      activeMembers,
      inactiveMembers: members - activeMembers,
      vip,
      pointsIssued30: issued._sum.delta ?? 0,
      pointsRedeemed30: -(used._sum.delta ?? 0),
      redemptionsIssued30: redCount("ISSUED") + redCount("USED") + redCount("EXPIRED"),
      redemptionsUsed30: redCount("USED"),
      revenue30Members: sum(mem),
      revenue30Others: sum(non),
      ticketMembers: mem.length ? Math.round(sum(mem) / mem.length) : 0,
      ticketOthers: non.length ? Math.round(sum(non) / non.length) : 0,
      ordersMembers30: mem.length,
      ordersOthers30: non.length,
      retention: members ? Math.round((activeMembers / members) * 100) : 0,
    },
    byTier: tiers.map((t) => ({ label: `${t.icon} ${t.name}`, value: tierCount(t.key) })),
    byWeekday,
    byHour: hours,
    birthdays: birthdays.map((b) => ({ ...b, day: b.birthDate.getUTCDate() })),
    top,
    risk: riskList,
    insights,
  });
}

const configSchema = z
  .object({
    enabled: z.boolean(),
    pointsPerReal: z.number().int().min(1).max(100),
    pointsExpiryMonths: z.number().int().min(0).max(36),
    welcomeBonus: z.number().int().min(0).max(10_000),
    profileBonus: z.number().int().min(0).max(10_000),
    birthdayBonus: z.number().int().min(0).max(10_000),
    referralBonusReferrer: z.number().int().min(0).max(10_000),
    referralBonusFriend: z.number().int().min(0).max(10_000),
    ratingBonus: z.number().int().min(0).max(10_000),
    redemptionValidDays: z.number().int().min(1).max(365),
  })
  .partial()
  .strict();

const tierSchema = z
  .array(
    z
      .object({
        key: z.enum(["BRONZE", "PRATA", "OURO", "DIAMANTE"]),
        name: z.string().trim().min(2).max(30),
        minPoints: z.number().int().min(0).max(1_000_000),
        multiplier: z.number().int().min(100).max(500),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        icon: z.string().min(1).max(8),
        description: z.string().trim().max(200),
        benefits: z.string().trim().max(600),
      })
      .strict(),
  )
  .length(4);

/** Regras do clube (pontos, bônus, validade) e níveis. */
export async function PATCH(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readJson(req, 16 * 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = z.object({ config: configSchema.optional(), tiers: tierSchema.optional() }).strict().safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { config, tiers } = parsed.data;
  if (tiers) {
    const sorted = [...tiers].sort((a, b) => ["BRONZE", "PRATA", "OURO", "DIAMANTE"].indexOf(a.key) - ["BRONZE", "PRATA", "OURO", "DIAMANTE"].indexOf(b.key));
    if (sorted[0].minPoints !== 0 || sorted.some((t, i) => i > 0 && t.minPoints <= sorted[i - 1].minPoints)) {
      return jsonError("Os pontos mínimos precisam subir de um nível para o outro (Bronze começa em 0).", 422);
    }
    await prisma.$transaction(sorted.map((t, i) => prisma.clubTier.update({ where: { key: t.key }, data: { ...t, sort: i + 1 } })));
  }
  if (config) await prisma.clubConfig.update({ where: { id: 1 }, data: config });
  await prisma.clubAudit.create({
    data: { action: "CONFIG", detail: [config && `regras: ${Object.keys(config).join(", ")}`, tiers && "níveis"].filter(Boolean).join(" · ") || "sem mudanças", actor: auth.user.name },
  });
  return NextResponse.json({ ok: true });
}
