// Fotos do cardápio (arquivos em public/menu/). Imagens ILUSTRATIVAS geradas por inteligência artificial:
// o site sempre mostra esse aviso junto das fotos. Chave = "<slug da categoria>/<nome do produto>".
// Para incluir uma foto nova: coloque o arquivo em public/menu/ e acrescente a linha aqui.

const MENU_IMAGES: Record<string, string> = {
  // Esfihas tradicionais (lote 1, direção de arte aprovada em 15/10/2026)
  "esfihas-tradicionais/Carne": "esfiha-carne.jpg",
  "esfihas-tradicionais/Queijo": "esfiha-queijo.jpg",
  "esfihas-tradicionais/Calabresa": "esfiha-calabresa.jpg",
  "esfihas-tradicionais/Frango": "esfiha-frango.jpg",
  "esfihas-tradicionais/Cheddar": "esfiha-cheddar.jpg",
  "esfihas-tradicionais/Requeijão": "esfiha-requeijao.jpg",
  "esfihas-tradicionais/Bauru": "esfiha-bauru.jpg",
  "esfihas-tradicionais/Atum": "esfiha-atum.jpg",
};

/** Endereço da foto do produto, ou null se ainda não houver foto aprovada. */
export function productImage(categorySlug: string, productName: string): string | null {
  const file = MENU_IMAGES[`${categorySlug}/${productName}`];
  return file ? `/menu/${file}` : null;
}

/** Aviso exibido onde houver foto: as imagens são geradas por IA e meramente ilustrativas. */
export const AI_IMAGE_NOTICE = "Imagens geradas por inteligência artificial, meramente ilustrativas. O produto servido pode ter aparência diferente.";
