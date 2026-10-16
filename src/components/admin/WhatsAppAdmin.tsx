"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBRL, parseBRL } from "@/lib/money";
import { renderTemplate, withAutoNotice, type TemplateVars } from "@/lib/wa/templates";
import { useStaffSocket } from "./useStaffSocket";

// ---------- tipos das respostas da API ----------
type Robot = { status: "OFF" | "CONNECTING" | "QR" | "CONNECTED" | "WAITING_LEASE"; qr: string | null; me: { phone: string; name: string | null } | null; lastError: string | null };
type Config = {
  enabled: boolean;
  ratingEnabled: boolean;
  ratingDelayHours: number;
  couponEnabled: boolean;
  couponDelayDays: number;
  couponPercent: number;
  couponValidityDays: number;
  couponPrefix: string;
  couponMinOrder: number;
  deliveryEta: string;
  minIntervalSeconds: number;
  maxPerHour: number;
  connectedPhone: string | null;
  connectedName: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
};
type Overview = {
  robot: Robot;
  config: Config;
  metaFallback: boolean;
  marketingHours: boolean;
  stats: { sent: number; delivered: number; read: number; failed: number; canceled: number; queued: number; activeOrders: number; avgMinutes: number | null; ratingAvg: number | null; ratingCount: number };
  events: { id: string; kind: string; detail: string | null; at: string }[];
};
type Template = { key: string; name: string; when: string; defaultBody: string; body: string; active: boolean; updatedBy: string | null; updatedAt: string | null };
type Msg = {
  id: string;
  kind: string;
  templateKey: string | null;
  phone: string;
  name: string | null;
  orderNumber: number | null;
  body: string | null;
  status: string;
  error: string | null;
  provider: string | null;
  createdBy: string | null;
  createdAt: string;
  notBefore: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
};
type Campaign = {
  id: string;
  name: string;
  body: string;
  audience: string;
  inactiveDays: number | null;
  couponCode: string | null;
  status: string;
  total: number;
  createdBy: string | null;
  createdAt: string;
  startedAt: string | null;
  result: { queued: number; sent: number; delivered: number; read: number; failed: number; skipped: number };
};
type Coupon = { code: string; kind: string; value: number; minOrder: number; validUntil: string; maxUses: number; usedCount: number; phone: string | null; active: boolean; source: string; createdAt: string; discountGiven: number; salesTotal: number };
type Customer = { phone: string; name: string | null; marketingOptIn: boolean; optOut: boolean; lastContactAt: string | null; messages: number; orders: number; total: number; avgTicket: number; lastOrderAt: string | null; vip: boolean; inactive: boolean };

async function api<T = Record<string, unknown>>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("Sessão expirada.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Falha na operação.");
  return data as T;
}

const tz = "America/Sao_Paulo";
const fmtDateTime = (d: string | null) => (d ? new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "—");
const fmtDate = (d: string | null) => (d ? new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(d)) : "—");
const fmtPhone = (p: string) => (p.length === 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : p.length === 10 ? `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}` : p);

const SAMPLE: TemplateVars = {
  nome: "Maria",
  pedido: "123",
  valor: "R$ 58,90",
  link: "https://megaesfihajurema.com/pedido/…",
  tempo: "40 a 60 minutos",
  cupom: "VOLTE10-K7Q2",
  desconto: "10%",
  validade: "31/10",
  site: "https://megaesfihajurema.com",
  estrelas: "⭐⭐⭐⭐⭐",
};

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  QUEUED: { text: "Na fila", cls: "bg-stone-100 text-stone-700" },
  SENDING: { text: "Enviando", cls: "bg-amber-100 text-amber-800" },
  SENT: { text: "Enviada ✓", cls: "bg-sky-100 text-sky-800" },
  DELIVERED: { text: "Entregue ✓✓", cls: "bg-emerald-100 text-emerald-800" },
  READ: { text: "Lida ✓✓", cls: "bg-emerald-600 text-white" },
  FAILED: { text: "Falhou", cls: "bg-brand-100 text-brand-800" },
  CANCELED: { text: "Não enviada", cls: "bg-stone-200 text-stone-600" },
};
const KIND_LABEL: Record<string, string> = { STATUS: "Pedido", RATING: "Avaliação", COUPON: "Cupom", CAMPAIGN: "Campanha", MANUAL: "Manual", REPLY: "Resposta" };
const AUDIENCE_LABEL: Record<string, string> = { OPTIN_ALL: "Todos que aceitaram promoções", INACTIVE: "Clientes sumidos", VIP: "Clientes VIP" };
const EVENT_LABEL: Record<string, string> = {
  CONNECTED: "🟢 Conectado",
  DISCONNECTED: "🔴 Desconectado",
  QR: "📷 QR Code",
  LOGOUT: "🚪 Saiu",
  LOGGED_OUT: "🚪 Sessão encerrada no celular",
  SESSION_EXPIRED: "⌛ Conexão expirou",
  ERROR: "⚠️ Erro",
  OPT_OUT: "🙅 Pediu para sair",
  OPT_IN: "🙋 Voltou a receber",
  RATING: "⭐ Avaliação",
  CAMPAIGN: "📣 Campanha",
  CONFIG: "⚙️ Configuração",
};

