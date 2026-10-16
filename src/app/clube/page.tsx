import { listZones } from "@/lib/delivery-zones";
import { ClubApp } from "@/components/client/ClubApp";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Clube Mega Jurema",
  description: "Quanto mais você volta, mais vantagens conquista. Pontos, níveis, missões e recompensas na Mega Esfiha Jurema.",
};

export default async function ClubPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const refCode = ref && /^[A-Za-z0-9]{4,16}$/.test(ref) ? ref.toUpperCase() : null;
  const zones = await listZones(true);
  return <ClubApp zones={zones.map((z) => ({ id: z.id, name: z.name, fee: z.fee }))} refCode={refCode} />;
}
