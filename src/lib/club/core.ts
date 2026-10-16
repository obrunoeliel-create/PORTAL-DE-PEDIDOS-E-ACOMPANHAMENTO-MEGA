import "server-only";
import { randomInt } from "node:crypto";
import { Prisma, type ClubConfig, type ClubTier, type Customer } from "@prisma/client";
import { prisma } from "../prisma";
import { configuredPublicUrl } from "../public-url";
import { formatBRL } from "../money";
import { enqueue } from "../wa/queue";
import { firstName, type TemplateKey, type TemplateVars } from "../wa/templates";

/**
 * CLUBE MEGA JUREMA — regras de pontos, níveis, missões, indicações e resgates.
 *
 * - Todo crédito/débito vira uma linha no extrato (PointsEntry) com chave única: nunca duplica.
 * - O saldo fica em cache no cliente e é atualizado na MESMA transação do extrato.
 * - Nível = pontos ganhos nos últimos 12 meses (resgatar não derruba o nível).
 */

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;
const TZ = "America/Sao_Paulo";

export const TIER_ORDER = ["BRONZE", "PRATA", "OURO", "DIAMANTE"] as const;
export const tierRank = (key: string) => Math.max(0, TIER_ORDER.indexOf(key as (typeof TIER_ORDER)[number]));
/** Tipos de lançamento que contam para o nível (ganhos reais, não estornos de resgate nem ajustes). */
const TIER_KINDS = ["ORDER", "ORDER_REVERSAL", "WELCOME", "PROFILE", "BIRTHDAY", "REFERRAL", "MISSION", "RATING", "CAMPAIGN"];

export const clubLink = () => `${configuredPublicUrl()}/clube`;

export async function getClubConfig(): Promise<ClubConfig> {
  return prisma.clubConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

export async function getTiers(): Promise<ClubTier[]> {
  return prisma.clubTier.findMany({ orderBy: { sort: "asc" } });
}

export function tierFor(tiers: ClubTier[], earned12m: number): ClubTier {
  let current = tiers[0];
  for (const t of tiers) if (earned12m >= t.minPoints) current = t;
  return current;
}

/** Hora e dia da semana no horário de Brasília. */
export function brtParts(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", hourCycle: "h23", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, hour: Number(get("hour")), day: Number(get("day")), month: Number(get("month")), year: Number(get("year")) };
}

const fmtDate = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/** Mensagem do clube no WhatsApp (respeita SAIR e o horário das 9h às 21h). Nunca lança erro. */
async function clubMessage(c: Pick<Customer, "phone" | "name">, key: TemplateKey, dedupeKey: string, vars: TemplateVars) {
  try {
    await enqueue({ dedupeKey, kind: "CLUB", phone: c.phone, templateKey: key, vars: { nome: firstName(c.name), clubelink: clubLink(), site: configuredPublicUrl(), ...vars } });
  } catch (err) {
    console.error("[clube] mensagem:", err instanceof Error ? err.message : err);
  }
}

export type PointsInput = {
  customerId: string;
  delta: number;
  kind: string;
  description: string;
  dedupeKey?: string;
  orderId?: string | null;
  refId?: string | null;
  createdBy?: string | null;
};

/**
 * Lança pontos no extrato e atualiza o saldo. Retorna null se a chave já existia (crédito já dado).
 * Débito (delta negativo) só passa se houver saldo — exceto estorno/expiração, que zeram no máximo.
 */
export async function addPoints(input: PointsInput, txIn?: Tx): Promise<{ balance: number } | null> {
  const run = async (tx: Tx) => {
    if (input.dedupeKey && (await tx.pointsEntry.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } }))) return null;
    let delta = input.delta;
    if (delta < 0) {
      const c = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId }, select: { pointsBalance: true } });
      if (["ORDER_REVERSAL", "EXPIRE", "ADJUST"].includes(input.kind)) delta = Math.max(delta, -c.pointsBalance);
      else if (c.pointsBalance + delta < 0) throw new ClubError("Pontos insuficientes.");
      if (delta === 0) return { balance: c.pointsBalance };
    }
    await tx.pointsEntry.create({
      data: {
        customerId: input.customerId,
        delta,
        kind: input.kind,
        description: input.description.slice(0, 200),
        dedupeKey: input.dedupeKey ?? null,
        orderId: input.orderId ?? null,
        refId: input.refId ?? null,
        createdBy: input.createdBy ?? null,
      },
    });
    const updated = await tx.customer.update({
      where: { id: input.customerId },
      data: { pointsBalance: { increment: delta }, ...(delta > 0 && { lastPointsAt: new Date() }) },
      select: { pointsBalance: true },
    });
    return { balance: updated.pointsBalance };
  };
  try {
    return txIn ? await run(txIn) : await prisma.$transaction(run);
  } catch (err) {
    // Dois lançamentos iguais ao mesmo tempo: a chave única segura o segundo.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
}

