import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { getBoardOrders } from "@/lib/orders";
import { DispatchBoard } from "@/components/admin/DispatchBoard";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  const user = await requirePageSession();
  const [orders, drivers] = await Promise.all([
    getBoardOrders(),
    prisma.driver.findMany({ select: { id: true, name: true, phone: true, active: true }, orderBy: { name: "asc" } }),
  ]);
  return <DispatchBoard initialOrders={orders} initialDrivers={drivers} canManageDrivers={user.role === "MANAGER"} />;
}
