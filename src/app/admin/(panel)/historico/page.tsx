import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { itemTitle } from "@/lib/item-title";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL, STATUS_LABEL } from "@/lib/labels";
import { PrintButton } from "@/components/admin/PrintButton";
import {
  PAYMENTS,
  STATUSES,
  TYPES,
  type SearchParams,
  dayStart,
  first,
  isDate,
  parsePayment,
  parseStatus,
  parseType,
  searchWhere,
  toQuery,
} from "@/lib/reports";

export const dynamic = "force-dynamic";
export const metadata = { title: "Histórico de pedidos" };

const PAGE_SIZE = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const timeOnly = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-brand-100 text-brand-800",
  PREPARING: "bg-mega-100 text-mega-700",
  OUT_FOR_DELIVERY: "bg-sky-100 text-sky-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELED: "bg-stone-200 text-stone-600",
};
const TYPE_ICON: Record<string, string> = { DELIVERY: "🛵", PICKUP: "🛍️", TABLE: "🪑" };

const include = {
  items: true,
  driver: { select: { name: true } },
  tableSession: { select: { closedAt: true, paidWith: true, discount: true } },
} satisfies Prisma.OrderInclude;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageSession();
  const sp = await searchParams;

  const q = first(sp.q).trim().slice(0, 80);
  const de = isDate(first(sp.de)) ? first(sp.de) : "";
  const ate = isDate(first(sp.ate)) ? first(sp.ate) : "";
  const type = parseType(first(sp.tipo));
  const status = parseStatus(first(sp.status));
  const payment = parsePayment(first(sp.pag));
  const page = Math.min(Math.max(Number.parseInt(first(sp.pagina), 10) || 1, 1), 100_000);

  const and: Prisma.OrderWhereInput[] = [];
  const search = searchWhere(q);
  if (search) and.push(search);
  if (de) and.push({ createdAt: { gte: dayStart(de) } });
  if (ate) and.push({ createdAt: { lt: new Date(dayStart(ate).getTime() + DAY_MS) } });
  if (type) and.push({ type });
  if (status) and.push({ status });
  if (payment) and.push({ paymentMethod: payment });
  const where: Prisma.OrderWhereInput = and.length ? { AND: and } : {};

  const [count, sum, firstOrder, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.aggregate({ where: { AND: [where, { status: { not: "CANCELED" } }] }, _sum: { total: true } }),
    prisma.order.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.order.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const filters = { q, de, ate, tipo: type, status, pag: payment };
  const hasFilter = Object.values(filters).some(Boolean);
  const pageLink = (n: number) => `/admin/historico${toQuery({ ...filters, pagina: n > 1 ? n : null })}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">Histórico de pedidos</h1>
        <p className="text-sm text-stone-500">
          Todos os pedidos já feitos ficam guardados aqui — nada é apagado.
          {firstOrder && <> Primeiro pedido registrado em {dateTime.format(firstOrder.createdAt).slice(0, 10)}.</>}
        </p>
      </div>

      <form method="get" className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(5,1fr)_auto]">
        <label className="text-xs font-semibold text-stone-600 sm:col-span-2 lg:col-span-1">
          Buscar
          <input name="q" defaultValue={q} placeholder="Nº do pedido, nome, telefone ou bairro" className="input mt-1" />
        </label>
        <label className="text-xs font-semibold text-stone-600">
          De
          <input type="date" name="de" defaultValue={de} className="input mt-1" />
        </label>
        <label className="text-xs font-semibold text-stone-600">
          Até
          <input type="date" name="ate" defaultValue={ate} className="input mt-1" />
        </label>
        <label className="text-xs font-semibold text-stone-600">
          Tipo
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
          Situação
          <select name="status" defaultValue={status ?? ""} className="input mt-1">
            <option value="">Todas</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
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
        <div className="flex items-end gap-2">
          <button className="btn-primary flex-1">Buscar</button>
          {hasFilter && (
            <Link href="/admin/historico" className="btn-ghost py-2.5">
              Limpar
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-stone-600" role="status">
        <strong>{count.toLocaleString("pt-BR")}</strong> {count === 1 ? "pedido encontrado" : "pedidos encontrados"}
        {count > 0 && (
          <>
            {" "}
            · <strong>{formatBRL(sum._sum.total ?? 0)}</strong> em vendas (sem os cancelados)
          </>
        )}
      </p>

      {orders.length === 0 ? (
        <div className="card p-10 text-center text-stone-500">
          <p className="text-4xl" aria-hidden>
            🔎
          </p>
          <p className="mt-2 font-semibold text-stone-700">Nenhum pedido encontrado</p>
          <p className="text-sm">Confira os filtros ou tente buscar por outro nome, telefone ou número.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => {
            const address = [o.addressStreet && `${o.addressStreet}, ${o.addressNumber ?? "s/n"}`, o.addressDistrict, o.addressComplement, o.addressReference && `Ref.: ${o.addressReference}`]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={o.id} className="card overflow-hidden">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-4 transition hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
                    <span className="w-16 font-display text-lg font-extrabold tabular-nums">#{o.number}</span>
                    <span className="w-36 text-sm text-stone-600">{dateTime.format(o.createdAt)}</span>
                    <span className="w-40 text-sm">
                      <span aria-hidden>{TYPE_ICON[o.type]}</span> {o.type === "TABLE" && o.tableNumber ? `Mesa ${o.tableNumber}` : ORDER_TYPE_LABEL[o.type]}
                    </span>
                    <span className="min-w-40 flex-1 text-sm">
                      <span className="font-semibold">{o.customerName}</span>
                      {o.customerPhone && <span className="text-stone-500"> · {o.customerPhone}</span>}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                    <span className={`w-28 text-right font-display text-lg font-bold tabular-nums ${o.status === "CANCELED" ? "text-stone-400 line-through" : ""}`}>
                      {formatBRL(o.total)}
                    </span>
                    <span className="text-stone-400 transition group-open:rotate-180" aria-hidden>
                      ▾
                    </span>
                  </summary>

                  <div className="grid gap-5 border-t border-stone-100 bg-stone-50/60 p-4 text-sm lg:grid-cols-[1.4fr_1fr_1fr]">
                    <section>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Itens</h3>
                      <ul className="space-y-1.5">
                        {o.items.map((i) => {
                          const addons = Array.isArray(i.addons) ? (i.addons as { name?: string }[]).map((a) => a?.name).filter(Boolean) : [];
                          return (
                            <li key={i.id} className="flex justify-between gap-3">
                              <span>
                                <strong>{i.quantity}×</strong> {itemTitle(i)}
                                {i.variantName && <span className="text-stone-500"> ({i.variantName})</span>}
                                {addons.length > 0 && <span className="block pl-5 text-stone-500">+ {addons.join(", ")}</span>}
                                {i.notes && <span className="block pl-5 italic text-stone-500">Obs.: {i.notes}</span>}
                              </span>
                              <span className="shrink-0 tabular-nums">{formatBRL(i.totalPrice)}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <dl className="mt-3 space-y-1 border-t border-stone-200 pt-2">
                        <Row label="Subtotal" value={formatBRL(o.subtotal)} />
                        {o.type === "DELIVERY" && <Row label="Taxa de entrega" value={o.deliveryFee === null ? "não definida" : formatBRL(o.deliveryFee)} />}
                        <Row label="Total" value={formatBRL(o.total)} strong />
                      </dl>
                      {o.notes && <p className="mt-2 rounded-lg bg-mega-50 p-2 text-stone-700">📝 {o.notes}</p>}
                    </section>

                    <section className="space-y-1">
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Cliente e pagamento</h3>
                      <p>
                        <strong>{o.customerName}</strong>
                      </p>
                      {o.customerPhone && (
                        <p>
                          <a href={`https://wa.me/55${o.customerPhone}`} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">
                            WhatsApp {o.customerPhone}
                          </a>
                        </p>
                      )}
                      {address && <p className="text-stone-600">📍 {address}</p>}
                      <p className="pt-2">
                        💳 {PAYMENT_LABEL[o.paymentMethod]}
                        {o.changeFor ? ` · troco para ${formatBRL(o.changeFor)}` : ""}
                      </p>
                      {o.tableSession && (
                        <p className="text-stone-600">
                          {o.tableSession.closedAt
                            ? `Mesa fechada em ${timeOnly.format(o.tableSession.closedAt)}${o.tableSession.paidWith ? ` · paga em ${PAYMENT_LABEL[o.tableSession.paidWith].replace(" (na entrega)", "")}` : ""}`
                            : "Comanda da mesa ainda aberta"}
                          {o.tableSession.discount > 0 && ` · Mesa Premiada: − ${formatBRL(o.tableSession.discount)} na conta`}
                        </p>
                      )}
                      {o.driver && <p className="text-stone-600">🛵 Entregador: {o.driver.name}</p>}
                    </section>

                    <section>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Andamento</h3>
                      <dl className="space-y-1">
                        <Row label="Pedido feito" value={timeOnly.format(o.createdAt)} />
                        {o.acceptedAt && <Row label="Aceito" value={timeOnly.format(o.acceptedAt)} />}
                        {o.dispatchedAt && <Row label={o.type === "DELIVERY" ? "Saiu para entrega" : "Pronto"} value={timeOnly.format(o.dispatchedAt)} />}
                        {o.completedAt && <Row label="Concluído" value={timeOnly.format(o.completedAt)} />}
                        {o.canceledAt && <Row label="Cancelado" value={timeOnly.format(o.canceledAt)} />}
                      </dl>
                      {/* <a> comum: sem pré-carregar 30 páginas de acompanhamento a cada tela */}
                      <a href={`/pedido/${o.trackingToken}`} target="_blank" rel="noopener" className="mt-3 inline-block text-brand-700 underline">
                        Abrir página de acompanhamento
                      </a>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <PrintButton kind="pedido" id={o.id} />
                        {o.tableSessionId && <PrintButton kind="mesa" id={o.tableSessionId} label="🖨️ Conta da mesa" />}
                      </div>
                    </section>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Páginas">
          {page > 1 ? (
            <Link href={pageLink(page - 1)} className="btn-ghost">
              ← Anterior
            </Link>
          ) : (
            <span className="btn-ghost opacity-40">← Anterior</span>
          )}
          <span className="text-sm text-stone-600">
            Página <strong>{Math.min(page, pages)}</strong> de {pages}
          </span>
          {page < pages ? (
            <Link href={pageLink(page + 1)} className="btn-ghost">
              Próxima →
            </Link>
          ) : (
            <span className="btn-ghost opacity-40">Próxima →</span>
          )}
        </nav>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-bold" : ""}`}>
      <dt className={strong ? "" : "text-stone-500"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
