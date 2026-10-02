const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** "50", "50,5", "R$ 50,00" → centavos. Retorna null se inválido. */
export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