const TABS = [
  { id: "conexao", label: "Conexão", icon: "📱" },
  { id: "painel", label: "Indicadores", icon: "📊" },
  { id: "mensagens", label: "Mensagens", icon: "✏️" },
  { id: "envios", label: "Envios", icon: "📨" },
  { id: "enviar", label: "Enviar", icon: "💬" },
  { id: "campanhas", label: "Campanhas", icon: "📣" },
  { id: "cupons", label: "Cupons e automações", icon: "🎟️" },
  { id: "clientes", label: "Clientes", icon: "👥" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Flash({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`rounded-2xl p-3 text-sm font-medium ring-1 ${msg.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-brand-50 text-brand-800 ring-brand-200"}`} role="status">
      {msg.text}
    </p>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useCallback(async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, msg, run, setMsg };
}

export function WhatsAppAdmin() {
  const [tab, setTab] = useState<TabId>("conexao");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tick, setTick] = useState(0); // força recarregar listas quando chega evento

  const load = useCallback(async () => {
    try {
      setOverview(await api<Overview>("/api/admin/wa"));
    } catch {}
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Atualização em tempo real (socket) + consulta periódica de reserva.
  const lastMsgEvent = useRef(0);
  useStaffSocket({
    onWaStatus: (robot) => setOverview((o) => (o ? { ...o, robot: robot as Robot } : o)),
    onWaMessage: () => {
      if (Date.now() - lastMsgEvent.current < 1500) return;
      lastMsgEvent.current = Date.now();
      setTick((t) => t + 1);
      void load();
    },
    onConnect: () => void load(),
  });
  const waiting = overview?.robot.status === "QR" || overview?.robot.status === "CONNECTING";
  useEffect(() => {
    const id = setInterval(() => void load(), waiting ? 3000 : 30_000);
    return () => clearInterval(id);
  }, [load, waiting]);

  const robot = overview?.robot;
  const connected = robot?.status === "CONNECTED";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">WhatsApp da loja</h1>
          <p className="text-sm text-stone-500">Robô que avisa os clientes sozinho: pedido recebido, em preparo, saiu para entrega, avaliação, cupom e campanhas.</p>
        </div>
        {overview && (
          <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${connected ? "bg-emerald-100 text-emerald-800" : "bg-brand-100 text-brand-800"}`}>
            {connected ? `🟢 Conectado${robot?.me ? ` · ${fmtPhone(robot.me.phone)}` : ""}` : "🔴 Desconectado"}
            {overview && !overview.config.enabled && " · envios pausados"}
          </span>
        )}
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Seções do WhatsApp">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-ink-950 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {!overview ? (
        <p className="card p-6 text-sm text-stone-500">Carregando…</p>
      ) : tab === "conexao" ? (
        <ConnectionTab overview={overview} onChange={load} />
      ) : tab === "painel" ? (
        <StatsTab overview={overview} />
      ) : tab === "mensagens" ? (
        <TemplatesTab />
      ) : tab === "envios" ? (
        <LogsTab tick={tick} />
      ) : tab === "enviar" ? (
        <SendTab connected={connected} />
      ) : tab === "campanhas" ? (
        <CampaignsTab tick={tick} marketingHours={overview.marketingHours} />
      ) : tab === "cupons" ? (
        <CouponsTab config={overview.config} onConfig={(config) => setOverview((o) => (o ? { ...o, config } : o))} />
      ) : (
        <CrmTab />
      )}
    </div>
  );
}

// ---------- Conexão ----------
function ConnectionTab({ overview, onChange }: { overview: Overview; onChange: () => Promise<void> }) {
  const { robot, config } = overview;
  const { busy, msg, run } = useAction();
  const act = (action: "connect" | "reconnect" | "logout") =>
    run(async () => {
      if (action === "logout" && !confirm("Desconectar o WhatsApp da loja do portal? Os avisos automáticos param até conectar de novo.")) return;
      await api("/api/admin/wa", "POST", { action });
      await onChange();
    });
  const toggle = () =>
    run(async () => {
      await api("/api/admin/wa", "PATCH", { enabled: !config.enabled });
      await onChange();
      return config.enabled ? "Envios automáticos pausados." : "Envios automáticos ligados.";
    });

  const statusText: Record<Robot["status"], string> = {
    OFF: "Desconectado",
    CONNECTING: "Conectando…",
    QR: "Aguardando leitura do QR Code",
    CONNECTED: "Conectado",
    WAITING_LEASE: "Aguardando (o servidor está reiniciando)",
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <section className="card space-y-4 p-5">
        <h2 className="font-display text-lg font-bold">Conexão</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-stone-500">Situação</dt>
          <dd className="font-semibold">{statusText[robot.status]}</dd>
          <dt className="text-stone-500">Número</dt>
          <dd className="font-semibold">{robot.me ? `${fmtPhone(robot.me.phone)}${robot.me.name ? ` · ${robot.me.name}` : ""}` : config.connectedPhone ? fmtPhone(config.connectedPhone) : "—"}</dd>
          <dt className="text-stone-500">Conectado desde</dt>
          <dd>{fmtDateTime(config.connectedAt)}</dd>
          <dt className="text-stone-500">Última sincronização</dt>
          <dd>{fmtDateTime(config.lastSyncAt)}</dd>
          <dt className="text-stone-500">Envios automáticos</dt>
          <dd className={config.enabled ? "font-semibold text-emerald-700" : "font-semibold text-brand-700"}>{config.enabled ? "Ligados" : "Pausados"}</dd>
          <dt className="text-stone-500">Reserva (API oficial)</dt>
          <dd>{overview.metaFallback ? "Configurada" : "Não configurada"}</dd>
        </dl>
        {robot.lastError && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{robot.lastError}</p>}
        <Flash msg={msg} />
        <div className="flex flex-wrap gap-2">
          {robot.status !== "CONNECTED" && (
            <button className="btn-primary" disabled={busy || robot.status === "QR"} onClick={() => act("connect")}>
              📷 Conectar (QR Code)
            </button>
          )}
          <button className="btn-ghost" disabled={busy} onClick={() => act("reconnect")}>
            🔄 Reconectar
          </button>
          {(robot.status === "CONNECTED" || config.connectedPhone) && (
            <button className="btn-ghost" disabled={busy} onClick={() => act("logout")}>
              🔁 Desconectar / trocar número
            </button>
          )}
          <button className="btn-ghost" disabled={busy} onClick={toggle}>
            {config.enabled ? "⏸️ Pausar envios" : "▶️ Ligar envios"}
          </button>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        {robot.status === "QR" && robot.qr ? (
          <>
            <h2 className="font-display text-lg font-bold">Escaneie com o celular da loja</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={robot.qr} alt="QR Code para conectar o WhatsApp" className="mx-auto w-full max-w-[300px] rounded-xl bg-white p-2 ring-1 ring-stone-200" />
            <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
              <li>Abra o WhatsApp (ou WhatsApp Business) no celular da loja.</li>
              <li>
                Toque em <b>⋮ Mais opções</b> (ou <b>Configurações</b> no iPhone) → <b>Aparelhos conectados</b>.
              </li>
              <li>
                Toque em <b>Conectar um aparelho</b> e aponte a câmera para este QR Code.
              </li>
            </ol>
            <p className="text-xs text-stone-500">O QR Code muda sozinho a cada ~20 segundos e vale por cerca de 2 minutos.</p>
          </>
        ) : robot.status === "CONNECTED" ? (
          <>
            <h2 className="font-display text-lg font-bold">Tudo certo ✅</h2>
            <p className="text-sm text-stone-700">
              O robô está usando o WhatsApp <b>{robot.me ? fmtPhone(robot.me.phone) : ""}</b>. O celular pode ficar com a loja normalmente; as mensagens enviadas pelo robô aparecem nas conversas dele.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
              <li>Não desconecte &quot;Mega Esfiha Portal&quot; em Aparelhos conectados.</li>
              <li>Se o celular ficar mais de 14 dias sem internet, o WhatsApp desconecta o portal — aí é só ler o QR Code de novo.</li>
              <li>Cliente que responder <b>SAIR</b> para de receber mensagens automáticas.</li>
            </ul>
          </>
        ) : (
          <>
            <h2 className="font-display text-lg font-bold">Como conectar</h2>
            <p className="text-sm text-stone-700">
              Clique em <b>Conectar (QR Code)</b> e leia o código com o WhatsApp do número da loja, igual ao WhatsApp Web. A partir daí, o portal envia os avisos sozinho.
            </p>
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              ⚠️ Esta conexão não é a API oficial da Meta. Para reduzir o risco de bloqueio do número, o robô envia uma mensagem por vez, com pausa, só para quem pediu na loja, e
              promoções só para quem aceitou recebê-las.
            </p>
          </>
        )}
      </section>

      <section className="card p-5 lg:col-span-2">
        <h2 className="mb-3 font-display text-lg font-bold">Últimos eventos</h2>
        {overview.events.length === 0 ? (
          <p className="text-sm text-stone-500">Nada registrado ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {overview.events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 py-1.5">
                <span className="w-24 shrink-0 text-stone-500">{fmtDateTime(e.at)}</span>
                <span className="font-semibold">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                <span className="text-stone-600">{e.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- Indicadores ----------
function StatsTab({ overview }: { overview: Overview }) {
  const s = overview.stats;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const cards = [
    { label: "Enviadas hoje", value: s.sent, sub: `${s.queued} na fila agora` },
    { label: "Entregues", value: s.delivered, sub: `${pct(s.delivered, s.sent)} das enviadas` },
    { label: "Lidas", value: s.read, sub: `${pct(s.read, s.sent)} das enviadas` },
    { label: "Falhas", value: s.failed, sub: `${s.canceled} não enviadas (SAIR, sem consentimento…)` },
    { label: "Pedidos em andamento", value: s.activeOrders, sub: "delivery e balcão" },
    { label: "Tempo médio hoje", value: s.avgMinutes === null ? "—" : `${s.avgMinutes} min`, sub: "do pedido até concluir" },
    { label: "Nota média (30 dias)", value: s.ratingAvg === null ? "—" : `${String(s.ratingAvg).replace(".", ",")} ⭐`, sub: `${s.ratingCount} avaliações` },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{c.label}</p>
            <p className="mt-1 font-display text-3xl font-extrabold">{c.value}</p>
            <p className="text-xs text-stone-500">{c.sub}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-500">
        &quot;Entregue&quot; e &quot;lida&quot; dependem do celular do cliente: quem desligou a confirmação de leitura nunca aparece como lida.
      </p>
    </div>
  );
}

// ---------- Mensagens (modelos) ----------
function TemplatesTab() {
  const [data, setData] = useState<{ templates: Template[]; vars: { v: string; desc: string }[] } | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const { busy, msg, run } = useAction();
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    api<{ templates: Template[]; vars: { v: string; desc: string }[] }>("/api/admin/wa/templates").then(setData, () => {});
  }, []);

  const save = (t: Template, patch: { body?: string; active?: boolean; reset?: boolean }) =>
    run(async () => {
      const r = await api<{ body: string; active: boolean }>("/api/admin/wa/templates", "PATCH", { key: t.key, ...patch });
      setData((d) => (d ? { ...d, templates: d.templates.map((x) => (x.key === t.key ? { ...x, body: r.body, active: r.active } : x)) } : d));
      setEdit((e) => {
        const n = { ...e };
        delete n[t.key];
        return n;
      });
      return patch.reset ? `"${t.name}" voltou ao texto padrão.` : patch.active !== undefined ? `"${t.name}" ${r.active ? "ligada" : "desligada"}.` : `"${t.name}" salva.`;
    });

  const insertVar = (key: string, v: string) => {
    const el = areas.current[key];
    const cur = edit[key] ?? data?.templates.find((t) => t.key === key)?.body ?? "";
    const pos = el?.selectionStart ?? cur.length;
    setEdit((e) => ({ ...e, [key]: cur.slice(0, pos) + v + cur.slice(el?.selectionEnd ?? pos) }));
  };

  if (!data) return <p className="card p-6 text-sm text-stone-500">Carregando…</p>;
  return (
    <div className="space-y-4">
      <Flash msg={msg} />
      <p className="text-sm text-stone-600">
        Edite o texto de cada aviso. Use as variáveis entre chaves duplas — o robô troca pelo dado do pedido. *texto* fica em <b>negrito</b> no WhatsApp.
      </p>
      {data.templates.map((t) => {
        const body = edit[t.key] ?? t.body;
        const dirty = edit[t.key] !== undefined && edit[t.key] !== t.body;
        return (
          <section key={t.key} className={`card grid gap-4 p-5 lg:grid-cols-2 ${t.active ? "" : "opacity-70"}`}>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold">{t.name}</h3>
                  <p className="text-xs text-stone-500">{t.when}</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={t.active} disabled={busy} onChange={(e) => save(t, { active: e.target.checked })} />
                  {t.active ? "Ligada" : "Desligada"}
                </label>
              </div>
              <textarea
                ref={(el) => {
                  areas.current[t.key] = el;
                }}
                value={body}
                onChange={(e) => setEdit((x) => ({ ...x, [t.key]: e.target.value }))}
                rows={7}
                maxLength={1500}
                className="input text-sm"
              />
              <div className="flex flex-wrap gap-1">
                {data.vars.map((v) => (
                  <button key={v.v} type="button" title={v.desc} onClick={() => insertVar(t.key, v.v)} className="rounded-full bg-stone-100 px-2 py-0.5 font-mono text-xs hover:bg-stone-200">
                    {v.v}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={busy || !dirty} onClick={() => save(t, { body })}>
                  Salvar
                </button>
                {body !== t.defaultBody && (
                  <button className="btn-ghost" disabled={busy} onClick={() => confirm("Voltar ao texto padrão?") && save(t, { reset: true })}>
                    Voltar ao padrão
                  </button>
                )}
                {t.updatedBy && <span className="self-center text-xs text-stone-500">Editada por {t.updatedBy}</span>}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Prévia</p>
              <div className="rounded-2xl bg-[#e5ddd5] p-3">
                <div className="ml-auto max-w-[95%] whitespace-pre-wrap rounded-xl rounded-tr-none bg-[#dcf8c6] p-3 text-sm shadow-sm">{withAutoNotice(renderTemplate(body, SAMPLE))}</div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------- Envios (histórico) ----------
function LogsTab({ tick }: { tick: number }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; pageSize: number; messages: Msg[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { busy, msg, run } = useAction();

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ q, status, kind, page: String(page) });
    try {
      setData(await api(`/api/admin/wa/messages?${sp}`));
    } catch {}
  }, [q, status, kind, page]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 250);
    return () => clearTimeout(id);
  }, [load, tick]);

  const resend = (m: Msg) =>
    run(async () => {
      await api(`/api/admin/wa/messages/${m.id}`, "POST");
      await load();
      return "Mensagem colocada na fila de novo.";
    });
  const cancel = (m: Msg) =>
    run(async () => {
      await api(`/api/admin/wa/messages/${m.id}`, "DELETE");
      await load();
      return "Mensagem cancelada.";
    });

  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-3 p-4">
        <input
          className="input min-w-[14rem] flex-1"
          placeholder="Buscar por nome, telefone, nº do pedido ou texto"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
        <select className="input w-auto" value={status} onChange={(e) => (setStatus(e.target.value), setPage(0))}>
          <option value="">Todas as situações</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v.text}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={kind} onChange={(e) => (setKind(e.target.value), setPage(0))}>
          <option value="">Todos os tipos</option>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <Flash msg={msg} />
      {!data ? (
        <p className="card p-6 text-sm text-stone-500">Carregando…</p>
      ) : data.messages.length === 0 ? (
        <p className="card p-6 text-sm text-stone-500">Nenhuma mensagem encontrada.</p>
      ) : (
        <div className="card divide-y divide-stone-100">
          {data.messages.map((m) => {
            const st = STATUS_LABEL[m.status] ?? { text: m.status, cls: "bg-stone-100" };
            const scheduled = m.status === "QUEUED" && new Date(m.notBefore).getTime() > Date.now();
            return (
              <div key={m.id} className="p-3 text-sm">
                <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <span className="w-24 shrink-0 text-stone-500">{fmtDateTime(m.sentAt ?? m.createdAt)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{scheduled ? `Agendada ${fmtDateTime(m.notBefore)}` : st.text}</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">{KIND_LABEL[m.kind] ?? m.kind}</span>
                  <span className="font-semibold">{m.name ?? "Cliente"}</span>
                  <span className="text-stone-500">{fmtPhone(m.phone)}</span>
                  {m.orderNumber && <span className="text-stone-500">Pedido #{m.orderNumber}</span>}
                  {m.provider === "META" && <span className="text-xs text-stone-500">(API oficial)</span>}
                </button>
                {m.error && m.status !== "SENT" && <p className="mt-1 text-xs text-brand-700">{m.error}</p>}
                {open === m.id && (
                  <div className="mt-2 space-y-2">
                    {m.body && <p className="whitespace-pre-wrap rounded-xl bg-[#dcf8c6] p-3">{m.body}</p>}
                    <p className="text-xs text-stone-500">
                      Criada {fmtDateTime(m.createdAt)}
                      {m.createdBy && ` por ${m.createdBy}`} · Enviada {fmtDateTime(m.sentAt)} · Entregue {fmtDateTime(m.deliveredAt)} · Lida {fmtDateTime(m.readAt)}
                    </p>
                    <div className="flex gap-2">
                      {m.status !== "QUEUED" && m.status !== "SENDING" && (
                        <button className="btn-ghost" disabled={busy} onClick={() => resend(m)}>
                          🔁 Reenviar
                        </button>
                      )}
                      {m.status === "QUEUED" && (
                        <button className="btn-ghost" disabled={busy} onClick={() => cancel(m)}>
                          ✖ Cancelar envio
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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

// ---------- Enviar mensagem ----------
function SendTab({ connected }: { connected: boolean }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const { busy, msg, run } = useAction();
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/api/admin/wa/messages", "POST", { phone, name: name || undefined, text });
      setText("");
      return connected ? "Mensagem na fila — sai em alguns segundos." : "Mensagem na fila — sai assim que o WhatsApp da loja conectar.";
    });
  };
  return (
    <form onSubmit={send} className="card max-w-2xl space-y-3 p-5">
      <h2 className="font-display text-lg font-bold">Mensagem para um cliente</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-stone-600" htmlFor="wa-phone">
            WhatsApp com DDD
          </label>
          <input id="wa-phone" className="input" inputMode="tel" placeholder="(11) 91234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-stone-600" htmlFor="wa-name">
            Nome (opcional)
          </label>
          <input id="wa-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-stone-600" htmlFor="wa-text">
          Mensagem
        </label>
        <textarea id="wa-text" className="input" rows={6} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} required />
        <p className="mt-1 text-xs text-stone-500">Use para avisar um cliente específico. Promoções em massa: use Campanhas. O aviso de número automático (atendimento humano no (11) 98355-7367) é colocado no fim sozinho.</p>
      </div>
      <Flash msg={msg} />
      <button className="btn-primary" disabled={busy}>
        💬 Enviar
      </button>
    </form>
  );
}

// ---------- Campanhas ----------
function CampaignsTab({ tick, marketingHours }: { tick: number; marketingHours: boolean }) {
  const [data, setData] = useState<{ audiences: Record<string, number>; campaigns: Campaign[] } | null>(null);
  const [form, setForm] = useState({ name: "", body: "Oi, {{nome}}! 🍕\n\n", audience: "OPTIN_ALL", inactiveDays: "30", couponCode: "" });
  const { busy, msg, run } = useAction();
  const load = useCallback(async () => {
    try {
      setData(await api("/api/admin/wa/campaigns"));
    } catch {}
  }, []);
  useEffect(() => {
    void load();
  }, [load, tick]);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/api/admin/wa/campaigns", "POST", {
        name: form.name,
        body: form.body,
        audience: form.audience,
        inactiveDays: form.audience === "INACTIVE" ? Number(form.inactiveDays) || 30 : undefined,
        couponCode: form.couponCode || undefined,
      });
      setForm((f) => ({ ...f, name: "", couponCode: "" }));
      await load();
      return "Campanha salva como rascunho. Confira a prévia e clique em Enviar.";
    });
  };
  const send = (c: Campaign) => {
    const n = c.audience === "INACTIVE" ? "os clientes sumidos" : `${data?.audiences[c.audience] ?? 0} clientes`;
    if (!confirm(`Enviar "${c.name}" para ${n}? As mensagens saem uma por vez, com pausa.`)) return;
    run(async () => {
      const r = await api<{ total: number }>(`/api/admin/wa/campaigns/${c.id}`, "POST", { action: "send" });
      await load();
      return `Campanha na fila para ${r.total} clientes.`;
    });
  };
  const cancel = (c: Campaign) =>
    confirm("Cancelar o que ainda não saiu desta campanha?") &&
    run(async () => {
      const r = await api<{ canceled: number }>(`/api/admin/wa/campaigns/${c.id}`, "POST", { action: "cancel" });
      await load();
      return `${r.canceled} mensagens canceladas.`;
    });
  const remove = (c: Campaign) =>
    confirm(`Apagar o rascunho "${c.name}"?`) &&
    run(async () => {
      await api(`/api/admin/wa/campaigns/${c.id}`, "DELETE");
      await load();
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <form onSubmit={create} className="card space-y-3 p-5">
        <h2 className="font-display text-lg font-bold">Nova campanha</h2>
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
          Só recebem clientes que <b>marcaram que aceitam promoções</b> e não responderam SAIR (LGPD). Campanhas saem das 9h às 21h
          {marketingHours ? "." : " — agora está fora do horário, a campanha fica na fila até as 9h."}
        </p>
        <input className="input" placeholder="Nome (só para a loja). Ex: Esfiha em dobro sexta" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} required />
        <select className="input" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
          {Object.entries(AUDIENCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v} {data && k !== "INACTIVE" ? `(${data.audiences[k] ?? 0})` : ""}
            </option>
          ))}
        </select>
        {form.audience === "INACTIVE" && (
          <label className="flex items-center gap-2 text-sm">
            Sem pedir há
            <input className="input w-20" type="number" min={7} max={365} value={form.inactiveDays} onChange={(e) => setForm({ ...form, inactiveDays: e.target.value })} />
            dias
          </label>
        )}
        <textarea className="input text-sm" rows={7} maxLength={1500} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
        <input
          className="input font-mono uppercase"
          placeholder="Cupom geral (opcional) — crie na aba Cupons"
          value={form.couponCode}
          onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })}
          maxLength={30}
        />
        <p className="text-xs text-stone-500">
          Variáveis: <code>{"{{nome}}"}</code> <code>{"{{cupom}}"}</code> <code>{"{{desconto}}"}</code> <code>{"{{validade}}"}</code> <code>{"{{site}}"}</code>. Toda campanha termina com &quot;Para não
          receber promoções, responda SAIR&quot; — acrescente no texto.
        </p>
        <div className="rounded-2xl bg-[#e5ddd5] p-3">
          <div className="ml-auto max-w-[95%] whitespace-pre-wrap rounded-xl rounded-tr-none bg-[#dcf8c6] p-3 text-sm shadow-sm">
            {withAutoNotice(renderTemplate(form.body, { ...SAMPLE, cupom: form.couponCode || SAMPLE.cupom }))}
          </div>
        </div>
        <Flash msg={msg} />
        <button className="btn-primary" disabled={busy}>
          Salvar rascunho
        </button>
      </form>

      <section className="space-y-3">
        {!data ? (
          <p className="card p-6 text-sm text-stone-500">Carregando…</p>
        ) : data.campaigns.length === 0 ? (
          <p className="card p-6 text-sm text-stone-500">Nenhuma campanha ainda.</p>
        ) : (
          data.campaigns.map((c) => (
            <div key={c.id} className="card space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-bold">{c.name}</h3>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold">
                  {{ DRAFT: "Rascunho", SENDING: "Enviando", DONE: "Concluída", CANCELED: "Cancelada" }[c.status] ?? c.status}
                </span>
              </div>
              <p className="text-xs text-stone-500">
                {AUDIENCE_LABEL[c.audience]}
                {c.inactiveDays ? ` (${c.inactiveDays} dias)` : ""}
                {c.couponCode ? ` · cupom ${c.couponCode}` : ""} · criada {fmtDateTime(c.createdAt)}
                {c.createdBy ? ` por ${c.createdBy}` : ""}
              </p>
              <p className="line-clamp-3 whitespace-pre-wrap text-stone-700">{c.body}</p>
              {c.status !== "DRAFT" && (
                <p className="text-xs">
                  {c.total} clientes · {c.result.sent} enviadas · {c.result.delivered} entregues · {c.result.read} lidas · {c.result.failed} falhas · {c.result.queued} na fila
                  {c.result.skipped ? ` · ${c.result.skipped} não enviadas` : ""}
                </p>
              )}
              <div className="flex gap-2">
                {c.status === "DRAFT" && (
                  <>
                    <button className="btn-primary" disabled={busy} onClick={() => send(c)}>
                      📣 Enviar
                    </button>
                    <button className="btn-ghost" disabled={busy} onClick={() => remove(c)}>
                      Apagar
                    </button>
                  </>
                )}
                {c.status === "SENDING" && (
                  <button className="btn-ghost" disabled={busy} onClick={() => cancel(c)}>
                    ✖ Cancelar o restante
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

// ---------- Cupons e automações ----------
function CouponsTab({ config, onConfig }: { config: Config; onConfig: (c: Config) => void }) {
  const [cfg, setCfg] = useState(config);
  const [minOrder, setMinOrder] = useState(config.couponMinOrder ? formatBRL(config.couponMinOrder) : "");
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [personal, setPersonal] = useState(false);
  const today = useMemo(() => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10), []);
  const [form, setForm] = useState({ code: "", kind: "PERCENT", value: "10", minOrder: "", validUntil: today, maxUses: "100" });
  const cfgAction = useAction();
  const couponAction = useAction();

  const load = useCallback(async () => {
    try {
      setCoupons((await api<{ coupons: Coupon[] }>(`/api/admin/wa/coupons${personal ? "?personal=1" : ""}`)).coupons);
    } catch {}
  }, [personal]);
  useEffect(() => {
    void load();
  }, [load]);

  const saveCfg = (e: React.FormEvent) => {
    e.preventDefault();
    cfgAction.run(async () => {
      const min = minOrder.trim() ? parseBRL(minOrder) : 0;
      if (min === null) throw new Error("Pedido mínimo inválido.");
      const { config: next } = await api<{ config: Config }>("/api/admin/wa", "PATCH", {
        ratingEnabled: cfg.ratingEnabled,
        ratingDelayHours: cfg.ratingDelayHours,
        couponEnabled: cfg.couponEnabled,
        couponDelayDays: cfg.couponDelayDays,
        couponPercent: cfg.couponPercent,
        couponValidityDays: cfg.couponValidityDays,
        couponPrefix: cfg.couponPrefix,
        couponMinOrder: min,
        deliveryEta: cfg.deliveryEta,
        minIntervalSeconds: cfg.minIntervalSeconds,
        maxPerHour: cfg.maxPerHour,
      });
      onConfig(next);
      setCfg(next);
      return "Automações salvas.";
    });
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    couponAction.run(async () => {
      const value = form.kind === "PERCENT" ? Number(form.value) : parseBRL(form.value);
      const min = form.minOrder.trim() ? parseBRL(form.minOrder) : 0;
      if (!value || min === null) throw new Error("Confira o valor do desconto e o pedido mínimo.");
      await api("/api/admin/wa/coupons", "POST", { code: form.code, kind: form.kind, value, minOrder: min, validUntil: form.validUntil, maxUses: Number(form.maxUses) || 1 });
      setForm((f) => ({ ...f, code: "" }));
      await load();
      return `Cupom ${form.code.toUpperCase()} criado.`;
    });
  };
  const toggle = (c: Coupon) =>
    couponAction.run(async () => {
      await api("/api/admin/wa/coupons", "PATCH", { code: c.code, active: !c.active });
      await load();
    });

  const num = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg({ ...cfg, [k]: Number(e.target.value) });
  const label = (c: Coupon) => (c.kind === "PERCENT" ? `${c.value}%` : formatBRL(c.value));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={saveCfg} className="card space-y-4 p-5 text-sm">
        <h2 className="font-display text-lg font-bold">Automações</h2>
        <fieldset className="space-y-2">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={cfg.ratingEnabled} onChange={(e) => setCfg({ ...cfg, ratingEnabled: e.target.checked })} />
            Pedir avaliação (1 a 5 ⭐)
          </label>
          <label className="flex items-center gap-2 pl-6">
            <input className="input w-20" type="number" min={1} max={72} value={cfg.ratingDelayHours} onChange={num("ratingDelayHours")} /> horas depois de concluído
          </label>
        </fieldset>
        <fieldset className="space-y-2">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={cfg.couponEnabled} onChange={(e) => setCfg({ ...cfg, couponEnabled: e.target.checked })} />
            Cupom &quot;volte sempre&quot; (só para quem aceitou promoções)
          </label>
          <div className="grid gap-2 pl-6 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input className="input w-20" type="number" min={1} max={60} value={cfg.couponDelayDays} onChange={num("couponDelayDays")} /> dias depois
            </label>
            <label className="flex items-center gap-2">
              <input className="input w-20" type="number" min={1} max={50} value={cfg.couponPercent} onChange={num("couponPercent")} /> % de desconto
            </label>
            <label className="flex items-center gap-2">
              vale
              <input className="input w-20" type="number" min={1} max={90} value={cfg.couponValidityDays} onChange={num("couponValidityDays")} /> dias
            </label>
            <label className="flex items-center gap-2">
              código
              <input className="input w-28 font-mono uppercase" value={cfg.couponPrefix} maxLength={10} onChange={(e) => setCfg({ ...cfg, couponPrefix: e.target.value.toUpperCase() })} />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              pedido mínimo
              <input className="input w-28" placeholder="R$ 0,00" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
            </label>
          </div>
          <p className="pl-6 text-xs text-stone-500">
            Cada cliente recebe um código pessoal (ex: {cfg.couponPrefix}
            {cfg.couponPercent}-K7Q2), que só vale para o WhatsApp dele e uma vez. Se ele pedir de novo antes, o cupom não é enviado.
          </p>
        </fieldset>
        <label className="block">
          <span className="font-semibold">Tempo de entrega na mensagem &quot;saiu para entrega&quot;</span>
          <input className="input mt-1" value={cfg.deliveryEta} maxLength={40} onChange={(e) => setCfg({ ...cfg, deliveryEta: e.target.value })} />
        </label>
        <details>
          <summary className="cursor-pointer font-semibold">Ritmo de envio (proteção contra bloqueio)</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              pausa mínima
              <input className="input w-20" type="number" min={3} max={120} value={cfg.minIntervalSeconds} onChange={num("minIntervalSeconds")} /> s
            </label>
            <label className="flex items-center gap-2">
              máximo
              <input className="input w-20" type="number" min={10} max={400} value={cfg.maxPerHour} onChange={num("maxPerHour")} /> por hora
            </label>
          </div>
        </details>
        <Flash msg={cfgAction.msg} />
        <button className="btn-primary" disabled={cfgAction.busy}>
          Salvar automações
        </button>
      </form>

      <section className="space-y-4">
        <form onSubmit={create} className="card space-y-3 p-5 text-sm">
          <h2 className="font-display text-lg font-bold">Novo cupom geral</h2>
          <p className="text-xs text-stone-500">Código que qualquer cliente digita no carrinho (ex: para uma campanha). O desconto vale sobre os itens, sem a taxa de entrega.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input font-mono uppercase" placeholder="Código. Ex: SEXTA15" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} maxLength={30} required />
            <div className="flex gap-2">
              <select className="input w-auto" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="PERCENT">%</option>
                <option value="FIXED">R$</option>
              </select>
              <input className="input" placeholder={form.kind === "PERCENT" ? "10" : "5,00"} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
            </div>
            <label className="flex items-center gap-2">
              mínimo
              <input className="input" placeholder="R$ 0,00" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} />
            </label>
            <label className="flex items-center gap-2">
              usos
              <input className="input" type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              válido até
              <input className="input w-auto" type="date" min={today} value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} required />
            </label>
          </div>
          <Flash msg={couponAction.msg} />
          <button className="btn-primary" disabled={couponAction.busy}>
            Criar cupom
          </button>
        </form>

        <div className="card p-4 text-sm">
          <div className="mb-2 flex gap-2">
            <button className={`rounded-full px-3 py-1 text-xs font-semibold ${!personal ? "bg-ink-950 text-white" : "bg-stone-100"}`} onClick={() => setPersonal(false)}>
              Gerais
            </button>
            <button className={`rounded-full px-3 py-1 text-xs font-semibold ${personal ? "bg-ink-950 text-white" : "bg-stone-100"}`} onClick={() => setPersonal(true)}>
              Pessoais (volte sempre)
            </button>
          </div>
          {!coupons ? (
            <p className="text-stone-500">Carregando…</p>
          ) : coupons.length === 0 ? (
            <p className="text-stone-500">Nenhum cupom.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {coupons.map((c) => {
                const expired = new Date(c.validUntil).getTime() < Date.now();
                return (
                  <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="font-mono font-bold">{c.code}</span>
                    <span>{label(c)}</span>
                    <span className="text-xs text-stone-500">
                      até {fmtDate(c.validUntil)} · {c.usedCount}/{c.maxUses} usos{c.minOrder ? ` · mín. ${formatBRL(c.minOrder)}` : ""}
                      {c.phone ? ` · ${fmtPhone(c.phone)}` : ""}
                      {c.salesTotal ? ` · vendeu ${formatBRL(c.salesTotal)}` : ""}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {expired ? (
                        <span className="text-xs text-stone-500">vencido</span>
                      ) : (
                        <button className="btn-ghost px-2 py-1 text-xs" disabled={couponAction.busy} onClick={() => toggle(c)}>
                          {c.active ? "Desativar" : "Ativar"}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------- Clientes (CRM) ----------
function CrmTab() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; pageSize: number; summary: { contacts: number; optIn: number; optOut: number }; customers: Customer[] } | null>(null);

  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        setData(await api(`/api/admin/wa/crm?${new URLSearchParams({ q, filter, page: String(page) })}`));
      } catch {}
    }, 250);
    return () => clearTimeout(id);
  }, [q, filter, page]);

  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const FILTERS = [
    ["", "Todos"],
    ["vip", "⭐ VIP"],
    ["inactive", "💤 Sumidos (30+ dias)"],
    ["optin", "✅ Aceitam promoções"],
    ["optout", "🙅 Pediram SAIR"],
  ];
  return (
    <div className="space-y-4">
      {data && (
        <p className="text-sm text-stone-600">
          {data.summary.contacts} contatos · {data.summary.optIn} aceitam promoções · {data.summary.optOut} pediram para sair
        </p>
      )}
      <div className="card flex flex-wrap gap-2 p-4">
        <input className="input min-w-[14rem] flex-1" placeholder="Buscar por nome ou telefone" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} />
        {FILTERS.map(([k, v]) => (
          <button key={k} onClick={() => (setFilter(k), setPage(0))} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === k ? "bg-ink-950 text-white" : "bg-stone-100"}`}>
            {v}
          </button>
        ))}
      </div>
      {!data ? (
        <p className="card p-6 text-sm text-stone-500">Carregando…</p>
      ) : data.customers.length === 0 ? (
        <p className="card p-6 text-sm text-stone-500">Nenhum cliente encontrado.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="p-3">Cliente</th>
                <th className="p-3">Pedidos</th>
                <th className="p-3">Ticket médio</th>
                <th className="p-3">Último pedido</th>
                <th className="p-3">Último contato</th>
                <th className="p-3">Mensagens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.customers.map((c) => (
                <tr key={c.phone}>
                  <td className="p-3">
                    <p className="font-semibold">
                      {c.name ?? "—"} {c.vip && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">VIP</span>}
                      {c.inactive && <span className="ml-1 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-700">SUMIDO</span>}
                      {c.optOut && <span className="ml-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-800">SAIR</span>}
                      {!c.optOut && c.marketingOptIn && <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">PROMO ✓</span>}
                    </p>
                    <p className="text-xs text-stone-500">{fmtPhone(c.phone)}</p>
                  </td>
                  <td className="p-3">
                    {c.orders} · {formatBRL(c.total)}
                  </td>
                  <td className="p-3">{c.orders ? formatBRL(c.avgTicket) : "—"}</td>
                  <td className="p-3">{fmtDate(c.lastOrderAt)}</td>
                  <td className="p-3">{fmtDateTime(c.lastContactAt)}</td>
                  <td className="p-3">{c.messages}</td>
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
