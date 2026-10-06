"use client";

// Decoração de Natal / fim de ano. Some sozinha depois do Dia de Reis.
const CAMPAIGN_UNTIL = new Date("2027-01-07T03:00:00Z"); // 07/01/2027 00:00 (Brasília)
const isSeason = () => Date.now() < CAMPAIGN_UNTIL.getTime();

const MESSAGES = [
  "🎄 Vem aí a MESA PREMIADA",
  "🎁 Campanha de Natal e Fim de Ano",
  "⭐ Aguardem as surpresas!",
  "🔔 Mega Esfiha Jurema deseja Boas Festas",
  "🎅 Prêmios para quem pede na mesa",
];

/** Faixa horizontal animada no topo do cardápio. */
export function ChristmasBanner() {
  if (!isSeason()) return null;
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
      <div className="flex w-max py-2.5 motion-safe:animate-marquee">
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
          className="mt-0.5 h-2 w-2 rounded-full motion-safe:animate-twinkle"
          style={{ background: colors[i % colors.length], animationDelay: `${(i % 7) * 0.25}s`, boxShadow: `0 0 6px ${colors[i % colors.length]}` }}
        />
      ))}
    </div>
  );
}

/** Neve caindo sobre o topo vermelho (só decoração, não bloqueia cliques). */
export function SnowLayer() {
  if (!isSeason()) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="absolute top-[-10%] text-white/80 motion-safe:animate-snow"
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
