import { prisma } from "@/lib/prisma";
import { getStoreSettings } from "@/lib/settings";
import { MenuApp } from "@/components/client/MenuApp";
import type { MenuCategory, PublicSettings } from "@/types/menu";

export const dynamic = "force-dynamic";

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ mesa?: string }> }) {
  const { mesa } = await searchParams;
  // QR Code da mesa aponta para /?mesa=12 — valida como inteiro 1..999.
  const tableNumber = mesa && /^\d{1,3}$/.test(mesa) && Number(mesa) > 0 ? Number(mesa) : null;

  const [categories, settings] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        allowsHalf: true,
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
    getStoreSettings(),
  ]);

  const menu: MenuCategory[] = categories.filter((c) => c.products.length > 0);
  // Apenas dados públicos vão para o cliente (sem a chave PIX, por exemplo).
  const publicSettings: PublicSettings = {
    storeName: settings.storeName,
    isOpen: settings.isOpen,
    whatsappNumber: settings.whatsappNumber,
    pixEnabled: !!settings.pixKey,
  };

  return <MenuApp categories={menu} settings={publicSettings} initialTable={tableNumber} />;
}
