import { requirePageSession } from "@/lib/auth";
import { listOpenSessions } from "@/lib/table-sessions";
import { toBoardOrder } from "@/lib/orders";
import { campaignStateForStaff } from "@/lib/mesa-premiada";
import { TableTabs } from "@/components/admin/TableTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comandas" };

export default async function TableTabsPage() {
  await requirePageSession();
  const [sessions, campaign] = await Promise.all([listOpenSessions(), campaignStateForStaff()]);
  return (
    <TableTabs
      initialCampaign={campaign}
      initialSessions={sessions.map((s) => ({
        id: s.id,
        tableNumber: s.tableNumber,
        openedAt: s.openedAt.toISOString(),
        orders: s.orders.map(toBoardOrder),
      }))}
    />
  );
}
