import { requirePageSession } from "@/lib/auth";
import { listZones } from "@/lib/delivery-zones";
import { ZoneManager } from "@/components/admin/ZoneManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taxas de entrega" };

export default async function DeliveryZonesPage() {
  await requirePageSession(["MANAGER"]);
  return <ZoneManager initialZones={await listZones()} />;
}
