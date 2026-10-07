import Link from "next/link";
import { requirePageSession } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { financeReport, storeNow } from "@/lib/finance";
import { PAYMENTS, PRESETS, TYPES, type SearchParams, brDateLabel, first, parsePayment, parsePeriod, parseType, toQuery } from "@/lib/reports";
import { BarChart } from "@/components/admin/BarChart";
import type { OrderTypeValue, PaymentMethodValue } from "@/types/order";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro" };

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default async function FinancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageSession(["MANAGER"]);
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const type = parseType(first(sp.tipo));
  const payment = parsePayment(first(sp.pag));

  const [r, now] = await Promise.all([financeReport({ period, type, payment }), storeNow()]);

  const oneDay = period.days === 1;
  const periodLabel = oneDay ? brDateLabel(period.from) : `${brDateLabel(period.from)} a ${brDateLabel(period.to)}`;
  const filterQuery = { tipo: type, pag: payment };
  const dateQuery = { de: period.from, ate: period.to };

  const paymentRows = (PAYMENTS as PaymentMethodValue[]).map((m) => {
    const row = r.byPayment.find((x) => x.key === m);
    return { label: PAYMENT_LABEL[m], total: row?.total ?? 0, count: row?.count ?? 0 };
  });
  const typeRows = (["DELIVERY", "TABLE", "PICKUP"] as OrderTypeValue[]).map((t) => {
    const row = r.byType.find((x) => x.key === t);
    return { label: ORDER_TYPE_LABEL[t], total: row?.total ?? 0, count: row?.count ?? 0 };
  });
  const tablesTotal = r.tablesClosed.reduce((a, x) => a + x.total, 0);
  const tablesCount = r.tablesClosed.reduce((a, x) => a + x.count, 0);
  const prizeDiscounts = r.tablesClosed.reduce((a, x) => a + x.discount, 0);
  const tableRows = (["CASH", "CARD", "PIX"] as PaymentMethodValue[]).map((m) => {
    const row = r.tablesClosed.find((x) => x.key === m);
    return { label: PAYMENT_LABEL[m].replace(" (na entrega)", ""), total: row?.total ?? 0, count: row?.count ?? 0 };
  });
  const weekdayRows = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ label: WEEKDAYS[d], total: r.byWeekday[d].total, count: r.byWeekday[d].count }));

  // Horas: só a faixa em que houve movimento.
  const firstHour = r.byHour.findIndex((h) => h.count > 0);
  const lastHour = 23 - [...r.byHour].reverse().findIndex((h) => h.count > 0);
  const hourData = firstHour < 0 ? [] : r.byHour.slice(firstHour, lastHour + 1).map((h, i) => ({ label: `${firstHour + i}h`, value: h.total, count: h.count }));
  const dayData = r.byDay.map((d) => ({ label: `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}`, value: d.total, count: d.count }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Financeiro</h1>
          <p className="text-sm text-stone-500">
            Período: <strong className="text-stone-700">{periodLabel}</strong> · vendas = pedidos não cancelados, pela data do pedido.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link href={`/admin/historico${toQuery({ ...dateQuery, ...filterQuery })}`} className="btn-ghost">
            🔎 Ver pedidos do período
          </Link>
          <a href={`/api/admin/finance/export${toQuery({ ...dateQuery, ...filterQuery })}`} className="btn-ghost">
            ⬇️ Baixar planilha
          </a>
        </div>
      </div>

      {/* ---------- Agora na loja ---------- */}
      <section className="card flex flex-wrap items-center gap-x-8 gap-y-3 p-4 print:hidden" aria-label="Agora na loja">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-stone-500">Agora na loja</h2>
        <Now label="Aguardando aceite" value={now.pending} href="/admin" alert={now.pending > 0} />
        <Now label="Em preparo" value={now.preparing} href="/admin" />
        <Now label="Saiu / pronto" value={now.out} href="/admin/despacho" />
        <Now label="Mesas abertas" value={now.openTables} href="/admin/comandas" extra={now.openTables > 0 ? formatBRL(now.openTablesTotal) : undefined} />
      </section>

      {/* ---------- Filtros ---------- */}
      <section className="card space-y-3 p-4 print:hidden" aria-label="Filtros">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Link
              key={p.id}
              href={`/admin/financeiro${toQuery({ p: p.id, ...filterQuery })}`}
              className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                period.preset === p.id ? "bg-ink-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,1fr)_auto]">
          <label className="text-xs font-semibold text-stone-600">
            De
            <input type="date" name="de" defaultValue={period.from} className="input mt-1" />
          </label>
          <label className="text-xs font-semibold text-stone-600">
            Até
            <input type="date" name="ate" defaultValue={period.to} className="input mt-1" />
          </label>
          <label className="text-xs font-semibold text-stone-600">
            Canal
            <select name="tipo" defaultValue={type ?? ""} className="input mt-1">
              <option value="">Todos</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORDER_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-600">
            Pagamento
            <select name="pag" defaultValue={payment ?? ""} className="input mt-1">
              <option value="">Todos</option>
              {PAYMENTS.map((p) => (
                <option key={p} value={p}>
                  {PAYMENT_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className="btn-primary w-full">Aplicar</button>
          </div>
        </form>
      </section>

      {/* ---------- Números principais ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Vendas"
          value={formatBRL(r.revenue)}
          hint={
            r.revenueDelta === null
              ? `Período anterior: ${formatBRL(r.prevRevenue)}`
              : `${r.revenueDelta >= 0 ? "▲" : "▼"} ${Math.abs(r.revenueDelta)}% vs. período anterior (${formatBRL(r.prevRevenue)})`
          }
          tone={r.revenueDelta === null ? undefined : r.revenueDelta >= 0 ? "up" : "down"}
        />
        <Stat label="Pedidos" value={r.count.toLocaleString("pt-BR")} hint={`Período anterior: ${r.prevCount}`} />
        <Stat label="Ticket médio" value={formatBRL(r.avgTicket)} hint="Valor médio por pedido" />
        <Stat label="Clientes atendidos" value={r.distinctCustomers.toLocaleString("pt-BR")} hint="Telefones diferentes (delivery e balcão)" />
        <Stat label="Vendas em produtos" value={formatBRL(r.products)} hint="Sem as taxas de entrega" />
        <Stat label="Taxas de entrega" value={formatBRL(r.deliveryFees)} />
        <Stat label="Cancelados" value={String(r.canceledCount)} hint={r.canceledCount ? `${formatBRL(r.canceledValue)} que deixaram de entrar` : "Nenhum pedido cancelado"} />
        <Stat label="Desconto Mesa Premiada" value={prizeDiscounts ? `− ${formatBRL(prizeDiscounts)}` : formatBRL(0)} hint="Já abatido do recebido nas mesas" />
      </div>

      {/* ---------- Gráficos ---------- */}
      <div className={`grid gap-4 ${oneDay ? "" : "xl:grid-cols-2"}`}>
        {!oneDay && (
          <section className="card p-5">
            <h2 className="mb-4 font-display text-lg font-bold">Vendas por dia</h2>
            <BarChart data={dayData} title="Vendas por dia" unit="Dia" />
          </section>
        )}
        <section className="card p-5">
          <h2 className="mb-4 font-display text-lg font-bold">Vendas por horário</h2>
          <BarChart data={hourData} title="Vendas por horário" unit="Hora" />
        </section>
      </div>

      {/* ---------- Divisões ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="Por forma de pagamento" rows={paymentRows} total={r.revenue} />
        <Breakdown title="Por canal" rows={typeRows} total={r.revenue} />
        {!oneDay && <Breakdown title="Por dia da semana" rows={weekdayRows} total={r.revenue} />}
        <Breakdown title={`Mesas fechadas no caixa (${tablesCount})`} rows={tableRows} total={tablesTotal} note="Valor recebido no caixa ao fechar as mesas no período (não segue os filtros de canal e pagamento)." />
      </div>

      {/* ---------- Rankings ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Ranking
          title="Produtos mais vendidos"
          head={["Produto", "Qtd.", "Vendas"]}
          rows={r.topProducts.map((p) => [p.name, p.quantity.toLocaleString("pt-BR"), formatBRL(p.total)])}
        />
        <Ranking
          title="Bairros que mais pedem"
          head={["Bairro", "Pedidos", "Vendas", "Taxas"]}
          rows={r.topDistricts.map((d) => [d.name, String(d.count), formatBRL(d.total), formatBRL(d.fees)])}
        />
        <Ranking
          title="Melhores clientes"
          head={["Cliente", "Telefone", "Pedidos", "Vendas"]}
          rows={r.topCustomers.map((c) => [c.name, c.phone, String(c.count), formatBRL(c.total)])}
        />
        <Ranking
          title="Entregadores"
          head={["Entregador", "Entregas", "Taxas", "Vendas"]}
          rows={r.drivers.map((d) => [d.name, String(d.count), formatBRL(d.fees), formatBRL(d.total)])}
        />
      </div>
    </div>
  );
}

function Now({ label, value, href, extra, alert }: { label: string; value: number; href: string; extra?: string; alert?: boolean }) {
  return (
    <Link href={href} className="group flex items-baseline gap-2">
      <span className={`font-display text-2xl font-extrabold tabular-nums ${alert ? "text-brand-600" : ""}`}>{value}</span>
      <span className="text-sm text-stone-600 group-hover:underline">
        {label}
        {extra && <span className="text-stone-400"> · {extra}</span>}
      </span>
    </Link>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "up" | "down" }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className={`mt-1 text-xs ${tone === "up" ? "font-semibold text-emerald-700" : tone === "down" ? "font-semibold text-brand-700" : "text-stone-500"}`}>{hint}</p>}
    </div>
  );
}

function Breakdown({ title, rows, total, note }: { title: string; rows: { label: string; total: number; count: number }[]; total: number; note?: string }) {
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
      {note && <p className="mt-4 text-xs text-stone-500">{note}</p>}
    </section>
  );
}

function Ranking({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 font-display text-lg font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500">Sem dados neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-stone-500">
              <tr>
                <th className="w-8 py-2">#</th>
                {head.map((h, i) => (
                  <th key={h} className={`py-2 ${i > 0 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, n) => (
                <tr key={n} className="border-t border-stone-100">
                  <td className="py-2 text-stone-400">{n + 1}</td>
                  {row.map((cell, i) => (
                    <td key={i} className={`py-2 ${i > 0 ? "text-right tabular-nums" : "font-medium"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
