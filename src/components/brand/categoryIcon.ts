// Ícone por categoria (slug do seed). Categorias novas caem no ícone padrão.
const ICONS: Record<string, string> = {
  "esfihas-tradicionais": "🥟",
  "esfihas-especiais": "⭐",
  "esfihas-doces": "🍫",
  pizzas: "🍕",
  "pizzas-doces": "🍓",
  pasteis: "🥠",
  lanches: "🍔",
  beirute: "🥙",
  porcoes: "🍟",
  fogazzas: "🔥",
  sucos: "🧃",
  refrigerantes: "🥤",
  "bebidas-alcoolicas": "🍹",
};

export function categoryIcon(slug: string): string {
  return ICONS[slug] ?? "🍽️";
}
