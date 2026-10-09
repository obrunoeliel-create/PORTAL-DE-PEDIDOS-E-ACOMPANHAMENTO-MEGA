"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QueuedClose, SnapOrder, SnapTable, Snapshot } from "@/types/contingency";
import { formatBRL } from "@/lib/money";
import { itemTitle } from "@/lib/item-title";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL, STATUS_LABEL } from "@/lib/labels";
import { fetchSnapshot, flushQueue, loadDone, loadQueue, loadSnapshot, saveDone, saveQueue } from "@/lib/contingency-store";
import { getPaperWidth } from "@/lib/print-client";
import { Items, Row, Sep, receiptCss } from "@/components/print/Receipt";

// Modo contingência: funciona sem internet com a última cópia guardada neste computador.
// Dá para consultar e imprimir tudo, e fechar mesas (o fechamento é enviado quando a internet voltar).

const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const PAY: { v: "CASH" | "CARD" | "PIX"; label: string }[] = [
  { v: "CASH", label: "💵 Dinheiro" },
  { v: "CARD", label: "💳 Cartão" },
  { v: "PIX", label: "⚡ PIX" },
];
const PAY_NAME = { CASH: "Dinheiro", CARD: "Cartão", PIX: "PIX" } as const;
const TABS = [
  { id: "mesas", label: "🪑 Mesas abertas" },
  { id: "andamento", label: "🛵 Entregas e balcão" },
  { id: "recentes", label: "🗂️ Últimos pedidos" },
] as const;
type Tab = (typeof TABS)[number]["id"];
type PrintJob = { kind: "table"; table: SnapTable; paid?: QueuedClose } | { kind: "order"; order: SnapOrder };

