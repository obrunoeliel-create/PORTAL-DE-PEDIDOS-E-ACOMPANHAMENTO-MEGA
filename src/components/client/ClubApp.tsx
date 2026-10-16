"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatBRL } from "@/lib/money";
import { Logo } from "@/components/brand/Logo";
import type { DeliveryZoneOption } from "@/types/menu";
import { AccountSheet } from "./AccountSheet";

// ---------- tipos da API /api/club ----------
type Tier = { key: string; name: string; minPoints: number; multiplier: number; color: string; icon: string; description: string; benefits: string[] };
type Reward = { id: string; name: string; description: string; kind: string; valueLabel: string; pointsCost: number; minTier: string; emoji: string; soldOut: boolean };
type Mission = { id: string; name: string; description: string; emoji: string; kind: string; target: number; progress: number; rewardPoints: number; repeatable: boolean; completions: number; done: boolean; locked: boolean; minTier: string; endsAt: string | null };
type RedemptionItem = { code: string; rewardName: string; emoji: string; kind: string; pointsCost: number; status: string; expiresAt: string; usedAt: string | null; createdAt: string; qr: string | null };
type OrderItem = { number: number; status: string; type: string; total: number; createdAt: string; trackingToken: string; rating: number | null; canRate: boolean; points: number; summary: string };
type Me = {
  joined: true;
  name: string;
  email: string | null;
  birthDate: string | null;
  city: string | null;
  gender: string | null;
  marketingOptIn: boolean;
  memberSince: string;
  points: number;
  earned12m: number;
  tier: string;
  nextTier: { key: string; name: string; missing: number; minPoints: number } | null;
  savings: number;
  expiresAt: string | null;
  orders: number;
  spent: number;
  lastOrder: { number: number; completedAt: string; total: number } | null;
  favorites: string[];
  referral: { code: string; link: string; qr: string; count: number };
  ledger: { id: string; delta: number; kind: string; description: string; at: string }[];
  redemptions: RedemptionItem[];
  orderList: OrderItem[];
  missions: Mission[];
  ranking: { top: { position: number; name: string; tier: string; points: number }[]; position: number | null; monthPoints: number };
};
type ClubData = {
  enabled: boolean;
  rules: { pointsPerReal: number; pointsExpiryMonths: number; welcomeBonus: number; profileBonus: number; birthdayBonus: number; referralBonusReferrer: number; referralBonusFriend: number; ratingBonus: number; redemptionValidDays: number };
  tiers: Tier[];
  rewards: Reward[];
  campaigns: { name: string; multiplier: number; startsAt: string; endsAt: string; minTier: string }[];
  me: null | Me | { joined: false; name: string; email: string | null; birthDate: string | null; city: string | null };
};

const TIER_ORDER = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];
const rank = (k: string) => Math.max(0, TIER_ORDER.indexOf(k));
const fmtDate = (d: string | null) => (d ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)) : "—");
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? "";
const pts = (n: number) => n.toLocaleString("pt-BR");

