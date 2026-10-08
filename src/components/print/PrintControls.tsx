"use client";

import { useEffect } from "react";

/**
 * Na página de impressão: com ?auto=1 abre a impressão sozinha e avisa a tela que pediu quando terminar.
 * Aberta direto (sem auto), mostra os botões Imprimir / Fechar (somem no papel).
 */
export function PrintControls({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const notify = () => window.parent?.postMessage("of:printed", window.location.origin);
    window.addEventListener("afterprint", notify);
    let cancelled = false;
    // Espera as fontes carregarem para o cupom não sair com a letra trocada.
    document.fonts.ready.then(() => {
      if (cancelled) return;
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
      <button onClick={() => window.print()}>🖨️ Imprimir</button>
      <button onClick={() => window.close()}>Fechar</button>
    </div>
  );
}
