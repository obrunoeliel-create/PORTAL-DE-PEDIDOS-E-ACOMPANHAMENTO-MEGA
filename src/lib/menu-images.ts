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

  // Pastéis
  "pasteis/Carne": "pastel-carne.jpg",
  "pasteis/Queijo": "pastel-queijo.jpg",
  "pasteis/Calabresa": "pastel-calabresa.jpg",
  "pasteis/Requeijão": "pastel-requeijao.jpg",
  "pasteis/Frango": "pastel-frango.jpg",
  "pasteis/Frango com Requeijão": "pastel-frango-requeijao.jpg",
  "pasteis/Pizza": "pastel-pizza.jpg",
  "pasteis/Bauru": "pastel-bauru.jpg",
  "pasteis/Palmito com Queijo": "pastel-palmito-queijo.jpg",
  "pasteis/Bacon com Queijo": "pastel-bacon-queijo.jpg",
  "pasteis/Atum": "pastel-atum.jpg",
  "pasteis/Especial": "pastel-especial.jpg",
  "pasteis/Carne Seca": "pastel-carne-seca.jpg",
  "pasteis/4 Queijos": "pastel-4-queijos.jpg",

  // Pizzas
  "pizzas/Mussarela": "pizza-mussarela.jpg",
  "pizzas/Calabresa": "pizza-calabresa.jpg",
  "pizzas/Bauru": "pizza-bauru.jpg",
  "pizzas/Baiana": "pizza-baiana.jpg",
  "pizzas/Toscana": "pizza-toscana.jpg",
  "pizzas/Frango Requeijão": "pizza-frango-requeijao.jpg",
  "pizzas/Milho": "pizza-milho.jpg",
  "pizzas/Atum": "pizza-atum.jpg",
  "pizzas/Atum Mussarela": "pizza-atum-mussarela.jpg",
  "pizzas/Palmito": "pizza-palmito.jpg",
  "pizzas/Portuguesa": "pizza-portuguesa.jpg",
  "pizzas/Á Moda": "pizza-a-moda.jpg",
  "pizzas/Big Mega": "pizza-big-mega.jpg",
  "pizzas/Caipira": "pizza-caipira.jpg",
  "pizzas/Canadense": "pizza-canadense.jpg",
  "pizzas/Jardineira": "pizza-jardineira.jpg",
  "pizzas/Paulista": "pizza-paulista.jpg",
  "pizzas/Sertaneja": "pizza-sertaneja.jpg",
  "pizzas/Á Moda do Chefe": "pizza-moda-chefe.jpg",
  "pizzas/Dois Queijos": "pizza-dois-queijos.jpg",
  "pizzas/Três Queijos": "pizza-tres-queijos.jpg",
  "pizzas/Quatro Queijos": "pizza-quatro-queijos.jpg",
  "pizzas/Catolés": "pizza-catoles.jpg",
  "pizzas/Jurema": "pizza-jurema.jpg",
  "pizzas/Carne Seca": "pizza-carne-seca.jpg",
  "pizzas/Marguerita": "pizza-marguerita.jpg",

  // Lanches
  "lanches/X-Burger": "lanche-x-burger.jpg",
  "lanches/X-Salada": "lanche-x-salada.jpg",
  "lanches/X-Bacon": "lanche-x-bacon.jpg",
  "lanches/X-Egg": "lanche-x-egg.jpg",
  "lanches/Americano": "lanche-americano.jpg",
  "lanches/Misto Quente": "lanche-misto-quente.jpg",
  "lanches/Bauru": "lanche-bauru.jpg",
  "lanches/X-Bacon Salada": "lanche-x-bacon-salada.jpg",
  "lanches/X-Egg Salada": "lanche-x-egg-salada.jpg",
  "lanches/X-Tudo": "lanche-x-tudo.jpg",
  "lanches/X-Tudo Duplo": "lanche-x-tudo-duplo.jpg",

  // Refrigerantes e águas: embalagens genéricas, sem marca (as marcas reais não podem ser imitadas por IA)
  "refrigerantes/Coca-Cola 2L": "refri-2l.jpg",
  "refrigerantes/Refrigerante 2L (Sabores)": "refri-2l.jpg",
  "refrigerantes/Coca-Cola 600ml": "refri-600ml.jpg",
  "refrigerantes/Refrigerante 1 Litro": "refri-1l.jpg",
  "refrigerantes/H2O": "refri-h2o.jpg",
  "refrigerantes/Refrigerante 200ml": "refri-200ml.jpg",
  "refrigerantes/Refrigerante Lata": "refri-lata.jpg",
  "refrigerantes/Del Valle Lata": "refri-suco-lata.jpg",
  "refrigerantes/Dolly": "refri-guarana-2l.jpg",
  "refrigerantes/Convenção": "refri-guarana-2l.jpg",
  "refrigerantes/Schweppes": "refri-citrus-lata.jpg",
  "refrigerantes/Água Garrafa 500ml": "agua.jpg",
  "refrigerantes/Água com Gás 500ml": "agua-gas.jpg",

  // Esfihas especiais
  "esfihas-especiais/Carne com Queijo": "esp-carne-queijo.jpg",
  "esfihas-especiais/Carne com Cheddar": "esp-carne-cheddar.jpg",
  "esfihas-especiais/Carne com Requeijão": "esp-carne-requeijao.jpg",
  "esfihas-especiais/Calabresa com Queijo": "esp-calabresa-queijo.jpg",
  "esfihas-especiais/Calabresa com Cheddar": "esp-calabresa-cheddar.jpg",
  "esfihas-especiais/Calabresa com Requeijão": "esp-calabresa-requeijao.jpg",
  "esfihas-especiais/Caipira": "esp-caipira.jpg",
  "esfihas-especiais/Frango com Queijo": "esp-frango-queijo.jpg",
  "esfihas-especiais/Frango com Requeijão": "esp-frango-requeijao.jpg",
  "esfihas-especiais/Frango com Cheddar": "esp-frango-cheddar.jpg",
  "esfihas-especiais/Palmito com Requeijão": "esp-palmito-requeijao.jpg",
  "esfihas-especiais/Palmito com Queijo": "esp-palmito-queijo.jpg",
  "esfihas-especiais/Bacon com Requeijão": "esp-bacon-requeijao.jpg",
  "esfihas-especiais/Palmito com Cheddar": "esp-palmito-cheddar.jpg",
  "esfihas-especiais/Bacon com Cheddar": "esp-bacon-cheddar.jpg",
  "esfihas-especiais/Bacon com Queijo": "esp-bacon-queijo.jpg",
  "esfihas-especiais/Milho com Cheddar": "esp-milho-cheddar.jpg",
  "esfihas-especiais/Milho com Queijo": "esp-milho-queijo.jpg",
  "esfihas-especiais/Pizza": "esp-pizza.jpg",
  "esfihas-especiais/2 Queijos": "esp-2-queijos.jpg",
  "esfihas-especiais/3 Queijos": "esp-3-queijos.jpg",
  "esfihas-especiais/Carne Seca com Queijo": "esp-carne-seca-queijo.jpg",
  "esfihas-especiais/4 Queijos": "esp-4-queijos.jpg",
  "esfihas-especiais/Atum com Queijo": "esp-atum-queijo.jpg",
  "esfihas-especiais/Atum com Requeijão": "esp-atum-requeijao.jpg",

  // Esfihas doces
  "esfihas-doces/Chocolate": "doce-chocolate.jpg",
  "esfihas-doces/Chocolate Branco": "doce-chocolate-branco.jpg",
  "esfihas-doces/Doce de Leite": "doce-doce-de-leite.jpg",
  "esfihas-doces/Brigadeiro": "doce-brigadeiro.jpg",
  "esfihas-doces/Prestígio": "doce-prestigio.jpg",
  "esfihas-doces/Confetes": "doce-confetes.jpg",
  "esfihas-doces/Banana Canela Chocolate": "doce-banana-canela.jpg",
  "esfihas-doces/Banana com Chocolate": "doce-banana-chocolate.jpg",
  "esfihas-doces/Romeu e Julieta": "doce-romeu-julieta.jpg",
  "esfihas-doces/Sensação": "doce-sensacao.jpg",

  // Pizzas doces
  "pizzas-doces/Chocolate": "pizzadoce-chocolate.jpg",
  "pizzas-doces/Sensação": "pizzadoce-sensacao.jpg",
  "pizzas-doces/Confetes": "pizzadoce-confetes.jpg",
  "pizzas-doces/Brigadeiro": "pizzadoce-brigadeiro.jpg",
  "pizzas-doces/Banana": "pizzadoce-banana.jpg",
  "pizzas-doces/Prestígio": "pizzadoce-prestigio.jpg",
  "pizzas-doces/Romeu e Julieta": "pizzadoce-romeu-julieta.jpg",
  "pizzas-doces/Banana Nevada": "pizzadoce-banana-nevada.jpg",

  // Beirute
  "beirute/Á Moda": "beirute-a-moda.jpg",
  "beirute/Frango com Requeijão": "beirute-frango-requeijao.jpg",
  "beirute/Frango": "beirute-frango.jpg",
  "beirute/Calabresa com Requeijão": "beirute-calabresa-requeijao.jpg",
  "beirute/Calabresa": "beirute-calabresa.jpg",
  "beirute/Atum": "beirute-atum.jpg",
  "beirute/Atum Requeijão": "beirute-atum-requeijao.jpg",
  "beirute/Carne Seca": "beirute-carne-seca.jpg",

  // Porções
  "porcoes/Fritas": "porcao-fritas.jpg",
  "porcoes/Calabresa": "porcao-calabresa.jpg",
  "porcoes/Azeitona": "porcao-azeitona.jpg",
  "porcoes/Queijo": "porcao-queijo.jpg",
  "porcoes/Fritas com Acompanhamento": "porcao-fritas-acompanhamento.jpg",

  // Sucos
  "sucos/Suco com Água": "suco-agua.jpg",
  "sucos/Suco com Leite": "suco-leite.jpg",
  "sucos/Laranja Natural": "suco-laranja.jpg",
  "sucos/Polpa com Laranja": "suco-polpa-laranja.jpg",
};

/** Endereço da foto do produto, ou null se ainda não houver foto aprovada. */
export function productImage(categorySlug: string, productName: string): string | null {
  // normalize(): nomes com acento podem vir do banco em outra forma Unicode.
  const file = MENU_IMAGES[`${categorySlug}/${productName.trim()}`.normalize("NFC")];
  return file ? `/menu/${file}` : null;
}

/** Aviso exibido onde houver foto: as imagens são geradas por IA e meramente ilustrativas. */
export const AI_IMAGE_NOTICE = "Imagens geradas por inteligência artificial, meramente ilustrativas. O produto servido pode ter aparência diferente.";
