"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBRL, parseBRL } from "@/lib/money";
import { BarChart } from "./BarChart";

async function api<T = Record<string, unknown>>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("Sessão expirada.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Falha na operação.");
  return data as T;
}

const TZ = "America/Sao_Paulo";
const fmtDate = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(d)) : "—");
const fmtDateTime = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "—");
const fmtPhone = (p: string) => (p.length === 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : p);
const pts = (n: number) => n.toLocaleString("pt-BR");
const TIERS = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];
const TIER_LABEL: Record<string, string> = { BRONZE: "🥉 Bronze", PRATA: "🥈 Prata", OURO: "🥇 Ouro", DIAMANTE: "💎 Diamante" };
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useCallback(async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const t = await fn();
      if (t) setMsg({ ok: true, text: t });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, msg, run, setMsg };
}

function Flash({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`rounded-2xl p-3 text-sm font-medium ring-1 ${msg.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-brand-50 text-brand-800 ring-brand-200"}`} role="status">{msg.text}</p>;
}

const MANAGER_TABS = [
  { id: "painel", label: "Painel", icon: "📊" },
  { id: "validar", label: "Validar resgate", icon: "✅" },
  { id: "socios", label: "Sócios", icon: "👥" },
  { id: "recompensas", label: "Recompensas", icon: "🎁" },
  { id: "missoes", label: "Missões", icon: "🎯" },
  { id: "campanhas", label: "Campanhas de pontos", icon: "🔥" },
  { id: "regras", label: "Níveis e regras", icon: "⚙️" },
  { id: "auditoria", label: "Auditoria", icon: "🛡️" },
] as const;
type TabId = (typeof MANAGER_TABS)[number]["id"];

export function ClubAdmin({ isManager }: { isManager: boolean }) {
  const [tab, setTab] = useState<TabId>(isManager ? "painel" : "validar");
  const tabs = isManager ? MANAGER_TABS : MANAGER_TABS.filter((t) => t.id === "validar");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">⭐ Clube Mega Jurema</h1>
        <p className="text-sm text-stone-500">Quanto mais você volta, mais vantagens conquista. Pontos, níveis, missões e recompensas.</p>
      </div>
      {tabs.length > 1 && (
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-ink-950 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      )}
      {tab === "painel" && <Dashboard />}
      {tab === "validar" && <Validate isManager={isManager} />}
      {tab === "socios" && <Members />}
      {tab === "recompensas" && <Rewards />}
      {tab === "missoes" && <Missions />}
      {tab === "campanhas" && <Campaigns />}
      {tab === "regras" && <Rules />}
      {tab === "auditoria" && <Audit />}
    </div>
  );
}

// ---------------- Painel ----------------
type Dash = {
  kpis: Record<string, number>;
  byTier: { label: string; value: number }[];
  byWeekday: { label: string; value: number; count: number }[];
  byHour: { label: string; value: number; count: number }[];
  birthdays: { id: string; name: string; phone: string; day: number; tier: string }[];
  top: { id: string; name: string; phone: string; tier: string; pointsEarned12m: number; pointsBalance: number; lastOrderAt: string | null }[];
  risk: { id: string; name: string; phone: string; tier: string; days: number; usual: number; pointsBalance: number }[];
  insights: string[];
};

