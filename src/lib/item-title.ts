/**
 * Nome completo do item com o tipo do produto, usado em todas as telas e mensagens:
 *   "Esfiha Calabresa", "Pizza ½ Baiana + ½ Milho", "Pastel Carne", "Coca-Cola 600ml".
 */
export function itemTitle(item: {
  categoryLabel?: string | null;
  productName: string;
  halfProductName?: string | null;
}): string {
  const name = item.halfProductName ? `½ ${item.productName} + ½ ${item.halfProductName}` : item.productName;
  return item.categoryLabel ? `${item.categoryLabel} ${name}` : name;
}
