import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/customer-session";
import { PayloadError, getClientIp, jsonError, readJson, tooManyRequests, validationError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { clubProfileSchema } from "@/lib/validators";
import { checkProfileBonus, getClubConfig, getTiers, joinClub, missionsFor, rewardValueLabel, tierFor } from "@/lib/club/core";
import { configuredPublicUrl } from "@/lib/public-url";
import { touchContact } from "@/lib/wa/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const initialName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};

/** Ranking do mês: pontos ganhos no mês (só primeiro nome + inicial, por privacidade). */
async function monthRanking() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(3, 0, 0, 0);
  const rows = await prisma.pointsEntry.groupBy({
    by: ["customerId"],
    where: { createdAt: { gte: start }, kind: { in: ["ORDER", "MISSION", "REFERRAL", "RATING"] } },
    _sum: { delta: true },
    orderBy: { _sum: { delta: "desc" } },
    take: 50,
  });
  const people = await prisma.customer.findMany({ where: { id: { in: rows.map((r) => r.customerId) } }, select: { id: true, name: true, tier: true } });
  const byId = new Map(people.map((p) => [p.id, p]));
  return rows
    .filter((r) => (r._sum.delta ?? 0) > 0)
    .map((r, i) => ({ position: i + 1, customerId: r.customerId, name: initialName(byId.get(r.customerId)?.name ?? "Cliente"), tier: byId.get(r.customerId)?.tier ?? "BRONZE", points: r._sum.delta ?? 0 }));
}

/**
 * Página do clube: regras públicas (níveis, recompensas, missões, campanhas) e, se o cliente estiver
 * logado, o cartão dele (saldo, nível, extrato, resgates com QR Code, missões, indicação, ranking).
 */
