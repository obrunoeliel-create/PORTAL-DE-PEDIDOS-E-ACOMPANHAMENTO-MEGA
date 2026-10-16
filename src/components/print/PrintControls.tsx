"use client";

import { useEffect } from "react";
import { fitPageToReceipt, paperWidthMm } from "@/lib/print-fit";

/** Deixa o papel do tamanho exato do cupom (lê a largura escolhida em ?w= na própria página). */
function fitPage() {
  const w = new URLSearchParams(window.location.search).get("w");
  fitPageToReceipt(document.querySelector<HTMLElement>(".receipt"), paperWidthMm(w));
}

/**
 * Na página de impressão: com ?auto=1 abre a impressão sozinha e avisa a tela que pediu quando terminar.
 * Aberta direto (sem auto), mostra os botões Imprimir / Fechar (somem no papel).
 */
export function PrintControls({ auto }: { auto: boolean }) {
  useEffect(() => {
    // Também vale para Ctrl+P e para o botão Imprimir.
    const before = () => fitPage();
    window.addEventListener("beforeprint", before);
    return () => window.removeEventListener("beforeprint", before);
  }, []);

  useEffect(() => {
    if (!auto) return;
    const notify = () => window.parent?.postMessage("of:printed", window.location.origin);
    window.addEventListener("afterprint", notify);
    let cancelled = false;
    // Espera as fontes carregarem para o cupom não sair com a letra trocada.
    document.fonts.ready.then(() => {
      if (cancelled) return;
      fitPage();
      window.print();
    });
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", notify);
    };
  }, [auto]);

  if (auto) return null;
  return (
    <div className="no-print toolbar">
      <button
        onClick={() => {
          fitPage();
          window.print();
        }}
      >
        🖨️ Imprimir
      </button>
      <button onClick={() => window.close()}>Fechar</button>
    </div>
  );
}
