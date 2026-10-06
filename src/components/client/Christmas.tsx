"use client";

import type { CampaignInfo } from "@/types/menu";

// Decoração de Natal / fim de ano. Some sozinha depois do Dia de Reis.
const CAMPAIGN_UNTIL = new Date("2027-01-07T03:00:00Z"); // 07/01/2027 00:00 (Brasília)
const isSeason = () => Date.now() < CAMPAIGN_UNTIL.getTime();

const BASE_MESSAGES = [
  "🎄 Vem aí a MESA PREMIADA",
  "🎁 Campanha de Natal e Fim de Ano",
  "⭐ Aguardem as surpresas!",
  "🔔 Mega Esfiha Jurema deseja Boas Festas",
  "🎅 Prêmios para quem pede na mesa",
];

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Com a campanha cadastrada, a faixa anuncia o período e o prêmio de verdade. */
function bannerMessages(campaign: CampaignInfo | null): string[] {
  if (!campaign) return BASE_MESSAGES;
  const prize = `R$ ${(campaign.discount / 100).toFixed(0)}`;
  return [
    campaign.eventToday ? "🎉 HOJE TEM MESA PREMIADA" : campaign.started ? "🎄 MESA PREMIADA no ar" : "🎄 Vem aí a MESA PREMIADA",
    `📅 De ${dm(campaign.startDate)} a ${dm(campaign.endDate)}`,
    "🗓️ Sextas, sábados e domingos",
    `🎁 Uma mesa por dia ganha ${prize} de desconto`,
    "🔔 Mega Esfiha Jurema deseja Boas Festas",
  ];
}

/** Faixa horizontal animada no topo do cardápio. */
export function ChristmasBanner({ campaign = null }: { campaign?: CampaignInfo | null }) {
  if (!isSeason()) return null;
  const MESSAGES = bannerMessages(campaign);
  const strip = (hidden: boolean) => (
    <div className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={hidden}>
      {MESSAGES.map((m) => (
        <span key={m} className="flex items-center gap-8 whitespace-nowrap">
          <span className="font-display text-sm font-extrabold uppercase tracking-wide sm:text-base">{m}</span>
          <span className="text-mega-300" aria-hidden>
            ✦
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-[#0f5132] via-[#b3121d] to-[#0f5132] text-white" role="marquee" aria-label="Vem aí a Mesa Premiada — Campanha de Natal e Fim de Ano. Aguardem!">
      <XmasLights />
      <div className="flex w-max py-2.5 animate-marquee">
        {strip(false)}
        {strip(true)}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#0f5132] to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#0f5132] to-transparent" aria-hidden />
    </div>
  );
}

/** Varal de luzinhas piscando. */
function XmasLights() {
  const colors = ["#ffdc0a", "#ff4d4d", "#4ade80", "#60a5fa", "#ffdc0a", "#f472b6"];
  return (
    <div className="flex justify-between px-1" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="mt-0.5 h-2 w-2 rounded-full animate-twinkle"
          style={{ background: colors[i % colors.length], animationDelay: `${(i % 7) * 0.25}s`, boxShadow: `0 0 6px ${colors[i % colors.length]}` }}
        />
      ))}
    </div>
  );
}

/** Bonecos de Natal fixos no fundo do topo, cada um com seu movimento. */
const FIGURES = [
  { icon: "⛄", left: "3%", top: "8%", size: 44, anim: "animate-sway", delay: "0s" },
  { icon: "🎄", left: "24%", top: "2%", size: 40, anim: "animate-hop", delay: "0.4s" },
  { icon: "🎁", left: "45%", top: "9%", size: 34, anim: "animate-sway", delay: "0.8s" },
  { icon: "🧝", left: "63%", top: "3%", size: 40, anim: "animate-hop", delay: "0.2s" },
  { icon: "🔔", left: "80%", top: "8%", size: 34, anim: "animate-sway", delay: "0.6s" },
  { icon: "☃️", left: "92%", top: "40%", size: 38, anim: "animate-hop", delay: "1s" },
  { icon: "🦌", left: "-1%", top: "58%", size: 36, anim: "animate-hop", delay: "0.7s" },
];

function XmasFigures() {
  return (
    <>
      {FIGURES.map((f) => (
        <span
          key={f.icon + f.left}
          className={`absolute origin-bottom select-none opacity-60 drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] ${f.anim}`}
          style={{ left: f.left, top: f.top, fontSize: f.size, lineHeight: 1, animationDelay: f.delay }}
        >
          {f.icon}
        </span>
      ))}
    </>
  );
}

/** Papai Noel no trenó com as renas, cruzando o topo na horizontal e deixando um rastro de brilho. */
function SantaFlight() {
  const sparkles = [
    { left: "4%", top: "-30%", size: 20, delay: "0s" },
    { left: "16%", top: "45%", size: 14, delay: "0.3s" },
    { left: "28%", top: "-45%", size: 16, delay: "0.6s" },
    { left: "40%", top: "30%", size: 12, delay: "0.15s" },
    { left: "52%", top: "-25%", size: 14, delay: "0.45s" },
    { left: "64%", top: "40%", size: 10, delay: "0.75s" },
    { left: "76%", top: "-35%", size: 11, delay: "0.2s" },
    { left: "88%", top: "20%", size: 8, delay: "0.55s" },
  ];
  return (
    // Anima mesmo com "reduzir movimento" ligado no sistema: é a decoração pedida pela loja, lenta e só no topo.
    <div className="absolute left-0 top-[26%] w-max animate-santa">
      <div className="flex items-center animate-bob">
        {/* As renas e o trenó olham para a esquerda: voam da direita para a esquerda. */}
        <span className="text-[44px] leading-none drop-shadow-[0_3px_6px_rgba(0,0,0,0.35)] sm:text-[56px]">🦌🦌🦌</span>
        <span className="relative -ml-1 text-[48px] leading-none drop-shadow-[0_3px_6px_rgba(0,0,0,0.35)] sm:text-[60px]">
          🛷
          <span className="absolute -top-[0.55em] left-[0.18em] text-[0.8em]">🎅</span>
        </span>
        {/* Rastro de brilho */}
        <span className="relative ml-1 block h-10 w-56 sm:w-72">
          <span className="absolute left-0 top-1/2 h-2 w-full -translate-y-1/2 rounded-full bg-gradient-to-r from-mega-200 via-mega-300/60 to-transparent blur-[2px]" />
          <span className="absolute left-0 top-1/2 h-0.5 w-4/5 -translate-y-1/2 rounded-full bg-gradient-to-r from-white to-transparent" />
          {sparkles.map((s, i) => (
            <span
              key={i}
              className="absolute text-mega-200 animate-twinkle"
              style={{ left: s.left, top: s.top, fontSize: s.size, animationDelay: s.delay, textShadow: "0 0 8px #ffdc0a, 0 0 14px #fff" }}
            >
              {i % 3 === 0 ? "✨" : "✦"}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** Decoração do topo vermelho: neve, bonecos de Natal e o Papai Noel voando (não bloqueia cliques). */
export function SnowLayer() {
  if (!isSeason()) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <XmasFigures />
      <SantaFlight />
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="absolute top-[-10%] text-white/80 animate-snow"
          style={{
            left: `${(i * 37) % 100}%`,
            fontSize: `${8 + ((i * 7) % 10)}px`,
            animationDuration: `${7 + ((i * 3) % 7)}s`,
            animationDelay: `${(i * 0.9) % 7}s`,
          }}
        >
          ❄
        </span>
      ))}
    </div>
  );
}
