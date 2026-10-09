import { requirePageSession } from "@/lib/auth";
import { ContingencyApp } from "@/components/admin/ContingencyApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modo Contingência" };

// A página em si não carrega dado nenhum do servidor: tudo vem da cópia guardada no navegador.
// Por isso ela continua abrindo sem internet (o navegador guarda esta tela, ver public/sw.js).
export default async function ContingencyPage() {
  await requirePageSession();
  return <ContingencyApp />;
}
