import "server-only";
import type { OrderType, PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { type Period, addDays, brParts } from "./reports";

// Relatório do Financeiro. "Vendas" = pedidos não cancelados, pela data em que foram feitos.

export type FinanceFilters = { period: Period; type: OrderType | null; payment: PaymentMethod | null };

function baseWhere(f: FinanceFilters, start: Date, end: Date): Prisma.OrderWhereInput {
  return {
    createdAt: { gte: start, lt: end },
    ...(f.type ? { type: f.type } : {}),
    ...(f.payment ? { paymentMethod: f.payment } : {}),
  };
}

export async function financeReport(f: FinanceFilters) {
  const { start, end, from, days } = f.period;
  const all = baseWhere(f, start, end);
  const sold: Prisma.OrderWhereInput = { ...all, status: { not: "CANCELED" } };
  // Período anterior do mesmo tamanho, para comparar.
  const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
  const prevSold: Prisma.OrderWhereInput = { ...baseWhere(f, prevStart, start), status: { not: "CANCELED" } };

  const [totals, prevTotals, canceled, byPayment, byType, slim, items, districts, drivers, customers, tablesClosed] = await Promise.all([
    prisma.order.aggregate({ where: sold, _sum: { total: true, subtotal: true, deliveryFee: true }, _count: true }),
    prisma.order.aggregate({ where: prevSold, _sum: { total: true }, _count: true }),
    prisma.order.aggregate({ where: { ...all, status: "CANCELED" }, _sum: { total: true }, _count: true }),
    prisma.order.groupBy({ by: ["paymentMethod"], where: sold, _sum: { total: true }, _count: true }),
    prisma.order.groupBy({ by: ["type"], where: sold, _sum: { total: true }, _count: true }),
    prisma.order.findMany({ where: sold, select: { createdAt: true, total: true } }),
    prisma.orderItem.groupBy({
      by: ["productName", "categoryLabel"],
      where: { order: sold },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 15,
    }),
    prisma.order.groupBy({
      by: ["addressDistrict"],
      where: { ...sold, type: "DELIVERY", addressDistrict: { not: null } },
      _sum: { total: true, deliveryFee: true },
      _count: true,
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    prisma.order.groupBy({
      by: ["driverId"],
      where: { ...sold, driverId: { not: null } },
      _sum: { deliveryFee: true, total: true },
      _count: true,
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.order.groupBy({
      by: ["customerPhone"],
      where: { ...sold, customerPhone: { not: "" } },
      _sum: { total: true },
      _count: true,
      orderBy: { _sum: { total: "desc" } },
    }),
    // Mesas fechadas no período: como foi pago no caixa (não segue os filtros de canal/pagamento).
    prisma.tableSession.groupBy({
      by: ["paidWith"],
      where: { closedAt: { gte: start, lt: end } },
      _sum: { total: true, discount: true },
      _count: true,
    }),
  ]);

  // Por dia, por hora e por dia da semana (horário de Brasília).
  const byDay = new Map<string, { total: number; count: number }>();
  for (let i = 0; i < days; i++) byDay.set(addDays(from, i), { total: 0, count: 0 });
  const byHour = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
  const byWeekday = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
  for (const o of slim) {
    const p = brParts(o.createdAt);
    const d = byDay.get(p.day);
    if (d) {
      d.total += o.total;
      d.count++;
    }
    byHour[p.hour].total += o.total;
    byHour[p.hour].count++;
    byWeekday[p.weekday].total += o.total;
    byWeekday[p.weekday].count++;
  }

  const topCustomers = customers.slice(0, 10);
  const [driverNames, customerNames] = await Promise.all([
    prisma.driver.findMany({ where: { id: { in: drivers.map((d) => d.driverId!).filter(Boolean) } }, select: { id: true, name: true } }),
    prisma.order.findMany({
      where: { customerPhone: { in: topCustomers.map((c) => c.customerPhone) } },
      select: { customerPhone: true, customerName: true },
      orderBy: { createdAt: "desc" },
      distinct: ["customerPhone"],
    }),
  ]);

  const revenue = totals._sum.total ?? 0;
  const count = totals._count;
  const prevRevenue = prevTotals._sum.total ?? 0;

  return {
    revenue,
    count,
    avgTicket: count ? Math.round(revenue / count) : 0,
    products: totals._sum.subtotal ?? 0,
    deliveryFees: totals._sum.deliveryFee ?? 0,
    prevRevenue,
    prevCount: prevTotals._count,
    /** Variação das vendas contra o período anterior, em % (null = sem base de comparação). */
    revenueDelta: prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null,
    canceledCount: canceled._count,
    canceledValue: canceled._sum.total ?? 0,
    distinctCustomers: customers.length,
    byPayment: byPayment.map((r) => ({ key: r.paymentMethod, total: r._sum.total ?? 0, count: r._count })),
    byType: byType.map((r) => ({ key: r.type, total: r._sum.total ?? 0, count: r._count })),
    byDay: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
    byHour,
    byWeekday,
    topProducts: items.map((r) => ({
      name: r.categoryLabel ? `${r.categoryLabel} ${r.productName}` : r.productName,
      quantity: r._sum.quantity ?? 0,
      total: r._sum.totalPrice ?? 0,
    })),
    topDistricts: districts.map((r) => ({ name: r.addressDistrict ?? "—", count: r._count, total: r._sum.total ?? 0, fees: r._sum.deliveryFee ?? 0 })),
    drivers: drivers.map((r) => ({
      name: driverNames.find((d) => d.id === r.driverId)?.name ?? "Entregador removido",
      count: r._count,
      fees: r._sum.deliveryFee ?? 0,
      total: r._sum.total ?? 0,
    })),
    topCustomers: topCustomers.map((r) => ({
      phone: r.customerPhone,
      name: customerNames.find((c) => c.customerPhone === r.customerPhone)?.customerName ?? "—",
      count: r._count,
      total: r._sum.total ?? 0,
    })),
    tablesClosed: tablesClosed.map((r) => ({ key: r.paidWith, total: r._sum.total ?? 0, discount: r._sum.discount ?? 0, count: r._count })),
  };
}

export type FinanceReport = Awaited<ReturnType<typeof financeReport>>;

/** Retrato da loja neste momento (não depende do período escolhido). */
export async function storeNow() {
  const [byStatus, openTables, openTablesTotal] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where: { status: { in: ["PENDING", "PREPARING", "OUT_FOR_DELIVERY"] } }, _count: true }),
    prisma.tableSession.count({ where: { closedAt: null } }),
    prisma.order.aggregate({ where: { tableSession: { closedAt: null }, status: { not: "CANCELED" } }, _sum: { total: true } }),
  ]);
  const n = (s: string) => byStatus.find((r) => r.status === s)?._count ?? 0;
  return {
    pending: n("PENDING"),
    preparing: n("PREPARING"),
    out: n("OUT_FOR_DELIVERY"),
    openTables,
    openTablesTotal: openTablesTotal._sum.total ?? 0,
  };
}