export class ClubError extends Error {}

/** Recalcula os pontos dos últimos 12 meses e o nível. Avisa no WhatsApp quando sobe. */
export async function refreshTier(customerId: string, opts: { notify?: boolean } = { notify: true }) {
  const [sum, tiers, c] = await Promise.all([
    prisma.pointsEntry.aggregate({ where: { customerId, kind: { in: TIER_KINDS }, createdAt: { gte: new Date(Date.now() - 365 * DAY) } }, _sum: { delta: true } }),
    getTiers(),
    prisma.customer.findUnique({ where: { id: customerId } }),
  ]);
  if (!c || !tiers.length) return;
  const earned = Math.max(0, sum._sum.delta ?? 0);
  const tier = tierFor(tiers, earned);
  const changed = tier.key !== c.tier;
  await prisma.customer.update({
    where: { id: customerId },
    data: { pointsEarned12m: earned, ...(changed && { tier: tier.key, tierSince: new Date() }) },
  });
  if (changed) {
    await prisma.clubAudit.create({ data: { action: "TIER", detail: `${c.name} (***${c.phone.slice(-4)}): ${c.tier} → ${tier.key}`, actor: "sistema" } });
    if (opts.notify !== false && tierRank(tier.key) > tierRank(c.tier)) {
      await clubMessage(c, "CLUB_LEVEL_UP", `club:tier:${c.id}:${tier.key}:${new Date().getUTCFullYear()}`, {
        nivel: `${tier.icon} ${tier.name}`,
        beneficio: tier.benefits
          .split("\n")
          .filter(Boolean)
          .map((b) => `✅ ${b}`)
          .join("\n"),
      });
    }
  }
}

