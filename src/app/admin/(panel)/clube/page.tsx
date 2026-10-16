import { requirePageSession } from "@/lib/auth";
import { ClubAdmin } from "@/components/admin/ClubAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clube Mega Jurema" };

// Operador vê só "Validar resgate" (caixa); o gerente vê o clube inteiro.
export default async function ClubAdminPage() {
  const user = await requirePageSession();
  return <ClubAdmin isManager={user.role === "MANAGER"} />;
}
