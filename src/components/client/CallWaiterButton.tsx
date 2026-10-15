"use client";

import { useEffect, useState } from "react";

const COOLDOWN_MS = 60_000;

/**
 * Botão "Chamar atendente" para quem está na mesa (entrou pelo QR Code). Abre duas opções:
 * chamar alguém ou pedir a conta. A loja recebe o aviso com som no portal.
 */
export function CallWaiterButton({ tableNumber, tableToken, raised }: { tableNumber: number; tableToken: string; raised: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!sentAt) return;
    const id = setInterval(() => tick((n) => n + 1), 5_000);
    const done = setTimeout(() => setSentAt(null), COOLDOWN_MS);
    return () => {
      clearInterval(id);
      clearTimeout(done);
    };
  }, [sentAt]);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 7_000);
    return () => clearTimeout(id);
  }, [message]);

  async function call(reason: "ATENDIMENTO" | "CONTA") {
    setBusy(true);
    try {
      const res = await fetch("/api/tables/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber, tableToken, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setSentAt(Date.now());
        setMessage({
          ok: true,
          text: reason === "CONTA" ? `Pronto! Já vamos levar a conta na Mesa ${tableNumber}.` : `Pronto! Avisamos a equipe, já vamos até a Mesa ${tableNumber}.`,
        });
      } else {
        setMessage({ ok: false, text: data.error ?? "Não foi possível chamar agora. Tente de novo." });
      }
    } catch {
      setMessage({ ok: false, text: "Sem conexão. Tente de novo em instantes." });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const waiting = sentAt !== null;
  return (
    <>
      <div className={`fixed left-4 z-30 transition-all ${raised ? "bottom-24" : "bottom-4"} pb-[env(safe-area-inset-bottom)]`}>
        <button
          onClick={() => setOpen(true)}
          disabled={waiting}
          className="flex items-center gap-2 rounded-full bg-mega-400 px-4 py-3 font-display font-bold text-ink-900 shadow-lift ring-2 ring-ink-900/10 transition hover:bg-mega-300 active:scale-95 disabled:opacity-80"
        >
          <span className="text-xl" aria-hidden>
            🙋
          </span>
          {waiting ? "Atendente a caminho…" : "Chamar atendente"}
        </button>
      </div>

      {message && (
        <div
          className={`fixed inset-x-4 top-4 z-50 mx-auto max-w-md animate-slide-up rounded-2xl p-4 text-center font-semibold shadow-lift ${message.ok ? "bg-emerald-600 text-white" : "bg-brand-600 text-white"}`}
          role="status"
        >
          {message.text}
        </div>
      )}

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="sheet w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="call-title">
            <p id="call-title" className="font-display text-xl font-extrabold">
              Mesa {tableNumber}
            </p>
            <p className="text-sm text-stone-500">Do que você precisa?</p>
            <div className="mt-4 grid gap-2">
              <button disabled={busy} onClick={() => call("ATENDIMENTO")} className="btn-primary py-3.5 text-base">
                🙋 Chamar atendente
              </button>
              <button disabled={busy} onClick={() => call("CONTA")} className="btn-ghost py-3.5 text-base">
                💳 Pedir a conta
              </button>
              <button onClick={() => setOpen(false)} className="mt-1 text-sm text-stone-500 underline">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
