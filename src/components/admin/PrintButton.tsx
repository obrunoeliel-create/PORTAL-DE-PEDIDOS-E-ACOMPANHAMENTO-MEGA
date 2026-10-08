"use client";

import { useEffect, useState } from "react";
import { type PaperWidth, getPaperWidth, getPrintOnAccept, printDocument, setPaperWidth, setPrintOnAccept } from "@/lib/print-client";

/** Botão "Imprimir" de um pedido ou da conta de uma mesa. */
export function PrintButton({ kind, id, label = "🖨️ Imprimir", className }: { kind: "pedido" | "mesa"; id: string; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => printDocument(`/admin/imprimir/${kind}/${id}`)}
      className={className ?? "rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"}
    >
      {label}
    </button>
  );
}

/** Ajustes de impressão deste aparelho: largura do papel e impressão automática ao aceitar. */
export function PrintSettings() {
  const [width, setWidth] = useState<PaperWidth>("80");
  const [onAccept, setOnAccept] = useState(false);
  useEffect(() => {
    setWidth(getPaperWidth());
    setOnAccept(getPrintOnAccept());
  }, []);

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-xl bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-card [&::-webkit-details-marker]:hidden">
        🖨️ Impressão{onAccept ? " · automática" : ""}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-2xl bg-white p-4 text-sm shadow-lift ring-1 ring-stone-900/5">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-brand-600"
            checked={onAccept}
            onChange={(e) => {
              setOnAccept(e.target.checked);
              setPrintOnAccept(e.target.checked);
            }}
          />
          <span>
            <strong>Imprimir ao aceitar o pedido</strong>
            <span className="block text-xs text-stone-500">Sai o cupom para a cozinha assim que clicar em &quot;Aceitar pedido&quot;.</span>
          </span>
        </label>
        <label className="block">
          <span className="font-semibold">Papel da impressora</span>
          <select
            className="input mt-1"
            value={width}
            onChange={(e) => {
              const w = e.target.value as PaperWidth;
              setWidth(w);
              setPaperWidth(w);
            }}
          >
            <option value="80">Bobina 80 mm (térmica)</option>
            <option value="58">Bobina 58 mm (térmica pequena)</option>
            <option value="a4">Folha A4 (impressora comum)</option>
          </select>
        </label>
        <button type="button" className="btn-ghost w-full" onClick={() => printDocument("/admin/imprimir/teste")}>
          Imprimir página de teste
        </button>
        <p className="text-xs text-stone-500">Vale só para este aparelho. Sai na impressora padrão do computador.</p>
      </div>
    </details>
  );
}
