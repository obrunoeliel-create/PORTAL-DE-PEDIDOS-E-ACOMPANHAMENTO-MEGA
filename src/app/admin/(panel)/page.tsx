import { prisma } from "@/lib/prisma";
import { getBoardOrders } from "@/lib/orders";
import { getStoreSettings } from "@/lib/settings";
import { OrderBoard } from "@/components/admin/OrderBoard";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  // Autenticação já verificada no middleware e no layout.
  const [orders, settings, drivers] = await Promise.all([
    getBoardOrders(),
    getStoreSettings(),
    // Motoboys ativos: escolhidos no card ao liberar o delivery ("Saiu p/ entrega").
    prisma.driver.findMany({ where: { active: true }, select: { id: true, name: true, phone: true, active: true }, orderBy: { name: "asc" } }),
  ]);
  return <OrderBoard initialOrders={orders} storeName={settings.storeName} drivers={drivers} />;
}
