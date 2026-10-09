"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSnapshot, flushQueue } from "@/lib/contingency-store";

const SYNC_MS = 30_000;
const WARM_MS = 10 * 60_000;

/**
 * Fica ligado em todas as telas do portal: a cada 30 segundos guarda no navegador a cópia das mesas e
 * pedidos (modo contingência), mantém a tela de contingência salva para abrir sem internet e, quando a
 * internet volta, envia as mesas fechadas durante a queda. Sem internet, mostra o aviso com o atalho.
 */
export function ContingencySync() {
  const [offline, setOffline] = useState(false);
  const fails = useRef(0);
  const warmedAt = useRef(0);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    // Guarda a tela de contingência e os arquivos que ela usa, para abrir mesmo com o computador reiniciado.
    async function warm() {
      if (Date.now() - warmedAt.current < WARM_MS) return;
      try {
        const res = await fetch("/admin/contingencia", { cache: "no-store" });
        if (!res.ok || res.redirected) return;
        const html = await res.text();
        const assets = new Set(html.match(/\/_next\/static\/[A-Za-z0-9_\-./()%\[\]@]+\.(?:js|css|woff2)/g) ?? []);
        await Promise.all([...assets].map((a) => fetch(a).catch(() => null)));
        warmedAt.current = Date.now();
      } catch {
        // sem internet agora: tenta na próxima
      }
    }

    async function sync() {
      const r = await fetchSnapshot();
      if (r.kind === "ok") {
        fails.current = 0;
        setOffline(false);
        await flushQueue(r.snapshot);
        void warm();
      } else if (r.kind === "offline") {
        fails.current++;
        // Uma falha isolada pode ser só lentidão: avisa a partir da segunda (ou na hora, se o navegador já sabe).
        if (fails.current >= 2 || navigator.onLine === false) setOffline(true);
      }
    }

    void sync();
    const id = setInterval(sync, SYNC_MS);
    const on = () => void sync();
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-brand-700 px-4 py-3 text-white shadow-lift print:hidden" role="alert">
      <span className="font-semibold">⚠️ Sem internet. As mesas e pedidos continuam disponíveis no Modo Contingência.</span>
      {/* Link comum (recarrega a página): sem internet o navegador abre a tela guardada. */}
      <a href="/admin/contingencia" className="rounded-xl bg-mega-400 px-4 py-2 font-display font-bold text-ink-900">
        🛟 Abrir Modo Contingência
      </a>
    </div>
  );
}
