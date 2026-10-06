import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import type { OrderTypeValue, PaymentMethodValue } from "@/types/order";

export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";
const todayInTz = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** Início/fim do dia no fuso de Brasília (UTC-3, sem horário de verão desde 2019). */
function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00-03:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  await requirePageSession(["MANAGER"]);

  const { data } = await searchParams;
  const date = data && /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(Date.parse(data)) ? data : todayInTz();
  const { start, end } = dayRange(date);
  const where = { createdAt: { gte: start, lt: end }, status: { not: "CANCELED" as const } };

  const [totals, byPayment, byType, canceled, tablesClosed] = await Promise.all([
    prisma.order.aggregate({ where, _sum: { total: true, deliveryFee: true }, _count: true }),
    prisma.order.groupBy({ by: ["paymentMethod"], where, _sum: { total: true }, _count: true }),
    prisma.order.groupBy({ by: ["type"], where, _sum: { total: true }, _count: true }),
    prisma.order.count({ where: { createdAt: { gte: start, lt: end }, status: "CANCELED" } }),
    // Mesas fechadas no dia: como foi pago no caixa
    prisma.tableSession.groupBy({
      by: ["paidWith"],
      where: { closedAt: { gte: start, lt: end } },
      _sum: { total: true, discount: true },
      _count: true,
    }),
  ]);

  const revenue = totals._sum.total ?? 0;
  const count = totals._count;
  const avgTicket = count ? Math.round(revenue / count) : 0;

  const paymentRows = (["PIX", "CARD", "CASH", "ON_SITE"] as PaymentMethodValue[]).map((m) => {
    const row = byPayment.find((r) => r.paymentMethod === m);
    return { label: PAYMENT_LABEL[m], total: row?._sum.total ?? 0, count: row?._count ?? 0 };
  });
  const tablesTotal = tablesClosed.reduce((a, r) => a + (r._sum.total ?? 0), 0);
  const prizeDiscounts = tablesClosed.reduce((a, r) => a + (r._sum.discount ?? 0), 0);
  const tableRows = (["CASH", "CARD", "PIX"] as PaymentMethodValue[]).map((m) => {
    const row = tablesClosed.find((r) => r.paidWith === m);
    return { label: PAYMENT_LABEL[m].replace(" (na entrega)", ""), total: row?._sum.total ?? 0, count: row?._count ?? 0 };
  });
  const typeRows = (["DELIVERY", "TABLE", "PICKUP"] as OrderTypeValue[]).map((t) => {
    const row = byType.find((r) => r.type === t);
    return { label: ORDER_TYPE_LABEL[t], total: row?._sum.total ?? 0, count: row?._count ?? 0 };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Financeiro</h1>
          <p className="text-sm text-stone-500">Pedidos não cancelados do dia selecionado.</p>
        </div>
        <form className="flex gap-2" method="get">
          <input type="date" name="data" defaultValue={date} className="input w-auto" />
          <button className="btn-ghost">Ver</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vendas do dia" value={formatBRL(revenue)} />
        <Stat label="Pedidos" value={String(count)} />
        <Stat label="Ticket médio" value={formatBRL(avgTicket)} />
        <Stat label="Taxas de entrega" value={formatBRL(totals._sum.deliveryFee ?? 0)} hint={`${canceled} cancelado(s)`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="Por forma de pagamento" rows={paymentRows} total={revenue} />
        <Breakdown title="Por canal" rows={typeRows} total={revenue} />
        <Breakdown title={`Mesas fechadas no caixa (${tablesClosed.reduce((a, r) => a + r._count, 0)})`} rows={tableRows} total={tablesTotal} />
        {prizeDiscounts > 0 && (
          <section className="card p-5">
            <h2 className="mb-2 font-display text-lg font-bold">🎄 Mesa Premiada</h2>
            <p className="text-sm text-stone-500">Desconto concedido hoje pela campanha (já abatido do valor recebido nas mesas):</p>
            <p className="mt-1 font-display text-3xl font-extrabold text-brand-700">− {formatBRL(prizeDiscounts)}</p>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; total: number; count: number }[];
  total: number;
}) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 font-display text-lg font-bold">{title}</h2>
      <ul className="space-y-4">
        {rows.map((r) => {
          const pct = total ? Math.round((r.total / total) * 100) : 0;
          return (
            <li key={r.label} className="text-sm">
              <div className="mb-1 flex justify-between">
                <span>
                  {r.label} <span className="text-stone-500">({r.count})</span>
                </span>
                <span className="font-semibold tabular-nums">
                  {formatBRL(r.total)} <span className="font-normal text-stone-500">· {pct}%</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-stone-100">
                <div className="h-2.5 rounded-full bg-gradient-to-r from-brand-500 to-mega-400" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