/** Código de indicação curto e legível: MARIA7K2. */
async function newReferralCode(name: string) {
  const base = (firstName(name).normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase() || "MEGA").slice(0, 6);
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 8; i++) {
    const code = base + Array.from({ length: 3 }, () => alphabet[randomInt(alphabet.length)]).join("");
    if (!(await prisma.customer.findUnique({ where: { referralCode: code }, select: { id: true } }))) return code;
  }
  return `MEGA${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Entrada no clube (cadastro novo ou cliente antigo que aceitou o regulamento): bônus de boas-vindas,
 * código de indicação e mensagem. Idempotente.
 */
export async function joinClub(customerId: string, opts: { referralCode?: string | null } = {}) {
  const cfg = await getClubConfig();
  const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const data: Prisma.CustomerUpdateInput = {};
  if (!c.clubJoinedAt) data.clubJoinedAt = new Date();
  if (!c.lgpdAcceptedAt) data.lgpdAcceptedAt = new Date();
  if (!c.referralCode) data.referralCode = await newReferralCode(c.name);
  // Indicação: só na entrada, nunca de si mesmo, e só para quem ainda não fez pedido.
  if (opts.referralCode && !c.referredById) {
    const ref = await prisma.customer.findUnique({ where: { referralCode: opts.referralCode.trim().toUpperCase() }, select: { id: true } });
    const hasOrders = await prisma.order.count({ where: { OR: [{ customerId }, { customerPhone: c.phone }], status: "COMPLETED" } });
    if (ref && ref.id !== customerId && !hasOrders) data.referredBy = { connect: { id: ref.id } };
  }
  if (Object.keys(data).length) await prisma.customer.update({ where: { id: customerId }, data });
  if (!cfg.enabled) return;
  if (cfg.welcomeBonus > 0) {
    const r = await addPoints({ customerId, delta: cfg.welcomeBonus, kind: "WELCOME", description: "Boas-vindas ao Clube Mega Jurema", dedupeKey: `WELCOME:${customerId}` });
    if (r) await clubMessage(c, "CLUB_WELCOME", `club:welcome:${customerId}`, { pontos: String(cfg.welcomeBonus), saldo: String(r.balance) });
  }
  await checkProfileBonus(customerId);
  await refreshTier(customerId, { notify: false });
}

/** Bônus por completar o perfil (aniversário, cidade e e-mail). */
export async function checkProfileBonus(customerId: string) {
  const cfg = await getClubConfig();
  if (!cfg.enabled || cfg.profileBonus <= 0) return;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { birthDate: true, city: true, email: true, clubJoinedAt: true } });
  if (!c?.clubJoinedAt || !c.birthDate || !c.city || !c.email) return;
  await addPoints({ customerId, delta: cfg.profileBonus, kind: "PROFILE", description: "Perfil completo", dedupeKey: `PROFILE:${customerId}` });
}

/** Campanhas de pontos ativas agora (dobro, triplo...), já filtradas por dia, hora e nível. */
async function activeCampaigns(tier: string, at = new Date()) {
  const { weekday, hour } = brtParts(at);
  const list = await prisma.pointsCampaign.findMany({ where: { active: true, startsAt: { lte: at }, endsAt: { gte: at } } });
  return list.filter((c) => c.weekdays.includes(String(weekday)) && hour >= c.hourFrom && hour < c.hourTo && tierRank(tier) >= tierRank(c.minTier));
}

/** Pontos que um pedido vale (para mostrar no carrinho e para creditar). */
export async function pointsForOrder(
  items: { productId: string; totalPrice: number }[],
  subtotal: number,
  discount: number,
  tier: string,
  at = new Date(),
): Promise<{ points: number; campaign: string | null }> {
  const [cfg, tiers, campaigns] = await Promise.all([getClubConfig(), getTiers(), activeCampaigns(tier, at)]);
  if (!cfg.enabled || subtotal <= 0) return { points: 0, campaign: null };
  const tierMult = tiers.find((t) => t.key === tier)?.multiplier ?? 100;
  const paidRatio = Math.max(0, subtotal - discount) / subtotal; // desconto reduz os pontos na mesma proporção
  let total = 0;
  let best: { name: string; mult: number } | null = null;
  for (const it of items) {
    const camps = campaigns.filter((c) => c.productIds.length === 0 || c.productIds.includes(it.productId));
    const mult = Math.max(100, ...camps.map((c) => c.multiplier));
    const camp = camps.find((c) => c.multiplier === mult);
    if (camp && (!best || mult > best.mult)) best = { name: camp.name, mult };
    total += ((it.totalPrice * paidRatio) / 100) * cfg.pointsPerReal * (tierMult / 100) * (mult / 100);
  }
  return { points: Math.floor(total), campaign: best?.name ?? null };
}

/** Cliente do pedido: pela conta usada no pedido ou pelo mesmo WhatsApp (liga o pedido à conta). */
async function customerOfOrder(order: { id: string; customerId: string | null; customerPhone: string }) {
  if (order.customerId) return prisma.customer.findUnique({ where: { id: order.customerId } });
  if (!order.customerPhone) return null;
  const c = await prisma.customer.findUnique({ where: { phone: order.customerPhone } });
  if (c) await prisma.order.update({ where: { id: order.id }, data: { customerId: c.id } });
  return c;
}

/**
 * Pedido concluído: credita os pontos, avança as missões e confirma a indicação.
 * Retorna a linha "você ganhou X pontos" para a mensagem de pedido entregue (ou "" se não é do clube).
 */
export async function onOrderCompleted(orderId: string): Promise<string> {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { select: { productId: true, totalPrice: true } } } });
    if (!order || order.status !== "COMPLETED" || order.type === "TABLE") return "";
    const c = await customerOfOrder(order);
    if (!c?.clubJoinedAt) return "";
    const cfg = await getClubConfig();
    if (!cfg.enabled) return "";

    const { points, campaign } = await pointsForOrder(
      order.items.map((i) => ({ productId: i.productId, totalPrice: i.totalPrice })),
      order.subtotal,
      order.discount,
      c.tier,
      order.createdAt,
    );
    let balance = c.pointsBalance;
    if (points > 0) {
      const r = await addPoints({
        customerId: c.id,
        delta: points,
        kind: "ORDER",
        description: `Pedido nº ${order.number}${campaign ? ` · ${campaign}` : ""}`,
        dedupeKey: `ORDER:${order.id}`,
        orderId: order.id,
      });
      if (r) balance = r.balance;
    }
    // Economia acumulada: desconto de cupom deste pedido.
    if (order.discount > 0) await prisma.customer.update({ where: { id: c.id }, data: { totalSavings: { increment: order.discount } } });

    await checkReferral(c.id);
    await evaluateMissions(c.id);
    await refreshTier(c.id);
    const after = await prisma.customer.findUnique({ where: { id: c.id }, select: { pointsBalance: true } });
    balance = after?.pointsBalance ?? balance;
    return points > 0 ? `⭐ Você ganhou *${points} pontos* no Clube Mega Jurema${campaign ? ` (${campaign})` : ""}! Saldo: *${balance} pontos*.` : "";
  } catch (err) {
    console.error("[clube] pedido concluído:", err instanceof Error ? err.message : err);
    return "";
  }
}

/** Pedido cancelado depois de creditado: estorna os pontos. */
export async function onOrderCanceled(orderId: string) {
  try {
    const credit = await prisma.pointsEntry.findUnique({ where: { dedupeKey: `ORDER:${orderId}` } });
    if (!credit) return;
    await addPoints({
      customerId: credit.customerId,
      delta: -credit.delta,
      kind: "ORDER_REVERSAL",
      description: `Estorno: ${credit.description} (cancelado)`,
      dedupeKey: `REVERSAL:${orderId}`,
      orderId,
    });
    await refreshTier(credit.customerId, { notify: false });
  } catch (err) {
    console.error("[clube] estorno:", err instanceof Error ? err.message : err);
  }
}

/** Avaliação do pedido: bônus para quem é do clube. */
export async function onOrderRated(orderId: string) {
  try {
    const cfg = await getClubConfig();
    if (!cfg.enabled || cfg.ratingBonus <= 0) return;
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, customerId: true, customerPhone: true } });
    if (!order) return;
    const c = await customerOfOrder(order);
    if (!c?.clubJoinedAt) return;
    await addPoints({ customerId: c.id, delta: cfg.ratingBonus, kind: "RATING", description: `Avaliou o pedido nº ${order.number}`, dedupeKey: `RATING:${order.id}`, orderId: order.id });
  } catch (err) {
    console.error("[clube] avaliação:", err instanceof Error ? err.message : err);
  }
}

/** Indicação: no primeiro pedido concluído do amigo, os dois ganham. */
async function checkReferral(customerId: string) {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, include: { referredBy: true } });
  if (!c?.referredBy) return;
  const done = await prisma.order.count({ where: { customerId, status: "COMPLETED" } });
  if (done < 1) return;
  const cfg = await getClubConfig();
  const friend = await addPoints({ customerId, delta: cfg.referralBonusFriend, kind: "REFERRAL", description: `Indicação de ${firstName(c.referredBy.name)}`, dedupeKey: `REFERRAL_FRIEND:${customerId}`, refId: c.referredBy.id });
  if (!friend) return; // já foi pago
  const r = await addPoints({
    customerId: c.referredBy.id,
    delta: cfg.referralBonusReferrer,
    kind: "REFERRAL",
    description: `Indicou ${firstName(c.name)}`,
    dedupeKey: `REFERRAL:${customerId}`,
    refId: customerId,
  });
  if (r) {
    await clubMessage(c.referredBy, "CLUB_REFERRAL", `club:ref:${customerId}`, { amigo: firstName(c.name), pontos: String(cfg.referralBonusReferrer), saldo: String(r.balance) });
    await evaluateMissions(c.referredBy.id);
    await refreshTier(c.referredBy.id);
  }
}

// ---------------- Missões ----------------

type MissionRow = Prisma.MissionGetPayload<object>;

/** Progresso atual de uma missão para o cliente (contado desde o início do ciclo). */
async function missionProgress(m: MissionRow, c: { id: string; phone: string }, cycleStart: Date): Promise<number> {
  let since = cycleStart > m.startsAt ? cycleStart : m.startsAt;
  if (m.periodDays) {
    const p = new Date(Date.now() - m.periodDays * DAY);
    if (p > since) since = p;
  }
  const base: Prisma.OrderWhereInput = { customerId: c.id, status: "COMPLETED", completedAt: { gte: since }, type: { not: "TABLE" } };
  switch (m.kind) {
    case "ORDERS":
      return prisma.order.count({ where: base });
    case "SPEND": {
      const s = await prisma.order.aggregate({ where: base, _sum: { total: true } });
      return s._sum.total ?? 0;
    }
    case "MIN_TICKET": {
      const orders = await prisma.order.findMany({ where: base, select: { subtotal: true, discount: true } });
      return orders.filter((o) => o.subtotal - o.discount >= m.target).length ? m.target : 0;
    }
    case "WEEKDAY": {
      const orders = await prisma.order.findMany({ where: base, select: { createdAt: true } });
      return orders.filter((o) => brtParts(o.createdAt).weekday === m.weekday).length;
    }
    case "DISTINCT_PRODUCTS": {
      const items = await prisma.orderItem.findMany({ where: { order: base }, select: { productId: true, halfProductId: true } });
      return new Set(items.flatMap((i) => [i.productId, i.halfProductId]).filter(Boolean)).size;
    }
    case "REFERRALS":
      return prisma.pointsEntry.count({ where: { kind: "REFERRAL", customerId: c.id, dedupeKey: { startsWith: "REFERRAL:" }, createdAt: { gte: since } } });
    default:
      return 0;
  }
}

/** Missões disponíveis para o nível do cliente, com o progresso. Não credita nada (só leitura). */
export async function missionsFor(customerId: string) {
  const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { id: true, phone: true, tier: true } });
  const now = new Date();
  const missions = await prisma.mission.findMany({
    where: { active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    orderBy: { sort: "asc" },
  });
  const rows = await prisma.missionProgress.findMany({ where: { customerId } });
  const byMission = new Map(rows.map((r) => [r.missionId, r]));
  const out = [];
  for (const m of missions) {
    const row = byMission.get(m.id);
    const locked = tierRank(c.tier) < tierRank(m.minTier);
    const done = !!row?.completions && !m.repeatable;
    const progress = done ? m.target : locked ? 0 : await missionProgress(m, c, row?.cycleStart ?? m.startsAt);
    out.push({ mission: m, progress: Math.min(progress, m.target), completions: row?.completions ?? 0, done, locked });
  }
  return out;
}

/** Confere as missões e credita as que foram cumpridas. */
export async function evaluateMissions(customerId: string) {
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c?.clubJoinedAt) return;
  for (const item of await missionsFor(customerId)) {
    const m = item.mission;
    if (item.locked || item.done || item.progress < m.target) continue;
    const n = item.completions + 1;
    const r = await addPoints({ customerId, delta: m.rewardPoints, kind: "MISSION", description: `Missão: ${m.name}`, dedupeKey: `MISSION:${m.id}:${customerId}:${n}`, refId: m.id });
    if (!r) continue;
    const now = new Date();
    await prisma.missionProgress.upsert({
      where: { missionId_customerId: { missionId: m.id, customerId } },
      create: { missionId: m.id, customerId, progress: m.target, completions: n, completedAt: now, cycleStart: now },
      update: { progress: m.target, completions: n, completedAt: now, cycleStart: now },
    });
    await clubMessage(c, "CLUB_MISSION_DONE", `club:mission:${m.id}:${customerId}:${n}`, { missao: `${m.emoji} ${m.name}`, pontos: String(m.rewardPoints), saldo: String(r.balance) });
  }
}

// ---------------- Resgates ----------------

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newRedemptionCode = () => `MJ-${Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}-${Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`;

export const rewardValueLabel = (r: { kind: string; value: number }) =>
  r.kind === "PERCENT" ? `${r.value}% de desconto` : r.kind === "DISCOUNT" ? `${formatBRL(r.value)} de desconto` : r.value ? `vale ${formatBRL(r.value)}` : "";

/** Troca pontos por uma recompensa: debita, gera o código único e (vales) o cupom para usar no site. */
export async function redeem(customerId: string, rewardId: string) {
  const cfg = await getClubConfig();
  if (!cfg.enabled) throw new ClubError("O clube está pausado no momento.");
  const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (!c.clubJoinedAt) throw new ClubError("Entre no clube para resgatar.");
  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward || !reward.active) throw new ClubError("Recompensa indisponível.");
  if (tierRank(c.tier) < tierRank(reward.minTier)) throw new ClubError("Esta recompensa é de um nível acima do seu.");
  // Limite de abuso: no máximo 3 resgates em aberto ao mesmo tempo.
  if ((await prisma.redemption.count({ where: { customerId, status: "ISSUED" } })) >= 3) {
    throw new ClubError("Você já tem 3 resgates para usar. Use um deles antes de resgatar outro.");
  }
  const expiresAt = new Date(Date.now() + cfg.redemptionValidDays * DAY);
  expiresAt.setUTCHours(26, 59, 59, 0); // fim do dia em Brasília

  const result = await prisma.$transaction(async (tx) => {
    if (reward.stock !== null) {
      const { count } = await tx.reward.updateMany({ where: { id: reward.id, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
      if (!count) throw new ClubError("Esta recompensa esgotou.");
    }
    // Débito atômico: só passa se o saldo cobrir (dois cliques ao mesmo tempo não geram saldo negativo).
    const { count } = await tx.customer.updateMany({ where: { id: customerId, pointsBalance: { gte: reward.pointsCost } }, data: { pointsBalance: { decrement: reward.pointsCost } } });
    if (!count) throw new ClubError("Pontos insuficientes.");
    let code = newRedemptionCode();
    while (await tx.redemption.findUnique({ where: { code }, select: { id: true } })) code = newRedemptionCode();
    const red = await tx.redemption.create({
      data: { code, customerId, rewardId: reward.id, rewardName: reward.name, pointsCost: reward.pointsCost, value: reward.value, expiresAt },
    });
    await tx.pointsEntry.create({
      data: { customerId, delta: -reward.pointsCost, kind: "REDEEM", description: `Resgate: ${reward.name}`, refId: red.id, dedupeKey: `REDEEM:${red.id}` },
    });
    // Vale (R$) ou % vira um cupom pessoal com o MESMO código: funciona no carrinho do site.
    if (reward.kind === "DISCOUNT" || reward.kind === "PERCENT") {
      await tx.coupon.create({
        data: { code, kind: reward.kind === "PERCENT" ? "PERCENT" : "FIXED", value: reward.value, validUntil: expiresAt, maxUses: 1, phone: c.phone, source: "CLUB" },
      });
    }
    return red;
  });
  await clubMessage(c, "CLUB_REDEEMED", `club:redeem:${result.id}`, {
    beneficio: `${reward.emoji} ${reward.name}`,
    cupom: result.code,
    validade: fmtDate(result.expiresAt),
  });
  return result;
}

/** Resgate usado (no caixa pelo funcionário, ou no site pelo cupom). Nunca usa duas vezes. */
export async function markRedemptionUsed(code: string, by: string, where: string, tx?: Tx) {
  const db = tx ?? prisma;
  const now = new Date();
  const { count } = await db.redemption.updateMany({
    where: { code, status: "ISSUED", expiresAt: { gte: now } },
    data: { status: "USED", usedAt: now, usedBy: by, usedWhere: where },
  });
  if (!count) return null;
  const red = await db.redemption.findUniqueOrThrow({ where: { code } });
  // Economia acumulada: só para produto (vales entram pelo desconto do pedido).
  const reward = await db.reward.findUnique({ where: { id: red.rewardId }, select: { kind: true } });
  if (reward?.kind === "PRODUCT" && red.value > 0) await db.customer.update({ where: { id: red.customerId }, data: { totalSavings: { increment: red.value } } });
  // No caixa, o vale também deixa de valer no site.
  await db.coupon.updateMany({ where: { code, active: true }, data: { active: false } });
  return red;
}

/** Cancela um resgate ainda não usado e devolve os pontos. */
export async function cancelRedemption(code: string, by: string) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.redemption.updateMany({ where: { code, status: "ISSUED" }, data: { status: "CANCELED", usedBy: by, usedAt: new Date() } });
    if (!count) throw new ClubError("Este resgate não está mais disponível para cancelar.");
    const red = await tx.redemption.findUniqueOrThrow({ where: { code } });
    await tx.coupon.updateMany({ where: { code }, data: { active: false } });
    await tx.reward.updateMany({ where: { id: red.rewardId, stock: { not: null } }, data: { stock: { increment: 1 } } });
    await addPoints({ customerId: red.customerId, delta: red.pointsCost, kind: "REDEEM_REFUND", description: `Resgate cancelado: ${red.rewardName}`, dedupeKey: `REFUND:${red.id}`, refId: red.id }, tx);
    return red;
  });
}

// ---------------- Rotinas diárias ----------------

const g = globalThis as unknown as { __clubDailyAt?: number };

/** Uma vez por hora (chamado pelo relógio do servidor): aniversários, expiração e resgates vencidos. */
export async function clubTick() {
  if (g.__clubDailyAt && Date.now() - g.__clubDailyAt < 3_600_000) return;
  g.__clubDailyAt = Date.now();
  const cfg = await getClubConfig();
  if (!cfg.enabled) return;
  const now = new Date();
  const { day, month, year, hour } = brtParts(now);

  // Resgates vencidos.
  const expired = await prisma.redemption.findMany({ where: { status: "ISSUED", expiresAt: { lt: now } }, select: { code: true } });
  if (expired.length) {
    await prisma.redemption.updateMany({ where: { code: { in: expired.map((e) => e.code) } }, data: { status: "EXPIRED" } });
    await prisma.coupon.updateMany({ where: { code: { in: expired.map((e) => e.code) } }, data: { active: false } });
  }

  // Aniversariantes de hoje (a partir das 9h, para a mensagem não sair de madrugada).
  if (hour >= 9 && cfg.birthdayBonus > 0) {
    const people = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Customer"
      WHERE "clubJoinedAt" IS NOT NULL AND "birthDate" IS NOT NULL
        AND EXTRACT(DAY FROM "birthDate") = ${day} AND EXTRACT(MONTH FROM "birthDate") = ${month}
        AND ("birthdayGiftYear" IS NULL OR "birthdayGiftYear" < ${year})`;
    for (const p of people) {
      const c = await prisma.customer.update({ where: { id: p.id }, data: { birthdayGiftYear: year } });
      const r = await addPoints({ customerId: c.id, delta: cfg.birthdayBonus, kind: "BIRTHDAY", description: `Presente de aniversário ${year}`, dedupeKey: `BIRTHDAY:${c.id}:${year}` });
      if (r) await clubMessage(c, "CLUB_BIRTHDAY", `club:bday:${c.id}:${year}`, { pontos: String(cfg.birthdayBonus), saldo: String(r.balance) });
    }
  }

  // Pontos expiram após X meses sem pedidos; aviso 15 dias antes.
  if (cfg.pointsExpiryMonths > 0) {
    const limitMs = cfg.pointsExpiryMonths * 30 * DAY;
    const holders = await prisma.customer.findMany({
      where: { pointsBalance: { gt: 0 }, clubJoinedAt: { not: null } },
      select: { id: true, name: true, phone: true, pointsBalance: true, lastOrderAt: true, clubJoinedAt: true, pointsWarnedAt: true },
    });
    for (const c of holders) {
      const last = c.lastOrderAt ?? c.clubJoinedAt!;
      const expiresAt = new Date(last.getTime() + limitMs);
      if (expiresAt <= now) {
        await addPoints({ customerId: c.id, delta: -c.pointsBalance, kind: "EXPIRE", description: `Pontos expirados (${cfg.pointsExpiryMonths} meses sem pedidos)`, dedupeKey: `EXPIRE:${c.id}:${last.getTime()}` });
        await refreshTier(c.id, { notify: false });
      } else if (expiresAt.getTime() - now.getTime() < 15 * DAY && (!c.pointsWarnedAt || c.pointsWarnedAt < last)) {
        await prisma.customer.update({ where: { id: c.id }, data: { pointsWarnedAt: now } });
        await clubMessage(c, "CLUB_POINTS_EXPIRING", `club:expiring:${c.id}:${last.getTime()}`, { saldo: String(c.pointsBalance), validade: fmtDate(expiresAt) });
      }
    }
  }

  // Níveis: quem tinha pontos de 12 meses atrás pode cair de nível.
  const upper = await prisma.customer.findMany({ where: { tier: { not: "BRONZE" } }, select: { id: true } });
  for (const u of upper) await refreshTier(u.id, { notify: false });
}
