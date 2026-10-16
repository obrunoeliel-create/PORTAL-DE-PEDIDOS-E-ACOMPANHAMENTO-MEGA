import { requirePageSession } from "@/lib/auth";
import { WhatsAppAdmin } from "@/components/admin/WhatsAppAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp" };

export default async function WhatsAppPage() {
  await requirePageSession(["MANAGER"]);
  return <WhatsAppAdmin />;
}
