"use client";

import { useEffect } from "react";
import { formatBRL } from "@/lib/money";
import { playCelebration } from "@/lib/celebration-sound";

export type PrizePreview = { tableNumber: number; original: number; discount: number; final: number };

const PAY = [
  { v: "CASH", label: "💵 Dinheiro" },
  { v: "CARD", label: "💳 Cartão" },
  { v: "PIX", label: "⚡ PIX" },
] as const;

const CONFETTI = ["#ffdc0a", "#e8262a", "#16a34a", "#ffffff", "#f59e0b", "#22c55e"];

/**
 * Pop-up de comemoração da Mesa Premiada (tela do caixa).
 * Mostra valor original, desconto e valor final, e toca sinos + fanfarra ao abrir.
 */
export function PrizeModal({
  preview,
  busy,
  onConfirm,
  onClose,
}: {
  preview: PrizePreview;
  busy: boolean;
  onConfirm: (paidWith: string | null) => void;
  onClose: () => void;
}) {
  // Abre por um clique no botão de fechamento, então o navegador libera o áudio.
  useEffect(() => {
    playCelebration();
  }, []);

  const free = preview.final === 0;

  return (
    <div className="fixed inset-0 z-[70] flex animate-fade-in items-center justify-center overflow-hidden bg-ink-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-labelledby="prize-title">
      {/* Confete caindo */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {Array.from({ length: 48 }, (_, i) => (
          <span
            key={i}
            className="absolute top-[-6%] animate-confetti"
            style={{
              left: `${(i * 53) % 100}%`,
              width: 6 + (i % 4) * 2,
              height: 10 + (i % 3) * 4,
              background: CONFETTI[i % CONFETTI.length],
              borderRadius: i % 5 === 0 ? "50%" : 2,
              animationDuration: `${2.6 + (i % 7) * 0.35}s`,
              animationDelay: `${(i % 12) * 0.18}s`,
            }}
          />
        ))}
      </div>

      <div className="relative w-full max-w-md animate-pop overflow-hidden rounded-3xl bg-white shadow-lift ring-4 ring-mega-400">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f5132] via-[#b3121d] to-[#0f5132] px-6 pb-7 pt-6 text-center text-white">
          <div className="bg-dots absolute inset-0" aria-hidden />
          <div className="relative flex justify-between px-1" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 animate-twinkle rounded-full"
                style={{ background: CONFETTI[i % 4], animationDelay: `${(i % 5) * 0.2}s`, boxShadow: `0 0 8px ${CONFETTI[i % 4]}` }}
              />
            ))}
          </div>
          <p className="relative mt-3 text-5xl">
            <span className="inline-block animate-hop">🎄</span>
            <span className="mx-1 inline-block animate-wiggle">🎁</span>
            <span className="inline-block animate-hop" style={{ animationDelay: "0.3s" }}>
              🎅
            </span>
          </p>
          <h2 id="prize-title" className="relative mt-2 font-display text-3xl font-black tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
            MESA PREMIADA! 🎄🎁
          </h2>
          <p className="relative mt-1 text-sm text-white/90">
            A <strong>Mesa {preview.tableNumber}</strong> é a sorteada de hoje. Avise o cliente — ele ganhou!
          </p>
        </div>

        <div className="space-y-3 p-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500">Valor original</dt>
              <dd className="font-display text-lg font-bold text-stone-500 line-through">{formatBRL(preview.original)}</dd>
            </div>
            <div className="flex justify-between rounded-xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
              <dt className="font-semibold text-emerald-800">🎁 Desconto aplicado</dt>
              <dd className="font-display text-lg font-extrabold text-emerald-700">− {formatBRL(preview.discount)}</dd>
            </div>
            <div className="flex items-end justify-between border-t border-dashed border-stone-200 pt-3">
              <dt className="font-display text-base font-bold">Valor final</dt>
              <dd className="font-display text-4xl font-black text-brand-700">{formatBRL(preview.final)}</dd>
            </div>
          </dl>

          {free ? (
            <>
              <p className="rounded-xl bg-mega-100 p-3 text-center text-sm font-semibold text-ink-900 ring-1 ring-mega-300">
                🎉 A conta saiu de graça! Nada a receber.
              </p>
              <button disabled={busy} onClick={() => onConfirm(null)} className="btn-primary w-full py-3.5 text-base">
                {busy ? "Fechando..." : "Confirmar prêmio e fechar mesa"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Como o cliente vai pagar {formatBRL(preview.final)}?</p>
              <div className="grid grid-cols-3 gap-2">
                {PAY.map((p) => (
                  <button key={p.v} disabled={busy} onClick={() => onConfirm(p.v)} className="btn-ghost px-2 py-3 text-xs font-bold">
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => playCelebration()} className="text-xs font-medium text-stone-500 underline">
              🔔 Tocar de novo
            </button>
            <button onClick={onClose} disabled={busy} className="text-xs font-medium text-stone-500 underline">
              Voltar sem fechar a mesa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
