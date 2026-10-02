// Regras de preço puras, compartilhadas entre o cliente (exibição) e o servidor (cálculo oficial).

type Priced = { price: number; variants: { name: string; price: number }[] };

function basePrice(product: Priced, variantName?: string | null): number | null {
  if (product.variants.length === 0) return product.price;
  if (!variantName) return null;
  return product.variants.find((v) => v.name === variantName)?.price ?? null;
}

/**
 * Preço unitário de um item.
 * Regra 1/2 a 1/2: cobra pelo sabor de MAIOR valor no tamanho escolhido.
 * Retorna null se a combinação for inválida (tamanho inexistente em algum dos sabores).
 */
export function calcUnitPrice(input: {
  product: Priced;
  variantName?: string | null;
  halfProduct?: Priced | null;
  addons: { price: number }[];
}): number | null {
  const first = basePrice(input.product, input.variantName);
  if (first === null) return null;

  let base = first;
  if (input.halfProduct) {
    const second = basePrice(input.halfProduct, input.variantName);
    if (second === null) return null;
    base = Math.max(first, second);
  }

  return base + input.addons.reduce((sum, a) => sum + a.price, 0);
}
