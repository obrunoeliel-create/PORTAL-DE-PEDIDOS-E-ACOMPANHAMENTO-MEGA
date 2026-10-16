import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { listZones } from "@/lib/delivery-zones";
import { productImage } from "@/lib/menu-images";
import { StaffOrderApp } from "@/components/admin/StaffOrderApp";
import type { MenuCategory } from "@/types/menu";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo pedido" };

/** Pedido lançado pela loja: balcão, delivery ou itens a mais numa mesa (?mesa=12 já abre a mesa). */
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ mesa?: string }> }) {
  await requirePageSession();
  const { mesa } = await searchParams;

  const [categories, zones, tables] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        allowsHalf: true,
        itemLabel: true,
        products: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            categoryId: true,
            variants: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, price: true } },
          },
        },
        addons: { where: { active: true }, select: { id: true, name: true, price: true } },
      },
    }),
    listZones(true),
    prisma.diningTable.findMany({ where: { active: true }, select: { number: true }, orderBy: { number: "asc" } }),
  ]);

  const menu: MenuCategory[] = categories
    .filter((c) => c.products.length > 0)
    .map((c) => ({ ...c, products: c.products.map((p) => ({ ...p, image: productImage(c.slug, p.name) })) }));
  const tableNumbers = tables.map((t) => t.number);
  const n = mesa && /^\d{1,3}$/.test(mesa) ? Number(mesa) : null;

  return (
    <StaffOrderApp
      categories={menu}
      zones={zones.map(({ id, name, fee }) => ({ id, name, fee }))}
      tables={tableNumbers}
      initialTable={n !== null && tableNumbers.includes(n) ? n : null}
      startOnTable={mesa !== undefined}
    />
  );
}
