import { prisma } from "@/lib/prisma";
import { getStoreSettings } from "@/lib/settings";
import { MenuApp } from "@/components/client/MenuApp";
import { verifyTableToken } from "@/lib/tables";
import { listZones } from "@/lib/delivery-zones";
import { getCurrentCustomer } from "@/lib/customer-session";
import type { MenuCategory, PublicSettings } from "@/types/menu";

export const dynamic = "force-dynamic";

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ mesa?: string; t?: string }> }) {
  const { mesa, t } = await searchParams;
  // QR Code da mesa aponta para /?mesa=12&t=<token>. Sem token válido, não há pedido na mesa.
  const tableNumber = mesa && /^\d{1,3}$/.test(mesa) && Number(mesa) > 0 ? Number(mesa) : null;
  const tableValid = tableNumber !== null && typeof t === "string" && (await verifyTableToken(tableNumber, t));
  const initialTable = tableValid && tableNumber !== null ? { number: tableNumber, token: t as string } : null;
  const tableQrInvalid = mesa !== undefined && !tableValid;

  const [categories, settings, zones, customer] = await Promise.all([
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
    getStoreSettings(),
    listZones(true),
    // Mesa é atendimento na loja: não usa cadastro.
    initialTable ? null : getCurrentCustomer(),
  ]);

  const menu: MenuCategory[] = categories.filter((c) => c.products.length > 0);
  // Apenas dados públicos vão para o cliente (sem a chave PIX, por exemplo).
  const publicSettings: PublicSettings = {
    storeName: settings.storeName,
    isOpen: settings.isOpen,
    whatsappNumber: settings.whatsappNumber,
    pixEnabled: !!settings.pixKey,
  };

  return <MenuApp categories={menu} settings={publicSettings} initialTable={initialTable} tableQrInvalid={tableQrInvalid} zones={zones.map(({ id, name, fee }) => ({ id, name, fee }))} initialCustomer={customer} />;
}
