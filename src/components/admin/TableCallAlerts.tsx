"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStaffSocket } from "./useStaffSocket";
import { isOrderAlertEnabled, playTableCallAlert, unlockOrderAlert } from "@/lib/order-alert";

type Call = { id: string; tableNumber: number; reason: "ATENDIMENTO" | "CONTA"; createdAt: string };

const REPEAT_MS = 20_000;

/**
 * Aviso de "Chamar atendente" em todas as telas do portal: cartão fixo no topo com a mesa, som com voz
 * ("Mesa 7 chamando o atendente") repetindo a cada 20 s até alguém clicar em "Atendido".
 */
export function TableCallAlerts() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const known = useRef<Set<string> | null>(null);
  const callsRef = useRef<Call[]>([]);

  const apply = useCallback((list: unknown) => {
    if (!Array.isArray(list)) return;
    const next = list as Call[];
    const seen = known.current;
    // Toca na hora para cada chamado novo (no primeiro carregamento, toca se já houver pendentes).
    const fresh = seen ? next.filter((c) => !seen.has(c.id)) : next;
    known.current = new Set(next.map((c) => c.id));
    callsRef.current = next;
    setCalls(next);
    if (fresh.length && isOrderAlertEnabled()) playTableCallAlert(fresh[0].tableNumber, fresh[0].reason);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/table-calls", { cache: "no-store" }).catch(() => null);
    if (res?.ok) apply(((await res.json()) as { calls: Call[] }).calls);
  }, [apply]);

  useStaffSocket({ onTableCalls: apply, onConnect: load });

  useEffect(() => {
    void load();
    unlockOrderAlert();
    // Repete o aviso enquanto houver mesa esperando.
    const repeat = setInterval(() => {
      const first = callsRef.current[0];
      if (first && isOrderAlertEnabled()) playTableCallAlert(first.tableNumber, first.reason);
    }, REPEAT_MS);
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(repeat);
      clearInterval(clock);
    };
  }, [load]);

  async function attend(id: string) {
    setCalls((prev) => prev.filter((c) => c.id !== id));
    callsRef.current = callsRef.current.filter((c) => c.id !== id);
    await fetch(`/api/admin/table-calls/${id}/attend`, { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => {});
  }

  if (calls.length === 0) return null;
  return (
    <div className="fixed right-4 top-20 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 print:hidden" role="alert" aria-live="assertive">
      {calls.map((c) => {
        const min = Math.max(0, Math.floor((now - new Date(c.createdAt).getTime()) / 60_000));
        return (
          <div key={c.id} className="flex animate-slide-up items-center gap-3 rounded-2xl bg-mega-400 p-3 text-ink-900 shadow-lift ring-2 ring-ink-900">
            <span className="animate-wiggle text-3xl" aria-hidden>
              {c.reason === "CONTA" ? "💳" : "🙋"}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-display text-xl font-black">Mesa {c.tableNumber}</p>
              <p className="text-sm font-semibold">{c.reason === "CONTA" ? "pediu a conta" : "chamou o atendente"}</p>
              <p className="text-xs opacity-75">{min === 0 ? "agora" : `há ${min} min`}</p>
            </div>
            <button onClick={() => attend(c.id)} className="rounded-xl bg-ink-900 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-black">
              ✓ Atendido
            </button>
          </div>
        );
      })}
    </div>
  );
}
