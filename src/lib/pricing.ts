import "server-only";
import { prisma } from "./prisma";
import { calcUnitPrice } from "./pricing-core";
import type { OrderItemInput } from "./validators";

export class PricingError extends Error {}

export type PricedLine = {
  productId: string;
  categoryLabel: string | null;
  productName: string;
  halfProductId: string | null;
  halfProductName: string | null;
  variantName: string | null;
  addons: { name: string; price: number }[];
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  notes: string | null;
};

/**
 * Recalcula TODOS os preços a partir do banco. Preços enviados pelo cliente são ignorados,
 * impedindo manipulação de valores (OWASP A04 - Insecure Design).
 */
export async function priceOrderItems(items: OrderItemInput[]): Promise<{ lines: PricedLine[]; subtotal: number }> {
  const productIds = new Set<string>();
  const addonIds = new Set<string>();
  for (const item of items) {
    productIds.add(item.productId);
    if (item.halfProductId) productIds.add(item.halfProductId);
    item.addonIds.forEach((a) => addonIds.add(a));
  }

  // Consultas parametrizadas via Prisma — nenhuma concatenação de SQL.
  const [products, addons] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: [...productIds] }, active: true, category: { active: true } },
      include: { variants: true, category: { select: { allowsHalf: true, itemLabel: true } } },
    }),
    prisma.addon.findMany({ where: { id: { in: [...addonIds] }, active: true } }),
  ]);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const addonMap = new Map(addons.map((a) => [a.id, a]));

  const lines: PricedLine[] = items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new PricingError("Um dos itens não está mais disponível.");

    let variantName: string | null = null;
    if (product.variants.length > 0) {
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) throw new PricingError(`Escolha um tamanho para ${product.name}.`);
      variantName = variant.name;
    } else if (item.variantId) {
      throw new PricingError(`${product.name} não possui tamanhos.`);
    }

    let half: (typeof products)[number] | null = null;
    if (item.halfProductId) {
      half = productMap.get(item.halfProductId) ?? null;
      if (!half) throw new PricingError("O segundo sabor não está mais disponível.");
      if (!product.category.allowsHalf || half.categoryId !== product.categoryId || half.id === product.id) {
        throw new PricingError("Combinação de sabores inválida.");
      }
    }

    const uniqueAddonIds = [...new Set(item.addonIds)];
    const itemAddons = uniqueAddonIds.map((aid) => {
      const addon = addonMap.get(aid);
      if (!addon || addon.categoryId !== product.categoryId) {
        throw new PricingError(`Acréscimo inválido para ${product.name}.`);
      }
      return { name: addon.name, price: addon.price };
    });

    const unitPrice = calcUnitPrice({ product, variantName, halfProduct: half, addons: itemAddons });
    if (unitPrice === null) throw new PricingError(`Tamanho indisponível para ${product.name}.`);

    return {
      productId: product.id,
      categoryLabel: product.category.itemLabel ?? null,
      productName: product.name,
      halfProductId: half?.id ?? null,
      halfProductName: half?.name ?? null,
      variantName,
      addons: itemAddons,
      unitPrice,
      quantity: item.quantity,
      totalPrice: unitPrice * item.quantity,
      notes: item.notes ?? null,
    };
  });

  return { lines, subtotal: lines.reduce((s, l) => s + l.totalPrice, 0) };
}
