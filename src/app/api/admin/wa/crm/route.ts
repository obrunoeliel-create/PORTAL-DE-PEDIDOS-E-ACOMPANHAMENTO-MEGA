import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { isVip } from "@/lib/wa/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 50;
const INACTIVE_DAYS = 30;

/**
 * Clientes do WhatsApp: último contato, mensagens recebidas, último pedido, ticket médio,
 * VIP (5+ pedidos ou R$ 500+) e inativo (sem pedir há 30 dias). Filtros: vip, inactive, optin, optout.
 */
export async function GET(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const filter = sp.get("filter") ?? "";
  const page = Math.max(0, Math.min(500, Number(sp.get("page")) || 0));

  const digits = q.replace(/\D/g, "");
  const contacts = await prisma.waContact.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])] }
      : undefined,
    take: 5000,
  });
  const phones = contacts.map((c) => c.phone);
  const [orders, msgs] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerPhone"],
      where: { customerPhone: { in: phones }, status: { not: "CANCELED" } },
      _count: { _all: true },
      _sum: { total: true },
      _max: { createdAt: true },
    }),
    prisma.waMessage.groupBy({ by: ["phone"], where: { phone: { in: phones }, status: { in: ["SENT", "DELIVERED", "READ"] } }, _count: { _all: true } }),
  ]);
  const o = new Map(orders.map((x) => [x.customerPhone, x]));
  const m = new Map(msgs.map((x) => [x.phone, x._count._all]));
  const inactiveBefore = Date.now() - INACTIVE_DAYS * 86_400_000;

  let rows = contacts.map((c) => {
    const s = o.get(c.phone);
    const count = s?._count._all ?? 0;
    const total = s?._sum.total ?? 0;
    const lastOrderAt = s?._max.createdAt ?? null;
    return {
      phone: c.phone,
      name: c.name,
      marketingOptIn: c.marketingOptIn,
      optOut: !!c.optOutAt,
      lastContactAt: c.lastContactAt,
      messages: m.get(c.phone) ?? 0,
      orders: count,
      total,
      avgTicket: count ? Math.round(total / count) : 0,
      lastOrderAt,
      vip: isVip(count, total),
      inactive: !!lastOrderAt && lastOrderAt.getTime() < inactiveBefore,
    };
  });
  if (filter === "vip") rows = rows.filter((r) => r.vip);
  else if (filter === "inactive") rows = rows.filter((r) => r.inactive);
  else if (filter === "optin") rows = rows.filter((r) => r.marketingOptIn && !r.optOut);
  else if (filter === "optout") rows = rows.filter((r) => r.optOut);
  rows.sort((a, b) => (b.lastOrderAt?.getTime() ?? 0) - (a.lastOrderAt?.getTime() ?? 0));

  return NextResponse.json({
    total: rows.length,
    pageSize: PAGE,
    summary: {
      contacts: contacts.length,
      optIn: contacts.filter((c) => c.marketingOptIn && !c.optOutAt).length,
      optOut: contacts.filter((c) => c.optOutAt).length,
    },
    customers: rows.slice(page * PAGE, page * PAGE + PAGE),
  });
}
