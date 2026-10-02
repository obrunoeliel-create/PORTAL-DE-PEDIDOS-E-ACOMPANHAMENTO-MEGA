import { getBoardOrders } from "@/lib/orders";
import { getStoreSettings } from "@/lib/settings";
import { OrderBoard } from "@/components/admin/OrderBoard";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  // Autenticação já verificada no middleware e no layout.
  const [orders, settings] = await Promise.all([getBoardOrders(), getStoreSettings()]);
  return <OrderBoard initialOrders={orders} storeName={settings.storeName} />;
}