export function ContingencyApp() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [queue, setQueue] = useState<QueuedClose[]>([]);
  const [done, setDone] = useState<Record<string, true>>({});
  const [online, setOnline] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [tab, setTab] = useState<Tab>("mesas");
  const [paying, setPaying] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [job, setJob] = useState<PrintJob | null>(null);
  const [width, setWidth] = useState("80");

  const sync = useCallback(async () => {
    const r = await fetchSnapshot();
    if (r.kind === "ok") {
      setOnline(true);
      setNeedLogin(false);
      const left = await flushQueue(r.snapshot);
      setQueue(left);
      // Depois de enviar fechamentos, pega a lista já atualizada.
      const again = left.length === 0 ? await fetchSnapshot() : null;
      setSnap(again?.kind === "ok" ? again.snapshot : r.snapshot);
    } else if (r.kind === "unauthorized") {
      setOnline(true);
      setNeedLogin(true);
    } else {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    setWidth(getPaperWidth());
    (async () => {
      const [s, q, d] = await Promise.all([loadSnapshot(), loadQueue(), loadDone()]);
      setSnap(s);
      setQueue(q);
      setDone(d);
      setLoaded(true);
      await sync();
    })();
    const id = setInterval(sync, 20_000);
    const on = () => void sync();
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [sync]);

  // Imprime o cupom montado nesta própria tela (funciona sem internet).
  useEffect(() => {
    if (!job) return;
    const after = () => setJob(null);
    window.addEventListener("afterprint", after);
    const t = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", after);
    };
  }, [job]);

  const queued = useMemo(() => new Map(queue.map((q) => [q.sessionId, q])), [queue]);

  async function closeTable(t: SnapTable, paidWith: "CASH" | "CARD" | "PIX" | null) {
    const charged = Math.max(0, t.total - Math.min(t.total, t.prizeDiscount));
    const item: QueuedClose = {
      id: `${t.sessionId}-${Date.now()}`,
      sessionId: t.sessionId,
      tableNumber: t.tableNumber,
      paidWith: charged > 0 ? paidWith : null,
      expectedTotal: t.total,
      charged,
      at: new Date().toISOString(),
    };
    const next = [...queue.filter((q) => q.sessionId !== t.sessionId), item];
    setQueue(next);
    await saveQueue(next);
    setPaying(null);
    void sync();
  }

  async function undoClose(sessionId: string) {
    const next = queue.filter((q) => q.sessionId !== sessionId);
    setQueue(next);
    await saveQueue(next);
  }

  async function toggleDone(orderId: string) {
    const next = { ...done };
    if (next[orderId]) delete next[orderId];
    else next[orderId] = true;
    setDone(next);
    await saveDone(next);
  }

  const recent = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/[^0-9]/g, "");
    const list = snap?.recentOrders ?? [];
    if (!q) return list.slice(0, 60);
    return list.filter(
      (o) =>
        o.customerName.toLowerCase().includes(q) ||
        (digits.length > 0 && (String(o.number) === digits || o.customerPhone.includes(digits))) ||
        (o.addressDistrict ?? "").toLowerCase().includes(q),
    );
  }, [snap, search]);

  const openTables = (snap?.tables ?? []).filter((t) => !queued.has(t.sessionId));
  const closedOffline = (snap?.tables ?? []).filter((t) => queued.has(t.sessionId));
  const toReceive = openTables.reduce((a, t) => a + t.total, 0);

  return (
    <div className="min-h-screen bg-[#f4f1ec] text-ink-900">
      <style>{`
        .ct-print { display: none; }
        @media print {
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .ct-print, .ct-print * { visibility: visible !important; }
          .ct-print { display: block; position: absolute; left: 0; top: 0; }
          ${receiptCss(width)}
        }
      `}</style>

      <header className={`sticky top-0 z-20 px-4 py-3 text-white shadow-lift ${online ? "bg-ink-950" : "bg-brand-700"}`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
          <div className="leading-tight">
            <p className="font-display text-lg font-extrabold">🛟 Modo Contingência</p>
            <p className="text-xs text-white/80">{snap?.storeName ?? "Mega Esfiha Jurema"}</p>
          </div>
          <p className="flex-1 text-sm" role="status">
            {online ? (
              <span className="font-semibold text-emerald-300">● Com internet</span>
            ) : (
              <span className="font-bold">⚠️ SEM INTERNET — mostrando a última cópia guardada neste computador</span>
            )}
            {snap && <span className="block text-xs text-white/80">Dados atualizados em {dateTime(snap.generatedAt)}</span>}
          </p>
          <button onClick={() => void sync()} className="rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold transition hover:bg-white/25">
            ↻ Atualizar
          </button>
          <a href="/admin" className="rounded-xl bg-mega-400 px-3 py-2 text-sm font-bold text-ink-900">
            Voltar ao portal
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4">
        {needLogin && (
          <p className="rounded-2xl bg-mega-100 p-3 text-sm font-medium text-mega-700 ring-1 ring-mega-300">
            A sessão venceu.{" "}
            <a href="/admin/login" className="font-bold underline">
              Entre de novo no portal
            </a>{" "}
            para atualizar os dados e enviar as mesas fechadas.
          </p>
        )}

        {loaded && !snap && (
          <div className="card p-8 text-center">
            <p className="text-4xl" aria-hidden>
              📭
            </p>
            <p className="mt-2 font-semibold">Ainda não há cópia guardada neste computador.</p>
            <p className="text-sm text-stone-500">Abra o portal com internet uma vez; a cópia é feita sozinha a cada 30 segundos.</p>
          </div>
        )}

        {queue.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-card ring-2 ring-mega-400" aria-label="Mesas fechadas sem internet">
            <h2 className="font-display text-base font-bold">
              📤 {queue.length} {queue.length === 1 ? "mesa fechada" : "mesas fechadas"} aguardando envio
            </h2>
            <p className="text-xs text-stone-500">Quando a internet voltar, o sistema registra o fechamento sozinho. Não precisa fazer nada.</p>
            <ul className="mt-2 divide-y divide-stone-100 text-sm">
              {queue.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong>Mesa {q.tableNumber}</strong> · {formatBRL(q.charged)} {q.paidWith ? `em ${PAY_NAME[q.paidWith]}` : "(sem cobrança)"} · às {time(q.at)}
                    {q.problem && <span className="block font-semibold text-brand-700">⚠️ {q.problem}</span>}
                  </span>
                  <button onClick={() => undoClose(q.sessionId)} className="text-xs text-stone-500 underline">
                    Desfazer
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {snap && (
          <>
            <nav className="flex flex-wrap gap-2" aria-label="Seções">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? "bg-ink-900 text-white" : "bg-white text-stone-700 shadow-card"}`}
                >
                  {t.label}
                  <span className="ml-1.5 opacity-70">
                    {t.id === "mesas" ? openTables.length : t.id === "andamento" ? snap.activeOrders.length : snap.recentOrders.length}
                  </span>
                </button>
              ))}
            </nav>

            {tab === "mesas" && (
              <section className="space-y-3">
                <p className="text-sm text-stone-600">
                  <strong>{openTables.length}</strong> {openTables.length === 1 ? "mesa aberta" : "mesas abertas"} · <strong>{formatBRL(toReceive)}</strong> a receber
                </p>
                {openTables.length === 0 && <p className="card p-8 text-center text-stone-500">Nenhuma mesa aberta na última cópia.</p>}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {openTables.map((t) => {
                    const discount = Math.min(t.total, t.prizeDiscount);
                    const toPay = t.total - discount;
                    return (
                      <article key={t.sessionId} data-table={t.tableNumber} className="card flex flex-col overflow-hidden">
                        <header className="flex items-center justify-between bg-ink-950 px-4 py-3 text-white">
                          <div>
                            <p className="text-xs uppercase tracking-widest text-mega-400">Mesa</p>
                            <p className="font-display text-3xl font-black leading-none">{t.tableNumber}</p>
                          </div>
                          <div className="text-right text-xs text-white/70">
                            aberta às {time(t.openedAt)}
                            <p className="font-display text-xl font-extrabold text-white">{formatBRL(toPay)}</p>
                          </div>
                        </header>
                        <ul className="flex-1 divide-y divide-stone-100 px-4 text-sm">
                          {t.orders.map((o) => (
                            <li key={o.id} className="py-2">
                              <p className="font-display font-bold">
                                #{o.number} <span className="font-sans font-normal text-stone-500">· {o.customerName}</span>
                              </p>
                              <ul className="text-stone-600">
                                {o.items.map((i) => (
                                  <li key={i.id} className="flex justify-between gap-2">
                                    <span>
                                      {i.quantity}x {itemTitle(i)}
                                      {i.variantName ? ` (${i.variantName})` : ""}
                                    </span>
                                    <span className="whitespace-nowrap">{formatBRL(i.totalPrice)}</span>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                        <footer className="space-y-2 border-t border-stone-100 bg-[#faf7f2] p-4">
                          {discount > 0 && (
                            <p className="rounded-lg bg-mega-100 p-2 text-xs font-semibold text-mega-700">
                              🎁 Mesa Premiada: total {formatBRL(t.total)} − desconto {formatBRL(discount)}
                            </p>
                          )}
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm text-stone-500">Total a cobrar</span>
                            <span className="font-display text-2xl font-extrabold">{formatBRL(toPay)}</span>
                          </div>
                          {t.hasPending && <p className="rounded-lg bg-brand-50 p-2 text-xs font-medium text-brand-800">Há pedido desta mesa aguardando aceite.</p>}
                          <button onClick={() => setJob({ kind: "table", table: t })} className="btn-ghost w-full">
                            🖨️ Imprimir conta
                          </button>
                          {paying === t.sessionId ? (
                            <div className="space-y-2">
                              <p className="text-sm font-semibold">Como o cliente pagou {formatBRL(toPay)}?</p>
                              <div className="grid grid-cols-3 gap-2">
                                {PAY.map((p) => (
                                  <button key={p.v} onClick={() => closeTable(t, p.v)} className="btn-ghost px-2 py-2.5 text-xs font-bold">
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                              <button onClick={() => setPaying(null)} className="w-full text-xs text-stone-500 underline">
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => (toPay > 0 ? setPaying(t.sessionId) : closeTable(t, null))} className="btn-primary w-full py-3">
                              ✅ Receber e fechar mesa
                            </button>
                          )}
                        </footer>
                      </article>
                    );
                  })}
                </div>
                {closedOffline.length > 0 && (
                  <p className="text-xs text-stone-500">
                    Fechadas sem internet (somem daqui quando o envio for confirmado): {closedOffline.map((t) => `Mesa ${t.tableNumber}`).join(", ")}.
                  </p>
                )}
              </section>
            )}

            {tab === "andamento" && (
              <section className="space-y-3">
                {snap.activeOrders.length === 0 && <p className="card p-8 text-center text-stone-500">Nenhum pedido de entrega ou balcão em andamento na última cópia.</p>}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {snap.activeOrders.map((o) => (
                    <OrderCardOffline key={o.id} order={o} done={!!done[o.id]} onDone={() => toggleDone(o.id)} onPrint={() => setJob({ kind: "order", order: o })} />
                  ))}
                </div>
                <p className="text-xs text-stone-500">
                  &quot;Entregue&quot; aqui é só uma anotação neste computador. Quando a internet voltar, conclua os pedidos na tela de Pedidos.
                </p>
              </section>
            )}

            {tab === "recentes" && (
              <section className="space-y-3">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por número, nome, telefone ou bairro"
                  className="input max-w-md"
                  aria-label="Buscar nos últimos pedidos"
                />
                {recent.length === 0 && <p className="card p-8 text-center text-stone-500">Nenhum pedido encontrado na cópia.</p>}
                <ul className="space-y-2">
                  {recent.map((o) => (
                    <li key={o.id} className="card overflow-hidden">
                      <details>
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm [&::-webkit-details-marker]:hidden">
                          <span className="w-14 font-display text-base font-extrabold">#{o.number}</span>
                          <span className="w-28 text-stone-600">{dateTime(o.createdAt)}</span>
                          <span className="w-36">{o.type === "TABLE" && o.tableNumber ? `Mesa ${o.tableNumber}` : ORDER_TYPE_LABEL[o.type]}</span>
                          <span className="min-w-32 flex-1 font-semibold">{o.customerName}</span>
                          <span className="text-xs text-stone-500">{STATUS_LABEL[o.status].split(" / ")[0]}</span>
                          <span className="w-24 text-right font-display font-bold">{formatBRL(o.total)}</span>
                        </summary>
                        <div className="border-t border-stone-100 bg-stone-50/60 p-3">
                          <OrderDetails order={o} />
                          <button onClick={() => setJob({ kind: "order", order: o })} className="btn-ghost mt-3">
                            🖨️ Imprimir
                          </button>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      {/* Cupom montado aqui mesmo: só aparece no papel. */}
      <div className="ct-print">{job && snap && <div className="receipt">{job.kind === "table" ? <TableReceipt table={job.table} storeName={snap.storeName} /> : <OrderReceipt order={job.order} storeName={snap.storeName} />}</div>}</div>
    </div>
  );
}

function OrderDetails({ order: o }: { order: SnapOrder }) {
  return (
    <div className="space-y-2 text-sm">
      {o.customerPhone && <p className="text-stone-600">📞 {o.customerPhone}</p>}
      {o.type === "DELIVERY" && (
        <p className="rounded-lg bg-white p-2 ring-1 ring-stone-200">
          📍 <strong>
            {o.addressStreet}, {o.addressNumber ?? "s/n"}
          </strong>
          {o.addressComplement && ` — ${o.addressComplement}`} · {o.addressDistrict}
          {o.addressReference && <span className="block text-stone-500">Ref.: {o.addressReference}</span>}
        </p>
      )}
      <ul>
        {o.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            <span>
              <strong>{i.quantity}x</strong> {itemTitle(i)}
              {i.variantName ? ` (${i.variantName})` : ""}
              {i.addons.length > 0 && <span className="block pl-5 text-stone-500">+ {i.addons.map((a) => a.name).join(", ")}</span>}
              {i.notes && <span className="block pl-5 italic text-stone-500">Obs.: {i.notes}</span>}
            </span>
            <span className="whitespace-nowrap">{formatBRL(i.totalPrice)}</span>
          </li>
        ))}
      </ul>
      {o.notes && <p className="rounded-lg bg-mega-50 p-2">📝 {o.notes}</p>}
      <div className="border-t border-stone-200 pt-2">
        {o.type === "DELIVERY" && (
          <p className="flex justify-between text-stone-600">
            <span>Taxa de entrega</span>
            <span>{o.deliveryFee === null ? "a definir" : formatBRL(o.deliveryFee)}</span>
          </p>
        )}
        <p className="flex justify-between font-display text-lg font-extrabold">
          <span>Total</span>
          <span>{formatBRL(o.total)}</span>
        </p>
        <p className="text-stone-600">
          💳 {PAYMENT_LABEL[o.paymentMethod]}
          {o.changeFor ? ` · troco para ${formatBRL(o.changeFor)} (levar ${formatBRL(Math.max(0, o.changeFor - o.total))})` : ""}
        </p>
        {o.driverName && <p className="text-stone-600">🛵 {o.driverName}</p>}
      </div>
    </div>
  );
}

function OrderCardOffline({ order: o, done, onDone, onPrint }: { order: SnapOrder; done: boolean; onDone: () => void; onPrint: () => void }) {
  return (
    <article data-order={o.number} className={`card space-y-3 p-4 ${done ? "opacity-60" : ""}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl font-extrabold">#{o.number}</p>
          <p className="text-sm text-stone-500">
            {time(o.createdAt)} · {STATUS_LABEL[o.status].split(" / ")[0]}
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold">{ORDER_TYPE_LABEL[o.type]}</span>
      </header>
      <p className="font-semibold">{o.customerName}</p>
      <OrderDetails order={o} />
      <div className="flex gap-2">
        <button onClick={onPrint} className="btn-ghost flex-1">
          🖨️ Imprimir
        </button>
        <button onClick={onDone} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${done ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-700"}`}>
          {done ? "✔ Entregue (anotado)" : "Marcar entregue"}
        </button>
      </div>
    </article>
  );
}

const printNow = () => new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function TableReceipt({ table: t, storeName }: { table: SnapTable; storeName: string }) {
  const discount = Math.min(t.total, t.prizeDiscount);
  return (
    <>
      <div className="r-center">
        <div className="r-store">{storeName}</div>
        <div className="r-small">Aberta às {time(t.openedAt)}</div>
        <Sep />
        <div className="r-big">MESA {t.tableNumber}</div>
        <div className="r-tag">CONTA</div>
      </div>
      <Sep />
      {t.orders.map((o) => (
        <div key={o.id}>
          <Row left={<strong>Pedido #{o.number}</strong>} right={o.customerName} className="r-small" />
          <Items items={o.items} />
          <Sep />
        </div>
      ))}
      <Row left={`Total (${t.orders.length} ${t.orders.length === 1 ? "pedido" : "pedidos"})`} right={formatBRL(t.total)} />
      {discount > 0 && <Row left="Desconto Mesa Premiada" right={`- ${formatBRL(discount)}`} />}
      <Row className="r-total" left="TOTAL A PAGAR" right={formatBRL(t.total - discount)} />
      <Sep />
      <div className="r-center r-small">Pagamento no caixa. Obrigado pela preferência!</div>
      <div className="r-center r-small">Impresso em {printNow()} (contingência)</div>
    </>
  );
}

function OrderReceipt({ order: o, storeName }: { order: SnapOrder; storeName: string }) {
  const title = o.type === "TABLE" && o.tableNumber ? `MESA ${o.tableNumber}` : o.type === "DELIVERY" ? "DELIVERY" : "RETIRADA NO BALCÃO";
  return (
    <>
      <div className="r-center">
        <div className="r-store">{storeName}</div>
        <div className="r-small">{dateTime(o.createdAt)}</div>
        <Sep />
        <div className="r-big">PEDIDO #{o.number}</div>
        <div className="r-tag">{title}</div>
      </div>
      <Sep />
      <div>
        <strong>Cliente:</strong> {o.customerName}
      </div>
      {o.customerPhone && (
        <div>
          <strong>Telefone:</strong> {o.customerPhone}
        </div>
      )}
      {o.type === "DELIVERY" && (
        <div className="r-box">
          <div>
            <strong>
              {o.addressStreet}, {o.addressNumber ?? "s/n"}
            </strong>
          </div>
          {o.addressComplement && <div>{o.addressComplement}</div>}
          <div>
            <strong>Bairro:</strong> {o.addressDistrict}
          </div>
          {o.addressReference && <div>Ref.: {o.addressReference}</div>}
        </div>
      )}
      <Sep />
      <Items items={o.items} />
      {o.notes && (
        <div className="r-box">
          <strong>OBS:</strong> {o.notes}
        </div>
      )}
      <Sep />
      <Row left="Subtotal" right={formatBRL(o.subtotal)} />
      {o.type === "DELIVERY" && <Row left="Taxa de entrega" right={o.deliveryFee === null ? "a definir" : formatBRL(o.deliveryFee)} />}
      <Row className="r-total" left="TOTAL" right={formatBRL(o.total)} />
      <Sep />
      <div>
        <strong>Pagamento:</strong> {PAYMENT_LABEL[o.paymentMethod]}
      </div>
      {o.changeFor ? (
        <div>
          <strong>Troco para:</strong> {formatBRL(o.changeFor)} (levar {formatBRL(Math.max(0, o.changeFor - o.total))})
        </div>
      ) : null}
      <Sep />
      <div className="r-center r-small">Impresso em {printNow()} (contingência)</div>
    </>
  );
}
