// Papel do tamanho do cupom: o Chrome não aceita "@page { size: 80mm auto }" e acaba usando a altura
// padrão do driver da impressora (quase 30 cm de papel, a maior parte em branco). Aqui o cupom é medido
// e a página recebe a altura exata do conteúdo, para o papel cortar logo depois da última linha.

const STYLE_ID = "of-page-fit";
const PX_TO_MM = 25.4 / 96;

/** Largura do papel em mm (null = folha A4, que não precisa de ajuste). */
export function paperWidthMm(w: string | null | undefined): number | null {
  if (w === "a4") return null;
  return w === "58" ? 58 : 80;
}

/**
 * Ajusta a página de impressão à altura do cupom `receipt` (elemento .receipt).
 * Se o cupom estiver escondido na tela (ex: modo contingência), mede uma cópia fora da tela.
 */
export function fitPageToReceipt(receipt: HTMLElement | null, widthMm: number | null) {
  document.getElementById(STYLE_ID)?.remove();
  if (!receipt || widthMm === null) return;

  let heightPx = receipt.getBoundingClientRect().height;
  if (heightPx < 1) {
    const clone = receipt.cloneNode(true) as HTMLElement;
    clone.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;display:block;width:${widthMm - (widthMm === 58 ? 10 : 8)}mm`;
    document.body.appendChild(clone);
    heightPx = clone.getBoundingClientRect().height;
    clone.remove();
  }
  // +3 mm de folga para a guilhotina não cortar a última linha.
  const heightMm = Math.max(30, Math.ceil(heightPx * PX_TO_MM) + 3);
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0 } @media print { html, body { height: auto !important; min-height: 0 !important; } }`;
  // No fim do body: vem depois do estilo do cupom e prevalece sobre ele.
  document.body.appendChild(style);
}
