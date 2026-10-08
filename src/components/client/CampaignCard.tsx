"use client";

import { useState } from "react";
import type { CampaignInfo } from "@/types/menu";
import { formatBRL } from "@/lib/money";

const WEEKDAY_PLURAL = ["domingos", "segundas", "terças", "quartas", "quintas", "sextas", "sábados"];

/** [5, 6, 0] → "sextas, sábados e domingos" (na ordem do fim de semana). */
function weekdaysText(days: number[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const names = order.filter((d) => days.includes(d)).map((d) => WEEKDAY_PLURAL[d]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/** [5, 6, 0] → "Sex/Sáb/Dom" (versão curta para telas pequenas). */
const weekdaysShort = (days: number[]) => [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => WEEKDAY_SHORT[d]).join("/");

/** "18:00" → "18h", "22:30" → "22h30". */
export const hourLabel = (hhmm: string) => hhmm.replace(/^0/, "").replace(/:00$/, "h").replace(":", "h");

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function instagramUrl(user: string) {
  return `https://www.instagram.com/${encodeURIComponent(user.replace(/^@/, ""))}/`;
}

/** Botão "Siga no Instagram" nas cores da marca do Instagram. */
export function InstagramButton({ user, className = "", label }: { user: string; className?: string; label?: string }) {
  const handle = user.replace(/^@/, "");
  return (
    <a
      href={instagramUrl(handle)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgb(221_42_123/0.7)] transition hover:brightness-110 active:scale-[0.98] ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
      {label ?? `Siga @${handle}`}
    </a>
  );
}

/**
 * Apresentação da campanha Mesa Premiada no cardápio: o que é, quando acontece e como participar.
 * Só usa dados públicos da campanha — nunca nada sobre a mesa sorteada.
 */
export function CampaignCard({ campaign, instagram }: { campaign: CampaignInfo; instagram: string | null }) {
  const [open, setOpen] = useState(false);
  const prize = formatBRL(campaign.discount);
  const days = weekdaysText(campaign.weekdays);
  const hours = `das ${hourLabel(campaign.drawStart)} às ${hourLabel(campaign.drawEnd)}`;

  const status = campaign.eventToday
    ? { text: "🎉 Hoje tem sorteio!", cls: "bg-mega-400 text-ink-900 animate-pulse" }
    : campaign.started
      ? { text: "🎄 Campanha no ar", cls: "bg-white/20 text-white" }
      : campaign.daysToStart === 1
        ? { text: "⏳ Começa amanhã!", cls: "bg-mega-400 text-ink-900" }
        : { text: `⏳ Faltam ${campaign.daysToStart} dias`, cls: "bg-mega-400 text-ink-900" };

  return (
    <section
      aria-labelledby="campaign-title"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f5132] via-[#8f0f18] to-[#0b3d26] p-[3px] shadow-lift"
    >
      {/* Moldura dourada animada */}
      <div className="pointer-events-none absolute inset-0 animate-shine bg-[linear-gradient(110deg,transparent_30%,rgba(255,220,10,0.55)_50%,transparent_70%)] bg-[length:250%_100%]" aria-hidden />
      <div className="relative overflow-hidden rounded-[21px] bg-gradient-to-br from-[#0f5132] via-[#b3121d] to-[#0f5132] p-5 text-white">
        <div className="bg-dots absolute inset-0" aria-hidden />
        <span className="pointer-events-none absolute -right-3 -top-2 select-none text-7xl opacity-25 animate-sway" aria-hidden>
          🎄
        </span>

        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest">Vem aí</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.cls}`}>{status.text}</span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-mega-400 text-4xl shadow-lift animate-wiggle" aria-hidden>
              🎁
            </span>
            <div>
              <h2 id="campaign-title" className="font-display text-3xl font-black leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
                Mesa Premiada
              </h2>
              <p className="font-display text-sm font-bold uppercase tracking-[0.25em] text-mega-300">Edição de Natal</p>
            </div>
          </div>

          <p className="mt-3 text-sm leading-snug text-white/95 sm:text-[15px]">
            Venha comer na loja: <strong>todo dia de campanha uma mesa é sorteada</strong> e ganha{" "}
            <strong className="text-mega-300">{prize} de desconto</strong> na conta. Se a conta for até {prize},{" "}
            <strong>sai de graça!</strong>
          </p>

          <ul className="mt-4 grid grid-cols-3 gap-2">
            <Fact icon="📅" label="Período" value={`${brDate(campaign.startDate)} a ${brDate(campaign.endDate)}`} />
            <Fact
              icon="🗓️"
              label="Sorteios"
              value={`${days.charAt(0).toUpperCase() + days.slice(1)}, ${hours}`}
              short={`${weekdaysShort(campaign.weekdays)} · ${hourLabel(campaign.drawStart)}–${hourLabel(campaign.drawEnd)}`}
            />
            <Fact icon="🎁" label="Prêmio" value={`${prize} de desconto`} short={`${prize.replace(",00", "")} OFF`} />
          </ul>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-3 flex w-full items-center justify-between rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/20 transition hover:bg-white/15"
          >
            Como participar
            <span className={`transition ${open ? "rotate-180" : ""}`} aria-hidden>
              ▾
            </span>
          </button>
          {open && (
            <ol className="mt-3 space-y-2 text-sm text-white/95">
              <Step n={1}>Sente em uma das mesas participantes ({campaign.minTable} a {campaign.maxTable}).</Step>
              <Step n={2}>Aponte a câmera para o QR Code da mesa e faça seu pedido por aqui.</Step>
              <Step n={3}>
                Às {days}, {hours}, o sistema sorteia uma das mesas ocupadas. O resultado é surpresa: <strong>você descobre na hora de pagar no caixa!</strong>
              </Step>
              <Step n={4}>Ganhou? O desconto de {prize} entra na hora. Um prêmio por dia de campanha.</Step>
            </ol>
          )}

          {instagram && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-black/20 p-2.5 pl-3.5">
              <p className="text-[13px] leading-snug sm:text-sm">
                📸 Poste sua foto e marque <strong>@{instagram}</strong>
              </p>
              <InstagramButton user={instagram} label="Seguir" className="shrink-0 px-3.5 py-2" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** No celular: ícone em cima e texto curto, três lado a lado. No computador: versão completa. */
function Fact({ icon, label, value, short }: { icon: string; label: string; value: string; short?: string }) {
  return (
    <li className="flex flex-col items-center gap-1 rounded-xl bg-white/10 px-1 py-2.5 text-center ring-1 ring-white/15 sm:flex-row sm:gap-2.5 sm:px-3 sm:text-left">
      <span className="text-xl" aria-hidden>
        {icon}
      </span>
      <span className="leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-white/70 sm:text-[11px]">{label}</span>
        <span className="block whitespace-nowrap font-display text-[12px] font-bold sm:hidden">{short ?? value}</span>
        <span className="hidden font-display text-sm font-bold sm:block">{value}</span>
      </span>
    </li>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mega-400 font-display text-xs font-bold text-ink-900">{n}</span>
      <span>{children}</span>
    </li>
  );
}