const TABS = [
  { id: "cartao", label: "Início", icon: "🏠" },
  { id: "pedidos", label: "Pedidos", icon: "🧾" },
  { id: "recompensas", label: "Recompensas", icon: "🎁" },
  { id: "missoes", label: "Missões", icon: "🎯" },
  { id: "indicar", label: "Indicar", icon: "👯" },
  { id: "extrato", label: "Extrato", icon: "📜" },
  { id: "ranking", label: "Ranking", icon: "🏆" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function ClubApp({ zones, refCode }: { zones: DeliveryZoneOption[]; refCode: string | null }) {
  const [data, setData] = useState<ClubData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<"login" | "register" | null>(null);
  const [tab, setTab] = useState<TabId>("cartao");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/club", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(null);
    } catch {
      setError("Não foi possível carregar o clube. Verifique a internet e tente de novo.");
    }
  }, []);

  useEffect(() => {
    // Link de indicação: guarda o código para usar no cadastro.
    if (refCode) {
      try {
        localStorage.setItem("mj_ref", refCode);
      } catch {
        /* armazenamento indisponível */
      }
    }
    void load();
  }, [load, refCode]);

  if (error) return <Centered>{error}</Centered>;
  if (!data) {
    return (
      <Centered>
        <Logo size={80} className="animate-wiggle shadow-lift" />
        <p className="mt-4 text-stone-500">Carregando o clube…</p>
      </Centered>
    );
  }

  const me = data.me && data.me.joined ? (data.me as Me) : null;
  return (
    <div className="min-h-screen bg-[#0d0d12] pb-16 text-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 pt-5">
        <Link href="/" className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
          <Logo size={36} className="ring-2 ring-white/20" />
          <span className="font-semibold">Cardápio</span>
        </Link>
        {me && (
          <button
            onClick={async () => {
              await fetch("/api/customers/logout", { method: "POST" });
              window.location.reload();
            }}
            className="text-xs text-white/50 underline"
          >
            Sair
          </button>
        )}
      </header>

      {!data.enabled && <p className="mx-auto mt-6 max-w-3xl px-4 text-center text-sm text-amber-300">O clube está pausado no momento. Seus pontos continuam guardados.</p>}

      {me ? (
        <Member data={data} me={me} tab={tab} setTab={setTab} reload={load} />
      ) : data.me && !data.me.joined ? (
        <Join data={data} me={data.me} onJoined={load} refCode={refCode} />
      ) : (
        <Landing data={data} onAccount={setAccount} />
      )}

      {account && (
        <AccountSheet
          initialTab={account}
          zones={zones}
          onClose={() => setAccount(null)}
          onDone={() => {
            setAccount(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ---------- Visitante ----------
function Landing({ data, onAccount }: { data: ClubData; onAccount: (t: "login" | "register") => void }) {
  const r = data.rules;
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 pt-10">
      <section className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-mega-400">Clube Mega Jurema</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight sm:text-5xl">
          Quanto mais você volta,
          <br />
          <span className="bg-gradient-to-r from-mega-300 via-amber-300 to-brand-400 bg-clip-text text-transparent">mais vantagens conquista.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-white/70">
          Cada R$ 1,00 vale {r.pointsPerReal} {r.pointsPerReal === 1 ? "ponto" : "pontos"}. Troque por esfihas, pizzas, refrigerantes e vales-compras. É grátis.
        </p>
        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
          <button onClick={() => onAccount("register")} className="rounded-2xl bg-gradient-to-r from-mega-400 to-amber-400 px-6 py-4 font-display text-lg font-extrabold text-ink-950 shadow-lg shadow-amber-500/20 transition hover:scale-[1.02]">
            Entrar no clube e ganhar {r.welcomeBonus} pontos
          </button>
          <button onClick={() => onAccount("login")} className="rounded-2xl px-6 py-3 text-sm font-semibold text-white/80 ring-1 ring-white/20 hover:bg-white/5">
            Já tenho cadastro
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["🛒", "Peça", `Cada pedido no site ou na loja (com seu WhatsApp) vira pontos.`],
          ["🎯", "Cumpra missões", "Ganhe pontos extras com desafios: terça da esfiha, pedidão, novos sabores…"],
          ["🎁", "Resgate", "Troque pontos por recompensas e use com um código ou QR Code."],
        ].map(([icon, title, text]) => (
          <div key={title} className="rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/10">
            <p className="text-3xl">{icon}</p>
            <p className="mt-2 font-display text-lg font-bold">{title}</p>
            <p className="text-sm text-white/60">{text}</p>
          </div>
        ))}
      </section>

      <TierList tiers={data.tiers} current={null} />

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">Recompensas</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.rewards.map((rw) => (
            <div key={rw.id} className="flex items-center gap-4 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
              <span className="text-4xl">{rw.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{rw.name}</p>
                <p className="text-xs text-white/50">{rw.minTier !== "BRONZE" ? `Exclusivo a partir de ${data.tiers.find((t) => t.key === rw.minTier)?.name}` : rw.description}</p>
              </div>
              <span className="whitespace-nowrap font-display font-extrabold text-mega-300">{pts(rw.pointsCost)} pts</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-gradient-to-br from-brand-700/40 to-brand-900/40 p-6 ring-1 ring-brand-400/30">
        <h2 className="font-display text-xl font-bold">Bônus que você ganha</h2>
        <ul className="mt-3 grid gap-2 text-sm text-white/80 sm:grid-cols-2">
          <li>⭐ {r.welcomeBonus} pontos de boas-vindas</li>
          <li>🎂 {r.birthdayBonus} pontos no seu aniversário</li>
          <li>👯 {r.referralBonusReferrer} pontos por amigo indicado (ele ganha {r.referralBonusFriend})</li>
          <li>✍️ {r.profileBonus} pontos ao completar o perfil</li>
          <li>⭐ {r.ratingBonus} pontos por avaliar o pedido</li>
          <li>🚀 Níveis com até {Math.max(...data.tiers.map((t) => t.multiplier)) / 100}x pontos</li>
        </ul>
      </section>
      <p className="text-center text-xs text-white/40">
        <Link href="/clube/regulamento" className="underline">
          Regulamento e privacidade
        </Link>
      </p>
    </main>
  );
}

function TierList({ tiers, current }: { tiers: Tier[]; current: string | null }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-bold">Níveis</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {tiers.map((t) => (
          <div key={t.key} className={`rounded-3xl p-5 ring-1 ${current === t.key ? "ring-2" : "ring-white/10"}`} style={{ background: `linear-gradient(135deg, ${t.color}26, transparent)`, ...(current === t.key && { boxShadow: `0 0 0 2px ${t.color}` }) }}>
            <div className="flex items-center justify-between">
              <p className="font-display text-xl font-extrabold" style={{ color: t.color }}>
                {t.icon} {t.name}
              </p>
              <span className="text-xs text-white/60">{t.minPoints ? `${pts(t.minPoints)} pts / 12 meses` : "ao entrar"}</span>
            </div>
            <p className="mt-1 text-sm text-white/70">{t.description}</p>
            <ul className="mt-2 space-y-0.5 text-xs text-white/60">
              {t.benefits.map((b) => (
                <li key={b}>✓ {b}</li>
              ))}
            </ul>
            {current === t.key && <p className="mt-2 text-xs font-bold" style={{ color: t.color }}>Seu nível atual</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Cliente com conta, ainda fora do clube ----------
function Join({ data, me, onJoined, refCode }: { data: ClubData; me: { name: string; email: string | null; birthDate: string | null; city: string | null }; onJoined: () => void; refCode: string | null }) {
  const [form, setForm] = useState({ birthDate: me.birthDate?.slice(0, 10) ?? "", city: me.city ?? "Guarulhos", email: me.email ?? "", marketingOptIn: false, acceptTerms: false });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.acceptTerms) return setMsg("Aceite o regulamento e a política de privacidade.");
    setBusy(true);
    setMsg(null);
    let ref: string | undefined = refCode ?? undefined;
    try {
      ref ??= localStorage.getItem("mj_ref") ?? undefined;
    } catch {
      /* armazenamento indisponível */
    }
    const res = await fetch("/api/club", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acceptTerms: true,
        marketingOptIn: form.marketingOptIn,
        ...(form.birthDate && { birthDate: form.birthDate }),
        ...(form.city.trim() && { city: form.city.trim() }),
        ...(form.email.trim() && { email: form.email.trim() }),
        ...(ref && { referralCode: ref }),
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(d.error ?? "Não foi possível entrar no clube.");
    onJoined();
  };
  return (
    <main className="mx-auto max-w-md px-4 pt-10">
      <h1 className="font-display text-3xl font-extrabold">Olá, {firstName(me.name)}! 👋</h1>
      <p className="mt-2 text-white/70">Falta só um passo para entrar no Clube Mega Jurema e ganhar {data.rules.welcomeBonus} pontos de boas-vindas.</p>
      <form onSubmit={submit} className="mt-6 space-y-3 rounded-3xl bg-white p-5 text-ink-950">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-stone-600">
            Aniversário
            <input type="date" className="input mt-1" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-stone-600">
            Cidade
            <input className="input mt-1" value={form.city} maxLength={60} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-stone-600">
          E-mail (opcional)
          <input type="email" className="input mt-1" value={form.email} maxLength={254} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-600" checked={form.marketingOptIn} onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })} />
          Aceito receber cupons e promoções no WhatsApp (opcional; responda SAIR para parar).
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-600" checked={form.acceptTerms} onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })} />
          <span>
            Li e aceito o{" "}
            <a href="/clube/regulamento" target="_blank" className="font-semibold text-brand-700 underline">
              regulamento do Clube e a política de privacidade
            </a>
            .
          </span>
        </label>
        {msg && <p className="rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-800">{msg}</p>}
        <button className="btn-primary w-full py-3.5 text-base" disabled={busy}>
          {busy ? "Aguarde…" : "⭐ Entrar no clube"}
        </button>
      </form>
    </main>
  );
}

// ---------- Sócio ----------
function Member({ data, me, tab, setTab, reload }: { data: ClubData; me: Me; tab: TabId; setTab: (t: TabId) => void; reload: () => Promise<void> }) {
  const tier = data.tiers.find((t) => t.key === me.tier) ?? data.tiers[0];
  const prevMin = tier.minPoints;
  const pct = me.nextTier ? Math.min(100, Math.round(((me.earned12m - prevMin) / (me.nextTier.minPoints - prevMin)) * 100)) : 100;
  const activeReds = me.redemptions.filter((r) => r.status === "ISSUED");

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 pt-6">
      {/* Cartão do sócio */}
      <section
        className="relative overflow-hidden rounded-[2rem] p-6 shadow-2xl"
        style={{ background: `radial-gradient(120% 120% at 0% 0%, ${tier.color}55 0%, #16161f 55%, #0d0d12 100%)`, boxShadow: `0 20px 60px -20px ${tier.color}66` }}
      >
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full blur-3xl" style={{ background: `${tier.color}33` }} aria-hidden />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50">Clube Mega Jurema</p>
            <p className="mt-1 font-display text-2xl font-extrabold">{me.name}</p>
            <p className="text-xs text-white/50">Sócio desde {fmtDate(me.memberSince)}</p>
          </div>
          <span className="rounded-full px-3 py-1 text-sm font-extrabold" style={{ background: `${tier.color}33`, color: tier.color }}>
            {tier.icon} {tier.name}
          </span>
        </div>
        <div className="relative mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/50">Seus pontos</p>
            <p className="font-display text-5xl font-extrabold tabular-nums">{pts(me.points)}</p>
          </div>
          <div className="text-right text-xs text-white/60">
            <p>Economia acumulada</p>
            <p className="font-display text-xl font-bold text-emerald-300">{formatBRL(me.savings)}</p>
          </div>
        </div>
        <div className="relative mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: tier.color }} />
          </div>
          <p className="mt-1.5 text-xs text-white/60">
            {me.nextTier ? (
              <>
                Faltam <b className="text-white">{pts(me.nextTier.missing)} pontos</b> (em 12 meses) para {me.nextTier.name}
              </>
            ) : (
              "Você está no nível máximo. 💎"
            )}
          </p>
        </div>
        {me.expiresAt && <p className="relative mt-2 text-[11px] text-white/40">Seus pontos valem até {fmtDate(me.expiresAt)} — cada pedido renova o prazo.</p>}
      </section>

      {data.campaigns.filter((c) => new Date(c.startsAt) <= new Date() && rank(me.tier) >= rank(c.minTier)).map((c) => (
        <p key={c.name} className="rounded-2xl bg-gradient-to-r from-amber-500/20 to-brand-500/20 p-3 text-center text-sm font-semibold ring-1 ring-amber-400/30">
          🔥 {c.name}: pontos {c.multiplier === 200 ? "em DOBRO" : c.multiplier === 300 ? "em TRIPLO" : `x${c.multiplier / 100}`} até {fmtDate(c.endsAt)}
        </p>
      ))}

      {me.orderList
        .filter((o) => ["PENDING", "PREPARING", "OUT_FOR_DELIVERY"].includes(o.status))
        .map((o) => (
          <Link key={o.number} href={`/pedido/${o.trackingToken}`} className="flex items-center gap-3 rounded-2xl bg-brand-500/15 p-4 ring-1 ring-brand-400/30">
            <span className="text-3xl">{ORDER_STATUS[o.status]?.icon}</span>
            <span className="flex-1">
              <span className="block font-semibold">Pedido nº {o.number} · {ORDER_STATUS[o.status]?.label(o.type)}</span>
              <span className="text-xs text-white/60">Toque para acompanhar em tempo real</span>
            </span>
            <span className="text-white/60">→</span>
          </Link>
        ))}

      {activeReds.length > 0 && (
        <button onClick={() => setTab("recompensas")} className="w-full rounded-2xl bg-emerald-500/15 p-3 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
          🎟️ Você tem {activeReds.length} {activeReds.length === 1 ? "resgate" : "resgates"} para usar — toque para ver o código
        </button>
      )}

      <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Seções do clube">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-white text-ink-950" : "bg-white/5 text-white/70 ring-1 ring-white/10"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {tab === "cartao" && <CardTab data={data} me={me} reload={reload} />}
      {tab === "pedidos" && <OrdersTab me={me} />}
      {tab === "recompensas" && <RewardsTab data={data} me={me} reload={reload} />}
      {tab === "missoes" && <MissionsTab me={me} tiers={data.tiers} />}
      {tab === "indicar" && <ReferTab data={data} me={me} />}
      {tab === "extrato" && <LedgerTab me={me} />}
      {tab === "ranking" && <RankingTab me={me} tiers={data.tiers} />}
    </main>
  );
}

const ORDER_STATUS: Record<string, { icon: string; label: (type: string) => string }> = {
  PENDING: { icon: "📝", label: () => "aguardando a loja" },
  PREPARING: { icon: "👨‍🍳", label: () => "em preparo" },
  OUT_FOR_DELIVERY: { icon: "🛵", label: (t) => (t === "DELIVERY" ? "saiu para entrega" : "pronto para retirar") },
  COMPLETED: { icon: "✅", label: () => "concluído" },
  CANCELED: { icon: "✖️", label: () => "cancelado" },
};

/** "Para você": sugestões pessoais montadas com o saldo, as missões e as campanhas do momento. */
function ForYou({ data, me }: { data: ClubData; me: Me }) {
  const tips: { icon: string; text: string; href?: string }[] = [];
  const live = data.campaigns.find((c) => new Date(c.startsAt) <= new Date() && rank(me.tier) >= rank(c.minTier));
  if (live) tips.push({ icon: "🔥", text: `${live.name}: seus pontos valem x${live.multiplier / 100} agora. Bom momento para pedir!`, href: "/" });
  const affordable = data.rewards.filter((r) => !r.soldOut && rank(me.tier) >= rank(r.minTier));
  const canNow = affordable.filter((r) => r.pointsCost <= me.points).sort((a, b) => b.pointsCost - a.pointsCost)[0];
  if (canNow) tips.push({ icon: canNow.emoji, text: `Você já pode resgatar "${canNow.name}" com seus pontos.` });
  const next = affordable.filter((r) => r.pointsCost > me.points).sort((a, b) => a.pointsCost - b.pointsCost)[0];
  if (next) tips.push({ icon: "🎯", text: `Faltam ${pts(next.pointsCost - me.points)} pontos para "${next.name}" — cerca de ${formatBRL(Math.ceil((next.pointsCost - me.points) / Math.max(1, data.rules.pointsPerReal)) * 100)} em pedidos.` });
  const almost = me.missions.filter((m) => !m.done && !m.locked && m.kind !== "MIN_TICKET" && m.progress > 0).sort((a, b) => b.progress / b.target - a.progress / a.target)[0];
  if (almost) tips.push({ icon: almost.emoji, text: `Missão "${almost.name}": ${missionTarget(almost)}. Falta pouco para +${almost.rewardPoints} pontos!` });
  const toRate = me.orderList.find((o) => o.canRate);
  if (toRate && data.rules.ratingBonus > 0) tips.push({ icon: "⭐", text: `Avalie o pedido nº ${toRate.number} e ganhe ${data.rules.ratingBonus} pontos.`, href: `/pedido/${toRate.trackingToken}` });
  if (me.nextTier && me.nextTier.missing <= 200) tips.push({ icon: "🚀", text: `Só ${pts(me.nextTier.missing)} pontos para virar ${me.nextTier.name}!` });
  if (!tips.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-bold">✨ Para você</h2>
      {tips.slice(0, 4).map((t) =>
        t.href ? (
          <Link key={t.text} href={t.href} className="flex items-start gap-3 rounded-2xl bg-white/[0.05] p-3 text-sm ring-1 ring-white/10 hover:bg-white/[0.08]">
            <span className="text-xl">{t.icon}</span>
            <span className="flex-1">{t.text}</span>
            <span className="text-white/50">→</span>
          </Link>
        ) : (
          <p key={t.text} className="flex items-start gap-3 rounded-2xl bg-white/[0.05] p-3 text-sm ring-1 ring-white/10">
            <span className="text-xl">{t.icon}</span>
            <span>{t.text}</span>
          </p>
        ),
      )}
    </section>
  );
}

function OrdersTab({ me }: { me: Me }) {
  if (!me.orderList.length) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-white/60">Seus pedidos aparecem aqui.</p>
        <Link href="/" className="inline-block rounded-2xl bg-gradient-to-r from-mega-400 to-amber-400 px-6 py-3 font-bold text-ink-950">
          Fazer meu primeiro pedido
        </Link>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {me.orderList.map((o) => (
        <li key={o.number} className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">
                {ORDER_STATUS[o.status]?.icon} Pedido nº {o.number} · <span className="text-white/60">{ORDER_STATUS[o.status]?.label(o.type)}</span>
              </p>
              <p className="truncate text-xs text-white/50">{o.summary}</p>
              <p className="text-xs text-white/40">
                {fmtDate(o.createdAt)} · {formatBRL(o.total)}
                {o.points > 0 && <span className="text-mega-300"> · +{pts(o.points)} pontos</span>}
                {o.rating && <span> · {"⭐".repeat(o.rating)}</span>}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <Link href={`/pedido/${o.trackingToken}`} className="rounded-full bg-white/10 px-3 py-1.5">
              {["PENDING", "PREPARING", "OUT_FOR_DELIVERY"].includes(o.status) ? "📍 Acompanhar" : "Ver detalhes"}
            </Link>
            {o.canRate && (
              <Link href={`/pedido/${o.trackingToken}`} className="rounded-full bg-mega-400/20 px-3 py-1.5 text-mega-200">
                ⭐ Avaliar
              </Link>
            )}
            {o.status === "COMPLETED" && (
              <Link href="/" className="rounded-full bg-white/10 px-3 py-1.5">
                🔁 Pedir de novo
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
      <p className="text-[11px] uppercase tracking-wider text-white/50">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}

function CardTab({ data, me, reload }: { data: ClubData; me: Me; reload: () => Promise<void> }) {
  const missing = !me.birthDate || !me.city || !me.email;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pedidos" value={String(me.orders)} />
        <Stat label="Total" value={formatBRL(me.spent)} />
        <Stat label="Último pedido" value={me.lastOrder ? fmtDate(me.lastOrder.completedAt) : "—"} />
        <Stat label="Pontos 12 meses" value={pts(me.earned12m)} />
      </div>
      <ForYou data={data} me={me} />
      {me.favorites.length > 0 && (
        <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
          <p className="text-[11px] uppercase tracking-wider text-white/50">Seus favoritos</p>
          <p className="mt-1 font-semibold">❤️ {me.favorites.join(" · ")}</p>
          <Link href="/" className="mt-2 inline-block text-sm font-semibold text-mega-300">
            Pedir de novo →
          </Link>
        </div>
      )}
      {missing && <ProfileForm me={me} bonus={data.rules.profileBonus} reload={reload} />}
      <TierList tiers={data.tiers} current={me.tier} />
      <p className="text-center text-xs text-white/40">
        <Link href="/clube/regulamento" className="underline">
          Regulamento e privacidade
        </Link>
      </p>
    </div>
  );
}

function ProfileForm({ me, bonus, reload }: { me: Me; bonus: number; reload: () => Promise<void> }) {
  const [form, setForm] = useState({ birthDate: me.birthDate?.slice(0, 10) ?? "", city: me.city ?? "", email: me.email ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/club", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(form.birthDate && !me.birthDate && { birthDate: form.birthDate }), ...(form.city.trim() && { city: form.city.trim() }), ...(form.email.trim() && { email: form.email.trim() }) }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(d.error ?? "Confira os dados.");
    await reload();
  };
  return (
    <form onSubmit={save} className="space-y-3 rounded-3xl bg-gradient-to-br from-mega-400/15 to-transparent p-5 ring-1 ring-mega-400/30">
      <p className="font-display text-lg font-bold">✍️ Complete seu perfil e ganhe {bonus} pontos</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {!me.birthDate && <input type="date" className="input text-ink-950" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} aria-label="Aniversário" />}
        {!me.city && <input className="input text-ink-950" placeholder="Cidade" value={form.city} maxLength={60} onChange={(e) => setForm({ ...form, city: e.target.value })} />}
        {!me.email && <input type="email" className="input text-ink-950" placeholder="E-mail" value={form.email} maxLength={254} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
      </div>
      {msg && <p className="text-sm text-brand-300">{msg}</p>}
      <button className="rounded-xl bg-mega-400 px-5 py-2.5 font-bold text-ink-950">Salvar</button>
    </form>
  );
}

function RewardsTab({ data, me, reload }: { data: ClubData; me: Me; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<RedemptionItem | null>(null);
  const redeem = async (rw: Reward) => {
    if (!confirm(`Trocar ${pts(rw.pointsCost)} pontos por "${rw.name}"?`)) return;
    setBusy(rw.id);
    setMsg(null);
    const res = await fetch("/api/club/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rewardId: rw.id }) });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: d.error ?? "Não foi possível resgatar." });
    setMsg({ ok: true, text: `Resgate feito! Código ${d.code}.` });
    await reload();
  };
  const cancel = async (r: RedemptionItem) => {
    if (!confirm("Cancelar este resgate? Os pontos voltam para o seu saldo.")) return;
    const res = await fetch("/api/club/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cancel: r.code }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ ok: false, text: d.error ?? "Não foi possível cancelar." });
    setOpen(null);
    await reload();
  };
  const active = me.redemptions.filter((r) => r.status === "ISSUED");
  const STATUS: Record<string, string> = { USED: "Usado", EXPIRED: "Vencido", CANCELED: "Cancelado", ISSUED: "Para usar" };

  return (
    <div className="space-y-5">
      {msg && <p className={`rounded-2xl p-3 text-sm font-semibold ${msg.ok ? "bg-emerald-500/15 text-emerald-200" : "bg-brand-500/15 text-brand-200"}`}>{msg.text}</p>}
      {active.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-lg font-bold">Para usar</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((r) => (
              <button key={r.code} onClick={() => setOpen(r)} className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-4 text-left ring-1 ring-emerald-400/30">
                <span className="text-3xl">{r.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{r.rewardName}</span>
                  <span className="font-mono text-sm text-emerald-200">{r.code}</span>
                  <span className="block text-xs text-white/50">até {fmtDate(r.expiresAt)}</span>
                </span>
                <span className="text-xs font-semibold text-emerald-200">Ver QR</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-2 font-display text-lg font-bold">Catálogo</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.rewards.map((rw) => {
            const locked = rank(me.tier) < rank(rw.minTier);
            const enough = me.points >= rw.pointsCost;
            return (
              <div key={rw.id} className={`flex flex-col rounded-2xl p-4 ring-1 ring-white/10 ${locked ? "bg-white/[0.02] opacity-60" : "bg-white/[0.05]"}`}>
                <div className="flex items-start gap-3">
                  <span className="text-4xl">{rw.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{rw.name}</p>
                    <p className="text-xs text-white/50">{rw.description}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="font-display text-lg font-extrabold text-mega-300">{pts(rw.pointsCost)} pts</span>
                  {locked ? (
                    <span className="text-xs text-white/50">🔒 {data.tiers.find((t) => t.key === rw.minTier)?.name}</span>
                  ) : rw.soldOut ? (
                    <span className="text-xs text-white/50">Esgotado</span>
                  ) : (
                    <button
                      disabled={!enough || busy === rw.id || !data.enabled}
                      onClick={() => redeem(rw)}
                      className={`rounded-xl px-4 py-2 text-sm font-extrabold transition ${enough ? "bg-gradient-to-r from-mega-400 to-amber-400 text-ink-950 hover:scale-105" : "bg-white/10 text-white/40"}`}
                    >
                      {busy === rw.id ? "…" : enough ? "RESGATAR" : `faltam ${pts(rw.pointsCost - me.points)}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {me.redemptions.some((r) => r.status !== "ISSUED") && (
        <section>
          <h2 className="mb-2 font-display text-lg font-bold">Histórico de resgates</h2>
          <ul className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] text-sm ring-1 ring-white/10">
            {me.redemptions
              .filter((r) => r.status !== "ISSUED")
              .map((r) => (
                <li key={r.code} className="flex justify-between gap-3 p-3">
                  <span>
                    {r.emoji} {r.rewardName} <span className="font-mono text-xs text-white/40">{r.code}</span>
                  </span>
                  <span className="text-white/50">
                    {STATUS[r.status]} {r.usedAt ? fmtDate(r.usedAt) : ""}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {open && (
        <div className="overlay z-[60]" role="dialog" aria-modal onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="sheet w-full max-w-sm space-y-3 p-6 text-center text-ink-950">
            <p className="text-4xl">{open.emoji}</p>
            <p className="font-display text-xl font-extrabold">{open.rewardName}</p>
            {open.qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.qr} alt={`QR Code do resgate ${open.code}`} className="mx-auto w-56 rounded-xl ring-1 ring-stone-200" />
            )}
            <p className="font-mono text-2xl font-extrabold tracking-wider">{open.code}</p>
            <p className="text-sm text-stone-600">Válido até {fmtDate(open.expiresAt)}. Use uma única vez.</p>
            <p className="rounded-xl bg-stone-100 p-3 text-xs text-stone-600">
              {open.kind === "PRODUCT"
                ? "Na loja: mostre este QR Code no caixa. No delivery: escreva o código nas observações do pedido e a loja confere."
                : "No site: digite o código no campo “Cupom de desconto” do carrinho. Na loja: mostre este QR Code no caixa."}
            </p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => cancel(open)}>
                Cancelar resgate
              </button>
              <button className="btn-primary flex-1" onClick={() => setOpen(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function missionTarget(m: Mission) {
  if (m.kind === "SPEND") return `${formatBRL(m.progress)} de ${formatBRL(m.target)}`;
  if (m.kind === "MIN_TICKET") return m.progress >= m.target ? "feito" : "pendente";
  return `${m.progress} de ${m.target}`;
}

function MissionsTab({ me, tiers }: { me: Me; tiers: Tier[] }) {
  if (!me.missions.length) return <p className="text-center text-white/60">Nenhuma missão ativa agora. Volte em breve!</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {me.missions.map((m) => {
        const pct = m.kind === "MIN_TICKET" ? (m.progress >= m.target ? 100 : 0) : Math.round((m.progress / m.target) * 100);
        return (
          <div key={m.id} className={`rounded-2xl p-4 ring-1 ${m.done ? "bg-emerald-500/10 ring-emerald-400/30" : m.locked ? "bg-white/[0.02] opacity-60 ring-white/10" : "bg-white/[0.05] ring-white/10"}`}>
            <div className="flex items-start gap-3">
              <span className="text-3xl">{m.done ? "✅" : m.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.name}</p>
                <p className="text-xs text-white/60">{m.description}</p>
              </div>
              <span className="whitespace-nowrap rounded-full bg-mega-400/20 px-2 py-0.5 text-xs font-bold text-mega-200">+{pts(m.rewardPoints)}</span>
            </div>
            {m.locked ? (
              <p className="mt-3 text-xs text-white/50">🔒 Libera no nível {tiers.find((t) => t.key === m.minTier)?.name}</p>
            ) : (
              <>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-mega-400 to-amber-300" style={{ width: `${m.done ? 100 : pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-white/50">
                  {m.done ? "Concluída!" : missionTarget(m)}
                  {m.repeatable && m.completions > 0 && ` · cumprida ${m.completions}x`}
                  {m.repeatable && " · repetível"}
                  {m.endsAt && ` · até ${fmtDate(m.endsAt)}`}
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReferTab({ data, me }: { data: ClubData; me: Me }) {
  const [copied, setCopied] = useState(false);
  const text = `Entra no Clube Mega Jurema com o meu código ${me.referral.code} e ganhe ${data.rules.referralBonusFriend} pontos no primeiro pedido! 🍕 ${me.referral.link}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(me.referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sem permissão */
    }
  };
  return (
    <div className="space-y-4 text-center">
      <p className="text-white/70">
        Indique amigos: quando seu amigo fizer o <b>primeiro pedido</b>, você ganha <b className="text-mega-300">{data.rules.referralBonusReferrer} pontos</b> e ele ganha{" "}
        <b className="text-mega-300">{data.rules.referralBonusFriend}</b>.
      </p>
      <div className="mx-auto max-w-xs rounded-3xl bg-white p-5 text-ink-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={me.referral.qr} alt="QR Code da sua indicação" className="mx-auto w-48" />
        <p className="mt-2 text-xs uppercase tracking-widest text-stone-500">Seu código</p>
        <p className="font-mono text-2xl font-extrabold">{me.referral.code}</p>
      </div>
      <div className="mx-auto flex max-w-sm flex-col gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="btn-whatsapp w-full">
          💬 Enviar pelo WhatsApp
        </a>
        <button onClick={copy} className="rounded-2xl py-3 text-sm font-semibold ring-1 ring-white/20">
          {copied ? "✅ Link copiado" : "🔗 Copiar link"}
        </button>
      </div>
      <p className="text-sm text-white/60">
        {me.referral.count} {me.referral.count === 1 ? "amigo entrou" : "amigos entraram"} com o seu código.
      </p>
    </div>
  );
}

function LedgerTab({ me }: { me: Me }) {
  if (!me.ledger.length) return <p className="text-center text-white/60">Seu extrato aparece aqui depois do primeiro pedido.</p>;
  return (
    <ul className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
      {me.ledger.map((l) => (
        <li key={l.id} className="flex items-center justify-between gap-3 p-3 text-sm">
          <span>
            <span className="block">{l.description}</span>
            <span className="text-xs text-white/40">{fmtDate(l.at)}</span>
          </span>
          <span className={`whitespace-nowrap font-display font-bold tabular-nums ${l.delta > 0 ? "text-emerald-300" : "text-brand-300"}`}>
            {l.delta > 0 ? "+" : ""}
            {pts(l.delta)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RankingTab({ me, tiers }: { me: Me; tiers: Tier[] }) {
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-white/60">
        Ranking do mês (pontos ganhos com pedidos, missões, indicações e avaliações).
        {me.ranking.position ? ` Você está em ${me.ranking.position}º com ${pts(me.ranking.monthPoints)} pontos.` : " Faça um pedido para entrar no ranking!"}
      </p>
      {me.ranking.top.length === 0 ? (
        <p className="text-center text-white/50">Ninguém pontuou neste mês ainda — seja o primeiro!</p>
      ) : (
        <ol className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
          {me.ranking.top.map((r) => (
            <li key={r.position} className="flex items-center gap-3 p-3">
              <span className="w-8 text-center font-display text-lg font-bold">{medal[r.position - 1] ?? `${r.position}º`}</span>
              <span className="flex-1">
                {r.name} <span className="text-xs">{tiers.find((t) => t.key === r.tier)?.icon}</span>
              </span>
              <span className="font-display font-bold tabular-nums text-mega-300">{pts(r.points)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-[#0d0d12] p-6 text-center text-white">{<div className="flex flex-col items-center">{children}</div>}</div>;
}