export async function GET() {
  const [cfg, tiers, rewards, campaigns, me] = await Promise.all([
    getClubConfig(),
    getTiers(),
    prisma.reward.findMany({ where: { active: true }, orderBy: [{ sort: "asc" }, { pointsCost: "asc" }] }),
    prisma.pointsCampaign.findMany({ where: { active: true, endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 5 }),
    getCurrentCustomer(),
  ]);
  const publicPart = {
    enabled: cfg.enabled,
    rules: {
      pointsPerReal: cfg.pointsPerReal,
      pointsExpiryMonths: cfg.pointsExpiryMonths,
      welcomeBonus: cfg.welcomeBonus,
      profileBonus: cfg.profileBonus,
      birthdayBonus: cfg.birthdayBonus,
      referralBonusReferrer: cfg.referralBonusReferrer,
      referralBonusFriend: cfg.referralBonusFriend,
      ratingBonus: cfg.ratingBonus,
      redemptionValidDays: cfg.redemptionValidDays,
    },
    tiers: tiers.map((t) => ({ key: t.key, name: t.name, minPoints: t.minPoints, multiplier: t.multiplier, color: t.color, icon: t.icon, description: t.description, benefits: t.benefits.split("\n").filter(Boolean) })),
    rewards: rewards.map((r) => ({ id: r.id, name: r.name, description: r.description, kind: r.kind, valueLabel: rewardValueLabel(r), pointsCost: r.pointsCost, minTier: r.minTier, emoji: r.emoji, soldOut: r.stock !== null && r.stock <= 0 })),
    campaigns: campaigns.map((c) => ({ name: c.name, multiplier: c.multiplier, startsAt: c.startsAt, endsAt: c.endsAt, minTier: c.minTier })),
  };
  if (!me) return NextResponse.json({ ...publicPart, me: null }, { headers: { "Cache-Control": "no-store" } });

  const c = await prisma.customer.findUniqueOrThrow({ where: { id: me.id } });
  if (!c.clubJoinedAt) {
    return NextResponse.json({ ...publicPart, me: { joined: false, name: c.name, email: c.email, birthDate: c.birthDate, city: c.city } }, { headers: { "Cache-Control": "no-store" } });
  }

  const orderWhere = { customerId: c.id, status: "COMPLETED" as const };
  const [ledger, redemptions, missions, ordersAgg, lastOrder, fav, ranking, referrals] = await Promise.all([
    prisma.pointsEntry.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.redemption.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 20, include: { reward: { select: { emoji: true, kind: true } } } }),
    missionsFor(c.id),
    prisma.order.aggregate({ where: orderWhere, _count: { _all: true }, _sum: { total: true } }),
    prisma.order.findFirst({ where: orderWhere, orderBy: { completedAt: "desc" }, select: { number: true, completedAt: true, total: true } }),
    prisma.orderItem.groupBy({ by: ["productName"], where: { order: orderWhere }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 3 }),
    monthRanking(),
    prisma.customer.count({ where: { referredById: c.id } }),
  ]);
  // Pedidos do cliente (acompanhar, avaliar, pedir de novo) — tudo no mesmo lugar.
  const recentOrders = await prisma.order.findMany({
    where: { OR: [{ customerId: c.id }, { customerPhone: c.phone }], type: { not: "TABLE" } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, number: true, status: true, type: true, total: true, createdAt: true, completedAt: true, trackingToken: true, rating: { select: { stars: true } }, items: { select: { productName: true, quantity: true }, take: 4 } },
  });
  const pointsByOrder = new Map(
    (await prisma.pointsEntry.findMany({ where: { customerId: c.id, kind: "ORDER", orderId: { not: null } }, select: { orderId: true, delta: true }, take: 50, orderBy: { createdAt: "desc" } })).map((p) => [p.orderId, p.delta]),
  );
  const tier = tierFor(tiers, c.pointsEarned12m);
  const next = tiers.find((t) => t.minPoints > c.pointsEarned12m) ?? null;
  const link = `${configuredPublicUrl()}/clube?ref=${c.referralCode}`;
  const expiresAt = cfg.pointsExpiryMonths > 0 && c.pointsBalance > 0 ? new Date((c.lastOrderAt ?? c.clubJoinedAt).getTime() + cfg.pointsExpiryMonths * 30 * DAY) : null;

  const reds = await Promise.all(
    redemptions.map(async (r) => ({
      code: r.code,
      rewardName: r.rewardName,
      emoji: r.reward.emoji,
      kind: r.reward.kind,
      pointsCost: r.pointsCost,
      status: r.status === "ISSUED" && r.expiresAt < new Date() ? "EXPIRED" : r.status,
      expiresAt: r.expiresAt,
      usedAt: r.usedAt,
      createdAt: r.createdAt,
      // QR Code com o código: o caixa lê com o leitor ou digita.
      qr: r.status === "ISSUED" ? await QRCode.toDataURL(r.code, { margin: 1, width: 240 }) : null,
    })),
  );

  const mine = ranking.find((r) => r.customerId === c.id);
  return NextResponse.json(
    {
      ...publicPart,
      me: {
        joined: true,
        name: c.name,
        email: c.email,
        birthDate: c.birthDate,
        city: c.city,
        gender: c.gender,
        marketingOptIn: c.marketingOptIn,
        memberSince: c.clubJoinedAt,
        points: c.pointsBalance,
        earned12m: c.pointsEarned12m,
        tier: tier.key,
        nextTier: next ? { key: next.key, name: next.name, missing: next.minPoints - c.pointsEarned12m, minPoints: next.minPoints } : null,
        savings: c.totalSavings,
        expiresAt,
        orders: ordersAgg._count._all,
        spent: ordersAgg._sum.total ?? 0,
        lastOrder,
        favorites: fav.map((f) => f.productName),
        referral: { code: c.referralCode, link, qr: await QRCode.toDataURL(link, { margin: 1, width: 240 }), count: referrals },
        ledger: ledger.map((l) => ({ id: l.id, delta: l.delta, kind: l.kind, description: l.description, at: l.createdAt })),
        redemptions: reds,
        orderList: recentOrders.map((o) => ({
          number: o.number,
          status: o.status,
          type: o.type,
          total: o.total,
          createdAt: o.createdAt,
          trackingToken: o.trackingToken,
          rating: o.rating?.stars ?? null,
          canRate: !o.rating && o.status === "COMPLETED" && !!o.completedAt && Date.now() - o.completedAt.getTime() < 7 * DAY,
          points: pointsByOrder.get(o.id) ?? 0,
          summary: o.items.map((i) => `${i.quantity}x ${i.productName}`).join(", "),
        })),
        missions: missions.map((m) => ({
          id: m.mission.id,
          name: m.mission.name,
          description: m.mission.description,
          emoji: m.mission.emoji,
          kind: m.mission.kind,
          target: m.mission.target,
          progress: m.progress,
          rewardPoints: m.mission.rewardPoints,
          repeatable: m.mission.repeatable,
          completions: m.completions,
          done: m.done,
          locked: m.locked,
          minTier: m.mission.minTier,
          endsAt: m.mission.endsAt,
        })),
        ranking: { top: ranking.slice(0, 10).map(({ customerId: _id, ...r }) => r), position: mine?.position ?? null, monthPoints: mine?.points ?? 0 },
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Entrar no clube (cliente que já tinha conta) ou atualizar o perfil do clube. */
export async function PATCH(req: Request) {
  const me = await getCurrentCustomer();
  if (!me) return jsonError("Entre na sua conta.", 401);
  const rl = rateLimit(`club:profile:${getClientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) return tooManyRequests(rl);
  let body: unknown;
  try {
    body = await readJson(req, 2048);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = clubProfileSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  const c = await prisma.customer.findUniqueOrThrow({ where: { id: me.id } });
  if (!c.clubJoinedAt && !d.acceptTerms) return NextResponse.json({ error: "Aceite o regulamento e a política de privacidade.", fields: { acceptTerms: "Obrigatório." } }, { status: 422 });
  await prisma.customer.update({
    where: { id: me.id },
    data: {
      // Aniversário: definido uma vez (evita trocar a data para ganhar o presente de novo).
      ...(d.birthDate !== undefined && !c.birthDate && { birthDate: new Date(`${d.birthDate}T00:00:00Z`) }),
      ...(d.city !== undefined && { city: d.city }),
      ...(d.gender !== undefined && { gender: d.gender }),
      ...(d.email !== undefined && { email: d.email }),
      ...(d.marketingOptIn !== undefined && { marketingOptIn: d.marketingOptIn }),
    },
  });
  if (d.marketingOptIn !== undefined) {
    await touchContact(c.phone, c.name, d.marketingOptIn);
    if (!d.marketingOptIn) await prisma.waContact.update({ where: { phone: c.phone }, data: { marketingOptIn: false } }).catch(() => {});
  }
  if (!c.clubJoinedAt) await joinClub(me.id, { referralCode: d.referralCode });
  else await checkProfileBonus(me.id);
  return NextResponse.json({ ok: true });
}
