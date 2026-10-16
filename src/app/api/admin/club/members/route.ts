import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { ClubError, addPoints, refreshTier } from "@/lib/club/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 50;

/** Sócios do clube (busca, filtro por nível) ou a ficha completa de um sócio (?id=). */
export async function GET(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");

  if (id) {
    if (!/^[a-z0-9]{20,40}$/i.test(id)) return jsonError("Sócio não encontrado.", 404);
    const c = await prisma.customer.findUnique({ where: { id }, include: { referredBy: { select: { name: true } } } });
    if (!c) return jsonError("Sócio não encontrado.", 404);
    const done = { customerId: id, status: "COMPLETED" as const };
    const [ledger, redemptions, orders, items, payments, referrals] = await Promise.all([
      prisma.pointsEntry.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.redemption.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.order.findMany({ where: done, orderBy: { createdAt: "asc" }, select: { number: true, total: true, createdAt: true, couponCode: true, paymentMethod: true, type: true } }),
      prisma.orderItem.groupBy({ by: ["productName"], where: { order: done }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
      prisma.order.groupBy({ by: ["paymentMethod"], where: done, _count: { _all: true }, orderBy: { _count: { paymentMethod: "desc" } }, take: 1 }),
      prisma.customer.findMany({ where: { referredById: id }, select: { name: true, createdAt: true } }),
    ]);
    // Dia e horário preferidos (horário de Brasília).
    const wd = new Array(7).fill(0);
    const hr = new Array(24).fill(0);
    for (const o of orders) {
      const local = new Date(o.createdAt.getTime() - 3 * 3_600_000);
      wd[local.getUTCDay()]++;
      hr[local.getUTCHours()]++;
    }
    const total = orders.reduce((s, o) => s + o.total, 0);
    return NextResponse.json({
      member: {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        city: c.city,
        birthDate: c.birthDate,
        gender: c.gender,
        tier: c.tier,
        points: c.pointsBalance,
        earned12m: c.pointsEarned12m,
        savings: c.totalSavings,
        referralCode: c.referralCode,
        referredBy: c.referredBy?.name ?? null,
        marketingOptIn: c.marketingOptIn,
        clubJoinedAt: c.clubJoinedAt,
        createdAt: c.createdAt,
      },
      crm: {
        firstOrder: orders[0]?.createdAt ?? null,
        lastOrder: orders[orders.length - 1]?.createdAt ?? null,
        orders: orders.length,
        total,
        avgTicket: orders.length ? Math.round(total / orders.length) : 0,
        favoritePayment: payments[0]?.paymentMethod ?? null,
        favoriteProducts: items.map((i) => ({ name: i.productName, qty: i._sum.quantity ?? 0 })),
        favoriteWeekday: orders.length ? ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][wd.indexOf(Math.max(...wd))] : null,
        favoriteHour: orders.length ? `${hr.indexOf(Math.max(...hr))}h` : null,
        couponsUsed: [...new Set(orders.map((o) => o.couponCode).filter(Boolean))],
        referrals,
      },
      ledger,
      redemptions,
    });
  }

  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const tier = sp.get("tier") ?? "";
  const page = Math.max(0, Math.min(1000, Number(sp.get("page")) || 0));
  const digits = q.replace(/\D/g, "");
  const where: Prisma.CustomerWhereInput = {
    clubJoinedAt: { not: null },
    ...(["BRONZE", "PRATA", "OURO", "DIAMANTE"].includes(tier) && { tier }),
    ...(q && { OR: [{ name: { contains: q, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []), { referralCode: { equals: q.toUpperCase() } }] }),
  };
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ pointsEarned12m: "desc" }, { createdAt: "desc" }],
      skip: page * PAGE,
      take: PAGE,
      select: { id: true, name: true, phone: true, tier: true, pointsBalance: true, pointsEarned12m: true, totalSavings: true, lastOrderAt: true, clubJoinedAt: true, birthDate: true, city: true },
    }),
    prisma.customer.count({ where }),
  ]);
  return NextResponse.json({ total, pageSize: PAGE, members: rows });
}

const adjustSchema = z
  .object({
    customerId: z.string().min(20).max(40),
    delta: z.number().int().min(-100_000).max(100_000).refine((v) => v !== 0, "Informe os pontos."),
    reason: z.string().trim().min(3, "Informe o motivo.").max(120),
  })
  .strict();

/** Ajuste manual de pontos (gerente), sempre com motivo e registro na auditoria. */
export async function POST(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readJson(req, 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { customerId, delta, reason } = parsed.data;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, phone: true, clubJoinedAt: true } });
  if (!c?.clubJoinedAt) return jsonError("Sócio não encontrado.", 404);
  try {
    const r = await addPoints({ customerId, delta, kind: "ADJUST", description: `Ajuste: ${reason}`, createdBy: auth.user.name });
    await prisma.clubAudit.create({ data: { action: "ADJUST", detail: `${c.name} (***${c.phone.slice(-4)}): ${delta > 0 ? "+" : ""}${delta} pontos — ${reason}`, actor: auth.user.name } });
    await refreshTier(customerId, { notify: false });
    return NextResponse.json({ balance: r?.balance ?? null });
  } catch (err) {
    if (err instanceof ClubError) return jsonError(err.message, 409);
    throw err;
  }
}
