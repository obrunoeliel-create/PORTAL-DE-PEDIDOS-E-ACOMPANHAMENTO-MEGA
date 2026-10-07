import "server-only";
import type { OrderStatus, OrderType, PaymentMethod, Prisma } from "@prisma/client";

// Filtros compartilhados pelo Histórico de pedidos e pelo Financeiro.
// Datas sempre no horário de Brasília (UTC-3, sem horário de verão desde 2019).

const TZ = "America/Sao_Paulo";
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_PERIOD_DAYS = 366;

export const TYPES: OrderType[] = ["DELIVERY", "PICKUP", "TABLE"];
export const PAYMENTS: PaymentMethod[] = ["PIX", "CARD", "CASH", "ON_SITE"];
export const STATUSES: OrderStatus[] = ["PENDING", "PREPARING", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELED"];

export const PRESETS = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "mes-passado", label: "Mês passado" },
] as const;
export type PresetId = (typeof PRESETS)[number]["id"];

export type SearchParams = Record<string, string | string[] | undefined>;

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00-03:00`));

/** Meia-noite (Brasília) do dia "AAAA-MM-DD". */
export const dayStart = (date: string) => new Date(`${date}T00:00:00-03:00`);

/** Soma dias a uma data "AAAA-MM-DD". */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dia (AAAA-MM-DD), hora (0–23) e dia da semana (0 = domingo) de um instante, em Brasília. */
export function brParts(date: Date) {
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours(), weekday: shifted.getUTCDay() };
}

export const brDateLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

function presetRange(id: PresetId, today: string): { from: string; to: string } {
  switch (id) {
    case "ontem":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "mes":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "mes-passado": {
      const lastDayPrev = addDays(`${today.slice(0, 8)}01`, -1);
      return { from: `${lastDayPrev.slice(0, 8)}01`, to: lastDayPrev };
    }
    default:
      return { from: today, to: today };
  }
}

export type Period = {
  /** Atalho escolhido, ou null quando as datas foram digitadas. */
  preset: PresetId | null;
  from: string;
  to: string;
  start: Date;
  /** Exclusivo: meia-noite do dia seguinte a `to`. */
  end: Date;
  days: number;
};

/** Período do Financeiro: `p` (atalho) ou `de`/`ate`; sem nada, hoje. Limitado a um ano. */
export function parsePeriod(sp: SearchParams): Period {
  const today = todayBR();
  const de = first(sp.de);
  const ate = first(sp.ate);
  let preset: PresetId | null = null;
  let from = today;
  let to = today;

  if (isDate(de) || isDate(ate)) {
    from = isDate(de) ? de : ate;
    to = isDate(ate) ? ate : de;
    if (from > to) [from, to] = [to, from];
  } else {
    const p = first(sp.p);
    preset = PRESETS.some((x) => x.id === p) ? (p as PresetId) : "hoje";
    ({ from, to } = presetRange(preset, today));
  }
  if (to > today) to = today;
  if (from > to) from = to;

  let start = dayStart(from);
  const end = new Date(dayStart(to).getTime() + DAY_MS);
  let days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (days > MAX_PERIOD_DAYS) {
    from = addDays(to, -(MAX_PERIOD_DAYS - 1));
    start = dayStart(from);
    days = MAX_PERIOD_DAYS;
  }
  return { preset, from, to, start, end, days };
}

export const parseType = (v: string) => (TYPES.includes(v as OrderType) ? (v as OrderType) : null);
export const parsePayment = (v: string) => (PAYMENTS.includes(v as PaymentMethod) ? (v as PaymentMethod) : null);
export const parseStatus = (v: string) => (STATUSES.includes(v as OrderStatus) ? (v as OrderStatus) : null);

/**
 * Busca livre do Histórico: número do pedido ("#123" ou "123"), nome do cliente ou telefone.
 * Tudo vai como parâmetro do Prisma (nunca SQL montado na mão).
 */
export function searchWhere(raw: string): Prisma.OrderWhereInput | null {
  const q = raw.trim().slice(0, 80);
  if (!q) return null;
  const digits = q.replace(/\D/g, "");
  const onlyNumber = /^#?\s*\d{1,9}$/.test(q);
  const or: Prisma.OrderWhereInput[] = [];
  if (onlyNumber) or.push({ number: Number(digits) });
  if (digits.length >= 4) or.push({ customerPhone: { contains: digits } });
  if (!onlyNumber || digits.length < 4) or.push({ customerName: { contains: q.replace(/^#/, ""), mode: "insensitive" } });
  if (/[a-zA-ZÀ-ÿ]/.test(q)) or.push({ addressDistrict: { contains: q, mode: "insensitive" } });
  return { OR: or };
}

/** Monta a query string mantendo só os filtros preenchidos. */
export function toQuery(params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : "";
}
