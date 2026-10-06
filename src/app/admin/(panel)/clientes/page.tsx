import { requirePageSession } from "@/lib/auth";
import { CustomerAdmin } from "@/components/admin/CustomerAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes" };

export default async function CustomersPage() {
  await requirePageSession();
  return <CustomerAdmin />;
}