function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Dash>("/api/admin/club").then(setD, (e) => setErr((e as Error).message));
  }, []);
  if (err) return <p className="card p-6 text-sm text-brand-700">{err}</p>;
  if (!d) return <p className="card p-6 text-sm text-stone-500">Carregando…</p>;
  const k = d.kpis;
  const cards = [
    ["Sócios", pts(k.members), `+${k.newMembers} neste mês`],
    ["Ativos (60 dias)", pts(k.activeMembers), `retenção ${k.retention}%`],
    ["Inativos", pts(k.inactiveMembers), "sem pedir há 60+ dias"],
    ["VIP (Ouro/Diamante)", pts(k.vip), "clube VIP"],
    ["Receita sócios (30d)", formatBRL(k.revenue30Members), `${k.ordersMembers30} pedidos`],
    ["Ticket sócio x não sócio", formatBRL(k.ticketMembers), `não sócio: ${formatBRL(k.ticketOthers)}`],
    ["Pontos emitidos (30d)", pts(k.pointsIssued30), `usados: ${pts(k.pointsRedeemed30)}`],
    ["Resgates (30d)", pts(k.redemptionsIssued30), `${k.redemptionsUsed30} já usados`],
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([l, v, s]) => (
          <div key={l} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{l}</p>
            <p className="mt-1 font-display text-2xl font-extrabold">{v}</p>
            <p className="text-xs text-stone-500">{s}</p>
          </div>
        ))}
      </div>

      {d.insights.length > 0 && (
        <section className="card space-y-2 bg-gradient-to-br from-amber-50 to-white p-5">
          <h2 className="font-display text-lg font-bold">🧠 Sugestões inteligentes</h2>
          <ul className="space-y-1.5 text-sm text-stone-700">
            {d.insights.map((i) => (
              <li key={i}>💡 {i}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-display font-bold">Vendas por dia da semana (90 dias)</h2>
          <BarChart data={d.byWeekday} title="Vendas por dia da semana" />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-display font-bold">Vendas por horário (90 dias)</h2>
          <BarChart data={d.byHour} title="Vendas por horário" />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-display font-bold">Sócios por nível</h2>
          <BarChart data={d.byTier} format="int" title="Sócios por nível" />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-display font-bold">🎂 Aniversariantes do mês</h2>
          {d.birthdays.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum aniversariante cadastrado neste mês.</p>
          ) : (
            <ul className="max-h-56 divide-y divide-stone-100 overflow-y-auto text-sm">
              {d.birthdays.map((b) => (
                <li key={b.id} className="flex justify-between py-1.5">
                  <span>
                    <b>dia {b.day}</b> · {b.name} {TIER_LABEL[b.tier]?.split(" ")[0]}
                  </span>
                  <span className="text-stone-500">{fmtPhone(b.phone)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 font-display font-bold">⚠️ Em risco de sumir</h2>
          <p className="mb-3 text-xs text-stone-500">Sócios que estão demorando mais que o dobro do normal para voltar.</p>
          {d.risk.length === 0 ? (
            <p className="text-sm text-stone-500">Ninguém em risco agora. 🎉</p>
          ) : (
            <ul className="max-h-72 divide-y divide-stone-100 overflow-y-auto text-sm">
              {d.risk.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>
                    {r.name} {TIER_LABEL[r.tier]?.split(" ")[0]} <span className="text-stone-500">· {pts(r.pointsBalance)} pts</span>
                  </span>
                  <span className="text-stone-500">
                    {r.days} dias sem pedir (costuma {r.usual})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-display font-bold">🏆 Melhores sócios (12 meses)</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {d.top.map((t, i) => (
              <li key={t.id} className="flex justify-between py-1.5">
                <span>
                  {i + 1}. {t.name} {TIER_LABEL[t.tier]?.split(" ")[0]}
                </span>
                <span className="text-stone-500">
                  {pts(t.pointsEarned12m)} pts · último {fmtDate(t.lastOrderAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ---------------- Validar resgate (caixa) ----------------
type Red = { code: string; rewardName: string; emoji: string; kind: string; description: string; value: number; status: string; expiresAt: string; usedAt: string | null; usedBy: string | null; usedWhere: string | null; customer: { name: string; phoneEnd: string; tier: string } };

function Validate({ isManager }: { isManager: boolean }) {
  const [code, setCode] = useState("");
  const [where, setWhere] = useState("Caixa");
  const [red, setRed] = useState<Red | null>(null);
  const [recent, setRecent] = useState<{ code: string; rewardName: string; customer: string; usedAt: string; usedBy: string; usedWhere: string }[]>([]);
  const { busy, msg, run, setMsg } = useAction();
  const loadRecent = useCallback(() => api<{ recent: typeof recent }>("/api/admin/club/redemptions?recent=1").then((r) => setRecent(r.recent), () => {}), []);
  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const lookup = (e?: React.FormEvent) => {
    e?.preventDefault();
    setRed(null);
    run(async () => {
      const r = await api<{ redemption: Red }>(`/api/admin/club/redemptions?code=${encodeURIComponent(code)}`);
      setRed(r.redemption);
    });
  };
  const act = (action: "use" | "cancel") =>
    run(async () => {
      if (!red) return;
      if (action === "cancel" && !confirm("Cancelar este resgate e devolver os pontos ao cliente?")) return;
      await api("/api/admin/club/redemptions", "POST", { code: red.code, action, where });
      setRed(null);
      setCode("");
      await loadRecent();
      return action === "use" ? `✅ Baixa feita: ${red.rewardName} para ${red.customer.name}.` : "Resgate cancelado e pontos devolvidos.";
    });

  const STATUS: Record<string, string> = { ISSUED: "✅ VÁLIDO — pode entregar", USED: "⛔ JÁ USADO", EXPIRED: "⛔ VENCIDO", CANCELED: "⛔ CANCELADO" };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card space-y-4 p-5">
        <h2 className="font-display text-lg font-bold">Conferir código do cliente</h2>
        <form onSubmit={lookup} className="flex gap-2">
          <input
            autoFocus
            className="input font-mono text-lg uppercase"
            placeholder="MJ-ABCD-1234 (ou leia o QR Code)"
            value={code}
            onChange={(e) => (setCode(e.target.value.toUpperCase()), setMsg(null))}
            maxLength={20}
          />
          <button className="btn-primary shrink-0" disabled={busy || code.length < 8}>
            Conferir
          </button>
        </form>
        <p className="text-xs text-stone-500">Um leitor de código de barras/QR ligado no computador digita o código sozinho neste campo.</p>
        <Flash msg={msg} />
        {red && (
          <div className={`space-y-2 rounded-2xl p-4 ring-2 ${red.status === "ISSUED" ? "bg-emerald-50 ring-emerald-300" : "bg-brand-50 ring-brand-300"}`}>
            <p className="font-display text-lg font-extrabold">{STATUS[red.status]}</p>
            <p className="text-2xl">
              {red.emoji} <b>{red.rewardName}</b>
            </p>
            <p className="text-sm text-stone-600">{red.description}</p>
            <p className="text-sm">
              Cliente: <b>{red.customer.name}</b> (WhatsApp final {red.customer.phoneEnd}) · {TIER_LABEL[red.customer.tier]}
            </p>
            <p className="text-sm text-stone-600">Válido até {fmtDate(red.expiresAt)}</p>
            {red.usedAt && (
              <p className="text-sm text-stone-600">
                Usado em {fmtDateTime(red.usedAt)} · {red.usedBy} · {red.usedWhere}
              </p>
            )}
            {red.status === "ISSUED" && (
              <>
                {red.kind !== "PRODUCT" && <p className="rounded-xl bg-white p-2 text-xs text-stone-600">É um vale de desconto: dê o desconto no caixa ou lance o pedido no portal com este código no campo de cupom (aí não precisa dar baixa aqui).</p>}
                <label className="flex items-center gap-2 text-sm">
                  Onde:
                  <select className="input w-auto" value={where} onChange={(e) => setWhere(e.target.value)}>
                    <option>Caixa</option>
                    <option>Balcão</option>
                    <option>Delivery</option>
                    <option>Mesa</option>
                  </select>
                </label>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" disabled={busy} onClick={() => act("use")}>
                    ✅ Dar baixa (entregar)
                  </button>
                  {isManager && (
                    <button className="btn-ghost" disabled={busy} onClick={() => act("cancel")}>
                      Cancelar
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>
      <section className="card p-5">
        <h2 className="mb-3 font-display text-lg font-bold">Últimas baixas</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-stone-500">Nenhum resgate usado ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {recent.map((r) => (
              <li key={r.code} className="py-1.5">
                <b>{r.rewardName}</b> · {r.customer}
                <span className="block text-xs text-stone-500">
                  {fmtDateTime(r.usedAt)} · {r.usedBy} · {r.usedWhere} · <span className="font-mono">{r.code}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------- Sócios ----------------
type MemberRow = { id: string; name: string; phone: string; tier: string; pointsBalance: number; pointsEarned12m: number; totalSavings: number; lastOrderAt: string | null; clubJoinedAt: string; birthDate: string | null; city: string | null };
type MemberDetail = {
  member: Record<string, string | number | boolean | null> & { id: string; name: string; phone: string; tier: string; points: number };
  crm: { firstOrder: string | null; lastOrder: string | null; orders: number; total: number; avgTicket: number; favoritePayment: string | null; favoriteProducts: { name: string; qty: number }[]; favoriteWeekday: string | null; favoriteHour: string | null; couponsUsed: string[]; referrals: { name: string; createdAt: string }[] };
  ledger: { id: string; delta: number; kind: string; description: string; createdAt: string; createdBy: string | null }[];
  redemptions: { code: string; rewardName: string; status: string; createdAt: string; usedAt: string | null; usedBy: string | null }[];
};

function Members() {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; pageSize: number; members: MemberRow[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => api<typeof data & object>(`/api/admin/club/members?${new URLSearchParams({ q, tier, page: String(page) })}`).then(setData, () => {}), 250);
    return () => clearTimeout(id);
  }, [q, tier, page]);
  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
  if (open) return <MemberCard id={open} onBack={() => setOpen(null)} />;
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-2 p-4">
        <input className="input min-w-[14rem] flex-1" placeholder="Buscar por nome, telefone ou código de indicação" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} />
        <select className="input w-auto" value={tier} onChange={(e) => (setTier(e.target.value), setPage(0))}>
          <option value="">Todos os níveis</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </select>
        <a href="/api/admin/club/export" className="btn-ghost">
          ⬇️ Exportar (Excel)
        </a>
      </div>
      {!data ? (
        <p className="card p-6 text-sm text-stone-500">Carregando…</p>
      ) : data.members.length === 0 ? (
        <p className="card p-6 text-sm text-stone-500">Nenhum sócio encontrado.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="p-3">Sócio</th>
                <th className="p-3">Nível</th>
                <th className="p-3">Saldo</th>
                <th className="p-3">12 meses</th>
                <th className="p-3">Economia</th>
                <th className="p-3">Último pedido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.members.map((m) => (
                <tr key={m.id} className="cursor-pointer hover:bg-stone-50" onClick={() => setOpen(m.id)}>
                  <td className="p-3">
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-xs text-stone-500">
                      {fmtPhone(m.phone)}
                      {m.city ? ` · ${m.city}` : ""}
                    </p>
                  </td>
                  <td className="p-3">{TIER_LABEL[m.tier]}</td>
                  <td className="p-3 font-semibold">{pts(m.pointsBalance)}</td>
                  <td className="p-3">{pts(m.pointsEarned12m)}</td>
                  <td className="p-3">{formatBRL(m.totalSavings)}</td>
                  <td className="p-3">{fmtDate(m.lastOrderAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Anteriores
          </button>
          <span>
            Página {page + 1} de {pages}
          </span>
          <button className="btn-ghost" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Próximas →
          </button>
        </div>
      )}
    </div>
  );
}

function MemberCard({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<MemberDetail | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const { busy, msg, run } = useAction();
  const load = useCallback(() => api<MemberDetail>(`/api/admin/club/members?id=${id}`).then(setD, () => {}), [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const adjust = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const n = Number(delta);
      if (!Number.isInteger(n) || n === 0) throw new Error("Informe os pontos (ex: 50 ou -50).");
      if (!confirm(`${n > 0 ? "Dar" : "Tirar"} ${Math.abs(n)} pontos de ${d?.member.name}? Fica registrado na auditoria.`)) return;
      await api("/api/admin/club/members", "POST", { customerId: id, delta: n, reason });
      setDelta("");
      setReason("");
      await load();
      return "Pontos ajustados.";
    });
  };
  if (!d) return <p className="card p-6 text-sm text-stone-500">Carregando…</p>;
  const m = d.member;
  const PAY: Record<string, string> = { PIX: "PIX", CARD: "Cartão", CASH: "Dinheiro", ON_SITE: "Na loja" };
  return (
    <div className="space-y-4">
      <button className="text-sm font-semibold text-brand-700" onClick={onBack}>
        ← Voltar
      </button>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-1 p-5 text-sm">
          <h2 className="font-display text-xl font-extrabold">{m.name}</h2>
          <p>{TIER_LABEL[m.tier]}</p>
          <p className="font-display text-3xl font-extrabold">{pts(m.points)} pts</p>
          <p className="text-stone-600">12 meses: {pts(Number(m.earned12m))} · economia {formatBRL(Number(m.savings))}</p>
          <p className="pt-2 text-stone-600">📱 {fmtPhone(m.phone)}</p>
          {m.email && <p className="text-stone-600">✉️ {String(m.email)}</p>}
          {m.city && <p className="text-stone-600">📍 {String(m.city)}</p>}
          {m.birthDate && <p className="text-stone-600">🎂 {fmtDate(String(m.birthDate))}</p>}
          <p className="text-stone-600">Código: {String(m.referralCode ?? "—")}{m.referredBy ? ` · indicado por ${String(m.referredBy)}` : ""}</p>
          <p className="text-stone-600">Promoções: {m.marketingOptIn ? "aceita ✅" : "não aceita"}</p>
          <p className="text-stone-600">Sócio desde {fmtDate(String(m.clubJoinedAt))}</p>
        </section>
        <section className="card space-y-1 p-5 text-sm lg:col-span-2">
          <h3 className="font-display font-bold">CRM</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <p>Primeira compra: <b>{fmtDate(d.crm.firstOrder)}</b></p>
            <p>Última compra: <b>{fmtDate(d.crm.lastOrder)}</b></p>
            <p>Pedidos: <b>{d.crm.orders}</b></p>
            <p>Total gasto: <b>{formatBRL(d.crm.total)}</b></p>
            <p>Ticket médio: <b>{formatBRL(d.crm.avgTicket)}</b></p>
            <p>Pagamento favorito: <b>{d.crm.favoritePayment ? PAY[d.crm.favoritePayment] : "—"}</b></p>
            <p>Dia preferido: <b>{d.crm.favoriteWeekday ?? "—"}</b></p>
            <p>Horário preferido: <b>{d.crm.favoriteHour ?? "—"}</b></p>
            <p>Cupons usados: <b>{d.crm.couponsUsed.join(", ") || "—"}</b></p>
          </div>
          <p className="pt-2">Favoritos: <b>{d.crm.favoriteProducts.map((p) => `${p.name} (${p.qty})`).join(" · ") || "—"}</b></p>
          <p>Indicou: <b>{d.crm.referrals.map((r) => r.name).join(", ") || "ninguém ainda"}</b></p>
          <form onSubmit={adjust} className="flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
            <label className="text-xs font-semibold text-stone-600">
              Ajustar pontos
              <input className="input mt-1 w-28" placeholder="+50 ou -50" value={delta} onChange={(e) => setDelta(e.target.value)} />
            </label>
            <label className="min-w-[12rem] flex-1 text-xs font-semibold text-stone-600">
              Motivo
              <input className="input mt-1" placeholder="Ex: pedido feito por telefone sem cadastro" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} />
            </label>
            <button className="btn-primary" disabled={busy}>
              Lançar
            </button>
          </form>
          <Flash msg={msg} />
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-2 font-display font-bold">Extrato</h3>
          <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto text-sm">
            {d.ledger.map((l) => (
              <li key={l.id} className="flex justify-between gap-2 py-1.5">
                <span>
                  {l.description}
                  <span className="block text-xs text-stone-500">
                    {fmtDateTime(l.createdAt)}
                    {l.createdBy ? ` · ${l.createdBy}` : ""}
                  </span>
                </span>
                <b className={l.delta > 0 ? "text-emerald-700" : "text-brand-700"}>
                  {l.delta > 0 ? "+" : ""}
                  {pts(l.delta)}
                </b>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h3 className="mb-2 font-display font-bold">Resgates</h3>
          {d.redemptions.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum resgate.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {d.redemptions.map((r) => (
                <li key={r.code} className="py-1.5">
                  <b>{r.rewardName}</b> <span className="font-mono text-xs">{r.code}</span>
                  <span className="block text-xs text-stone-500">
                    {{ ISSUED: "Para usar", USED: "Usado", EXPIRED: "Vencido", CANCELED: "Cancelado" }[r.status]} · resgatado {fmtDate(r.createdAt)}
                    {r.usedAt ? ` · baixa ${fmtDateTime(r.usedAt)} (${r.usedBy})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------- Cadastros genéricos ----------------
function useList<T>(entity: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const load = useCallback(() => api<{ items: T[] }>(`/api/admin/club/${entity}`).then((r) => setItems(r.items), () => {}), [entity]);
  useEffect(() => {
    void load();
  }, [load]);
  return { items, load };
}

type RewardItem = { id: string; name: string; description: string; kind: string; value: number; pointsCost: number; minTier: string; emoji: string; stock: number | null; active: boolean; sort: number; issued: number; used: number };

function Rewards() {
  const { items, load } = useList<RewardItem>("rewards");
  const empty = { name: "", description: "", kind: "PRODUCT", value: "", pointsCost: "", minTier: "BRONZE", emoji: "🎁", stock: "" };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const { busy, msg, run } = useAction();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const value = form.kind === "PERCENT" ? Number(form.value) : form.value.trim() ? parseBRL(form.value) : 0;
      if (value === null || Number.isNaN(value)) throw new Error("Valor inválido.");
      const body = { name: form.name, description: form.description, kind: form.kind, value, pointsCost: Number(form.pointsCost), minTier: form.minTier, emoji: form.emoji || "🎁", stock: form.stock.trim() ? Number(form.stock) : null };
      if (editing) await api(`/api/admin/club/rewards/${editing}`, "PATCH", body);
      else await api("/api/admin/club/rewards", "POST", body);
      setForm(empty);
      setEditing(null);
      await load();
      return "Recompensa salva.";
    });
  };
  const edit = (r: RewardItem) => {
    setEditing(r.id);
    setForm({ name: r.name, description: r.description, kind: r.kind, value: r.kind === "PERCENT" ? String(r.value) : r.value ? formatBRL(r.value) : "", pointsCost: String(r.pointsCost), minTier: r.minTier, emoji: r.emoji, stock: r.stock === null ? "" : String(r.stock) });
  };
  const toggle = (r: RewardItem) => run(async () => (await api(`/api/admin/club/rewards/${r.id}`, "PATCH", { active: !r.active }), await load(), undefined));
  const remove = (r: RewardItem) => confirm(`Excluir "${r.name}"?`) && run(async () => (await api(`/api/admin/club/rewards/${r.id}`, "DELETE"), await load(), "Excluída."));
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <form onSubmit={save} className="card space-y-3 p-5 text-sm">
        <h2 className="font-display text-lg font-bold">{editing ? "Editar recompensa" : "Nova recompensa"}</h2>
        <div className="flex gap-2">
          <input className="input w-16 text-center text-xl" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} maxLength={8} aria-label="Ícone" />
          <input className="input flex-1" placeholder="Nome. Ex: Refrigerante 2 litros" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} />
        </div>
        <input className="input" placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} />
        <div className="grid grid-cols-2 gap-2">
          <label>
            Tipo
            <select className="input mt-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="PRODUCT">Produto / brinde (retira)</option>
              <option value="DISCOUNT">Vale-compras (R$)</option>
              <option value="PERCENT">Desconto (%)</option>
            </select>
          </label>
          <label>
            {form.kind === "PERCENT" ? "Desconto (%)" : form.kind === "DISCOUNT" ? "Valor do vale" : "Valor de referência"}
            <input className="input mt-1" placeholder={form.kind === "PERCENT" ? "15" : "R$ 10,00"} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </label>
          <label>
            Custo em pontos
            <input className="input mt-1" type="number" min={1} value={form.pointsCost} onChange={(e) => setForm({ ...form, pointsCost: e.target.value })} required />
          </label>
          <label>
            Nível mínimo
            <select className="input mt-1" value={form.minTier} onChange={(e) => setForm({ ...form, minTier: e.target.value })}>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estoque (vazio = ilimitado)
            <input className="input mt-1" type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </label>
        </div>
        <p className="text-xs text-stone-500">Dica: com 1 ponto por real, um custo de 100 pontos devolve ao cliente o valor da recompensa a cada R$ 100 gastos. Mantenha entre 5% e 10% para o clube se pagar.</p>
        <Flash msg={msg} />
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy}>
            Salvar
          </button>
          {editing && (
            <button type="button" className="btn-ghost" onClick={() => (setEditing(null), setForm(empty))}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>
      <section className="space-y-2">
        {!items ? (
          <p className="card p-6 text-sm text-stone-500">Carregando…</p>
        ) : (
          items.map((r) => (
            <div key={r.id} className={`card flex flex-wrap items-center gap-3 p-4 text-sm ${r.active ? "" : "opacity-60"}`}>
              <span className="text-3xl">{r.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {r.name} <span className="text-xs text-stone-500">{r.minTier !== "BRONZE" && TIER_LABEL[r.minTier]}</span>
                </p>
                <p className="text-xs text-stone-500">
                  {pts(r.pointsCost)} pts · {r.kind === "PRODUCT" ? "produto" : r.kind === "DISCOUNT" ? `vale ${formatBRL(r.value)}` : `${r.value}%`} · {r.issued} resgates, {r.used} usados
                  {r.stock !== null && ` · estoque ${r.stock}`}
                </p>
              </div>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => edit(r)}>
                Editar
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => toggle(r)}>
                {r.active ? "Desativar" : "Ativar"}
              </button>
              {r.issued === 0 && (
                <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => remove(r)}>
                  Excluir
                </button>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

type MissionItem = { id: string; name: string; description: string; emoji: string; kind: string; target: number; weekday: number | null; periodDays: number | null; rewardPoints: number; minTier: string; repeatable: boolean; endsAt: string | null; active: boolean; people: number; completions: number };
const MISSION_KINDS: Record<string, { label: string; target: string }> = {
  ORDERS: { label: "Fazer X pedidos", target: "Quantos pedidos" },
  SPEND: { label: "Gastar R$ X", target: "Valor (R$)" },
  DISTINCT_PRODUCTS: { label: "Provar X sabores diferentes", target: "Quantos sabores" },
  WEEKDAY: { label: "Pedir num dia da semana", target: "Quantas vezes" },
  MIN_TICKET: { label: "Pedido acima de R$ X", target: "Valor mínimo (R$)" },
  REFERRALS: { label: "Indicar X amigos", target: "Quantos amigos" },
};

function Missions() {
  const { items, load } = useList<MissionItem>("missions");
  const empty = { name: "", description: "", emoji: "🎯", kind: "ORDERS", target: "", weekday: "2", periodDays: "", rewardPoints: "", minTier: "BRONZE", repeatable: false, endsAt: "" };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const { busy, msg, run } = useAction();
  const money = form.kind === "SPEND" || form.kind === "MIN_TICKET";
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const target = money ? parseBRL(form.target) : Number(form.target);
      if (!target) throw new Error("Informe a meta.");
      const body = {
        name: form.name,
        description: form.description,
        emoji: form.emoji || "🎯",
        kind: form.kind,
        target,
        weekday: form.kind === "WEEKDAY" ? Number(form.weekday) : null,
        periodDays: form.periodDays.trim() ? Number(form.periodDays) : null,
        rewardPoints: Number(form.rewardPoints),
        minTier: form.minTier,
        repeatable: form.repeatable,
        endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59-03:00`).toISOString() : null,
      };
      if (editing) await api(`/api/admin/club/missions/${editing}`, "PATCH", body);
      else await api("/api/admin/club/missions", "POST", body);
      setForm(empty);
      setEditing(null);
      await load();
      return "Missão salva.";
    });
  };
  const edit = (m: MissionItem) => {
    setEditing(m.id);
    const isMoney = m.kind === "SPEND" || m.kind === "MIN_TICKET";
    setForm({ name: m.name, description: m.description, emoji: m.emoji, kind: m.kind, target: isMoney ? formatBRL(m.target) : String(m.target), weekday: String(m.weekday ?? 2), periodDays: m.periodDays ? String(m.periodDays) : "", rewardPoints: String(m.rewardPoints), minTier: m.minTier, repeatable: m.repeatable, endsAt: m.endsAt ? m.endsAt.slice(0, 10) : "" });
  };
  const toggle = (m: MissionItem) => run(async () => (await api(`/api/admin/club/missions/${m.id}`, "PATCH", { active: !m.active }), await load(), undefined));
  const remove = (m: MissionItem) => confirm(`Excluir "${m.name}"?`) && run(async () => (await api(`/api/admin/club/missions/${m.id}`, "DELETE"), await load(), "Excluída."));
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <form onSubmit={save} className="card space-y-3 p-5 text-sm">
        <h2 className="font-display text-lg font-bold">{editing ? "Editar missão" : "Nova missão"}</h2>
        <div className="flex gap-2">
          <input className="input w-16 text-center text-xl" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} maxLength={8} aria-label="Ícone" />
          <input className="input flex-1" placeholder="Nome. Ex: Festival da Esfiha" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} />
        </div>
        <input className="input" placeholder="O que o cliente precisa fazer (aparece para ele)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} />
        <label className="block">
          Tipo
          <select className="input mt-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(MISSION_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            {MISSION_KINDS[form.kind].target}
            <input className="input mt-1" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder={money ? "R$ 100,00" : "3"} required />
          </label>
          {form.kind === "WEEKDAY" && (
            <label>
              Dia
              <select className="input mt-1" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: e.target.value })}>
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Prêmio (pontos)
            <input className="input mt-1" type="number" min={1} value={form.rewardPoints} onChange={(e) => setForm({ ...form, rewardPoints: e.target.value })} required />
          </label>
          <label>
            Contar só os últimos (dias)
            <input className="input mt-1" type="number" min={1} placeholder="vazio = sem limite" value={form.periodDays} onChange={(e) => setForm({ ...form, periodDays: e.target.value })} />
          </label>
          <label>
            Nível mínimo
            <select className="input mt-1" value={form.minTier} onChange={(e) => setForm({ ...form, minTier: e.target.value })}>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Termina em (opcional)
            <input className="input mt-1" type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.repeatable} onChange={(e) => setForm({ ...form, repeatable: e.target.checked })} />
          Repetível (depois de cumprir, começa de novo)
        </label>
        <Flash msg={msg} />
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy}>
            Salvar
          </button>
          {editing && (
            <button type="button" className="btn-ghost" onClick={() => (setEditing(null), setForm(empty))}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>
      <section className="space-y-2">
        {!items ? (
          <p className="card p-6 text-sm text-stone-500">Carregando…</p>
        ) : (
          items.map((m) => (
            <div key={m.id} className={`card flex flex-wrap items-center gap-3 p-4 text-sm ${m.active ? "" : "opacity-60"}`}>
              <span className="text-3xl">{m.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.name}</p>
                <p className="text-xs text-stone-500">
                  {m.description} · +{pts(m.rewardPoints)} pts{m.repeatable ? " · repetível" : ""} · {m.people} clientes cumpriram ({m.completions}x)
                </p>
              </div>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => edit(m)}>
                Editar
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => toggle(m)}>
                {m.active ? "Desativar" : "Ativar"}
              </button>
              {m.people === 0 && (
                <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => remove(m)}>
                  Excluir
                </button>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

type CampaignItem = { id: string; name: string; multiplier: number; startsAt: string; endsAt: string; weekdays: string; hourFrom: number; hourTo: number; minTier: string; active: boolean };

function Campaigns() {
  const { items, load } = useList<CampaignItem>("campaigns");
  const today = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const [form, setForm] = useState({ name: "", multiplier: "200", start: today, end: today, weekdays: "0123456", hourFrom: "0", hourTo: "24", minTier: "BRONZE" });
  const { busy, msg, run } = useAction();
  const PRESETS = [
    { name: "Pontos em dobro no fim de semana", multiplier: "200", weekdays: "06" },
    { name: "Terça turbinada (triplo)", multiplier: "300", weekdays: "2" },
    { name: "Happy Hour (18h às 20h)", multiplier: "200", weekdays: "0123456", hourFrom: "18", hourTo: "20" },
    { name: "Dia da Pizza", multiplier: "200", weekdays: "0123456" },
    { name: "Black Friday", multiplier: "300", weekdays: "0123456" },
  ];
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/api/admin/club/campaigns", "POST", {
        name: form.name,
        multiplier: Number(form.multiplier),
        startsAt: new Date(`${form.start}T00:00:00-03:00`).toISOString(),
        endsAt: new Date(`${form.end}T23:59:59-03:00`).toISOString(),
        weekdays: form.weekdays,
        hourFrom: Number(form.hourFrom),
        hourTo: Number(form.hourTo),
        minTier: form.minTier,
      });
      await load();
      return "Campanha criada — já vale nos dias e horários escolhidos.";
    });
  };
  const toggleDay = (d: number) => setForm((f) => ({ ...f, weekdays: f.weekdays.includes(String(d)) ? f.weekdays.replace(String(d), "") : [...f.weekdays, String(d)].sort().join("") }));
  const toggle = (c: CampaignItem) => run(async () => (await api(`/api/admin/club/campaigns/${c.id}`, "PATCH", { active: !c.active }), await load(), undefined));
  const remove = (c: CampaignItem) => confirm(`Excluir "${c.name}"?`) && run(async () => (await api(`/api/admin/club/campaigns/${c.id}`, "DELETE"), await load(), undefined));
  const now = Date.now();
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
      <form onSubmit={save} className="card space-y-3 p-5 text-sm">
        <h2 className="font-display text-lg font-bold">Nova campanha de pontos</h2>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="rounded-full bg-stone-100 px-3 py-1 text-xs hover:bg-stone-200" onClick={() => setForm((f) => ({ ...f, name: p.name, multiplier: p.multiplier, weekdays: p.weekdays, hourFrom: p.hourFrom ?? "0", hourTo: p.hourTo ?? "24" }))}>
              {p.name}
            </button>
          ))}
        </div>
        <input className="input" placeholder="Nome (aparece para o cliente)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} />
        <div className="grid grid-cols-2 gap-2">
          <label>
            Multiplicador
            <select className="input mt-1" value={form.multiplier} onChange={(e) => setForm({ ...form, multiplier: e.target.value })}>
              <option value="150">1,5x</option>
              <option value="200">Dobro (2x)</option>
              <option value="300">Triplo (3x)</option>
              <option value="500">5x</option>
            </select>
          </label>
          <label>
            Para quem
            <select className="input mt-1" value={form.minTier} onChange={(e) => setForm({ ...form, minTier: e.target.value })}>
              <option value="BRONZE">Todos os sócios</option>
              <option value="PRATA">Prata para cima</option>
              <option value="OURO">VIP (Ouro e Diamante)</option>
              <option value="DIAMANTE">Só Diamante</option>
            </select>
          </label>
          <label>
            Começa
            <input className="input mt-1" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
          </label>
          <label>
            Termina
            <input className="input mt-1" type="date" value={form.end} min={form.start} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
          </label>
          <label>
            Das (hora)
            <input className="input mt-1" type="number" min={0} max={23} value={form.hourFrom} onChange={(e) => setForm({ ...form, hourFrom: e.target.value })} />
          </label>
          <label>
            Até (hora)
            <input className="input mt-1" type="number" min={1} max={24} value={form.hourTo} onChange={(e) => setForm({ ...form, hourTo: e.target.value })} />
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((w, i) => (
            <button key={w} type="button" onClick={() => toggleDay(i)} className={`rounded-full px-3 py-1 text-xs font-semibold ${form.weekdays.includes(String(i)) ? "bg-ink-950 text-white" : "bg-stone-100"}`}>
              {w}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500">Vale pelo horário em que o pedido foi feito. Quando há duas campanhas ao mesmo tempo, vale a maior (não somam).</p>
        <Flash msg={msg} />
        <button className="btn-primary" disabled={busy}>
          Criar campanha
        </button>
      </form>
      <section className="space-y-2">
        {!items ? (
          <p className="card p-6 text-sm text-stone-500">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="card p-6 text-sm text-stone-500">Nenhuma campanha ainda.</p>
        ) : (
          items.map((c) => {
            const live = c.active && new Date(c.startsAt).getTime() <= now && new Date(c.endsAt).getTime() >= now;
            return (
              <div key={c.id} className={`card flex flex-wrap items-center gap-3 p-4 text-sm ${c.active ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {live && "🔥 "}
                    {c.name} · x{c.multiplier / 100}
                  </p>
                  <p className="text-xs text-stone-500">
                    {fmtDate(c.startsAt)} a {fmtDate(c.endsAt)} · {c.weekdays.split("").map((d) => WEEKDAYS[Number(d)]).join(", ")} · {c.hourFrom}h–{c.hourTo}h{c.minTier !== "BRONZE" ? ` · ${TIER_LABEL[c.minTier]}+` : ""}
                  </p>
                </div>
                <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => toggle(c)}>
                  {c.active ? "Pausar" : "Ativar"}
                </button>
                <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => remove(c)}>
                  Excluir
                </button>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

// ---------------- Níveis e regras ----------------
type TierRow = { key: string; name: string; minPoints: number; multiplier: number; color: string; icon: string; description: string; benefits: string };
type Config = { enabled: boolean; pointsPerReal: number; pointsExpiryMonths: number; welcomeBonus: number; profileBonus: number; birthdayBonus: number; referralBonusReferrer: number; referralBonusFriend: number; ratingBonus: number; redemptionValidDays: number };

function Rules() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [tiers, setTiers] = useState<TierRow[] | null>(null);
  const { busy, msg, run } = useAction();
  useEffect(() => {
    api<{ config: Config; tiers: TierRow[] }>("/api/admin/club").then((d) => {
      setCfg(d.config);
      setTiers(d.tiers);
    }, () => {});
  }, []);
  if (!cfg || !tiers) return <p className="card p-6 text-sm text-stone-500">Carregando…</p>;
  const num = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg({ ...cfg, [k]: Number(e.target.value) });
  const save = () =>
    run(async () => {
      const { enabled, pointsPerReal, pointsExpiryMonths, welcomeBonus, profileBonus, birthdayBonus, referralBonusReferrer, referralBonusFriend, ratingBonus, redemptionValidDays } = cfg;
      await api("/api/admin/club", "PATCH", {
        config: { enabled, pointsPerReal, pointsExpiryMonths, welcomeBonus, profileBonus, birthdayBonus, referralBonusReferrer, referralBonusFriend, ratingBonus, redemptionValidDays },
        tiers: tiers.map(({ key, name, minPoints, multiplier, color, icon, description, benefits }) => ({ key, name, minPoints, multiplier, color, icon, description, benefits })),
      });
      return "Regras e níveis salvos.";
    });
  const fields: [keyof Config, string][] = [
    ["pointsPerReal", "Pontos por R$ 1,00"],
    ["pointsExpiryMonths", "Pontos expiram após (meses sem pedir; 0 = nunca)"],
    ["welcomeBonus", "Bônus de boas-vindas"],
    ["profileBonus", "Bônus perfil completo"],
    ["birthdayBonus", "Bônus de aniversário"],
    ["referralBonusReferrer", "Indicação: quem indicou ganha"],
    ["referralBonusFriend", "Indicação: o amigo ganha"],
    ["ratingBonus", "Bônus por avaliar o pedido"],
    ["redemptionValidDays", "Validade do resgate (dias)"],
  ];
  return (
    <div className="space-y-5">
      <section className="card space-y-3 p-5 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Regras de pontos</h2>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
            Clube ligado
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {fields.map(([k, label]) => (
            <label key={k}>
              {label}
              <input className="input mt-1" type="number" min={0} value={cfg[k] as number} onChange={num(k)} />
            </label>
          ))}
        </div>
      </section>
      <section className="card space-y-3 p-5 text-sm">
        <h2 className="font-display text-lg font-bold">Níveis</h2>
        <p className="text-xs text-stone-500">O nível conta os pontos ganhos nos últimos 12 meses. Multiplicador: 125 = ganha 25% a mais de pontos.</p>
        <div className="grid gap-3 lg:grid-cols-2">
          {tiers.map((t, i) => (
            <div key={t.key} className="space-y-2 rounded-2xl p-3 ring-1 ring-stone-200" style={{ background: `${t.color}14` }}>
              <div className="flex gap-2">
                <input className="input w-14 text-center" value={t.icon} maxLength={8} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)))} />
                <input className="input flex-1 font-bold" value={t.name} maxLength={30} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input type="color" className="h-10 w-12 rounded" value={t.color} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  A partir de (pontos)
                  <input className="input mt-1" type="number" min={0} disabled={i === 0} value={t.minPoints} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, minPoints: Number(e.target.value) } : x)))} />
                </label>
                <label>
                  Multiplicador (%)
                  <input className="input mt-1" type="number" min={100} max={500} value={t.multiplier} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, multiplier: Number(e.target.value) } : x)))} />
                </label>
              </div>
              <input className="input" value={t.description} maxLength={200} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <textarea className="input text-xs" rows={3} value={t.benefits} maxLength={600} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, benefits: e.target.value } : x)))} aria-label="Benefícios (um por linha)" />
            </div>
          ))}
        </div>
      </section>
      <Flash msg={msg} />
      <button className="btn-primary" disabled={busy} onClick={save}>
        Salvar regras e níveis
      </button>
    </div>
  );
}

function Audit() {
  const [rows, setRows] = useState<{ id: string; action: string; detail: string; actor: string; createdAt: string }[] | null>(null);
  useEffect(() => {
    api<{ audit: NonNullable<typeof rows> }>("/api/admin/club/audit").then((r) => setRows(r.audit), () => {});
  }, []);
  const LABEL: Record<string, string> = { ADJUST: "Ajuste de pontos", USE_REDEMPTION: "Baixa de resgate", CANCEL_REDEMPTION: "Resgate cancelado", CONFIG: "Regras", TIER: "Mudança de nível", EXPORT: "Exportação" };
  if (!rows) return <p className="card p-6 text-sm text-stone-500">Carregando…</p>;
  return (
    <div className="card divide-y divide-stone-100 text-sm">
      {rows.length === 0 && <p className="p-6 text-stone-500">Nada registrado ainda.</p>}
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap gap-x-3 p-3">
          <span className="w-24 shrink-0 text-stone-500">{fmtDateTime(r.createdAt)}</span>
          <span className="font-semibold">{LABEL[r.action] ?? r.action}</span>
          <span className="flex-1 text-stone-600">{r.detail}</span>
          <span className="text-stone-500">{r.actor}</span>
        </div>
      ))}
    </div>
  );
}
