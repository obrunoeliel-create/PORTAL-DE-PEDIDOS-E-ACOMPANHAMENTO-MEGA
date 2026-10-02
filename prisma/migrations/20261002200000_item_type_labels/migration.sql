-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "itemLabel" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "categoryLabel" TEXT;


-- Tipo de cada categoria (pelo slug do cardápio)
UPDATE "Category" SET "itemLabel" = CASE "slug"
  WHEN 'esfihas-tradicionais' THEN 'Esfiha'
  WHEN 'esfihas-especiais' THEN 'Esfiha 2 sabores'
  WHEN 'esfihas-doces' THEN 'Esfiha doce'
  WHEN 'pizzas' THEN 'Pizza'
  WHEN 'pizzas-doces' THEN 'Pizza doce'
  WHEN 'pasteis' THEN 'Pastel'
  WHEN 'lanches' THEN 'Lanche'
  WHEN 'beirute' THEN 'Beirute'
  WHEN 'porcoes' THEN 'Porção'
  WHEN 'fogazzas' THEN 'Fogazza'
  ELSE "itemLabel"
END;

-- Preenche os itens de pedidos já existentes
UPDATE "OrderItem" oi
SET "categoryLabel" = c."itemLabel"
FROM "Product" p
JOIN "Category" c ON c."id" = p."categoryId"
WHERE oi."productId" = p."id" AND oi."categoryLabel" IS NULL;
