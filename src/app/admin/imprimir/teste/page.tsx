import { requirePageSession } from "@/lib/auth";
import { getStoreSettings } from "@/lib/settings";
import { ReceiptShell, Row, Sep, paperWidth, printDate } from "@/components/print/Receipt";
import { PrintControls } from "@/components/print/PrintControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teste de impressão" };

/** Página de teste: confere largura do papel, corte e nitidez sem precisar de um pedido. */
export default async function PrintTestPage({ searchParams }: { searchParams: Promise<{ w?: string; auto?: string }> }) {
  await requirePageSession();
  const sp = await searchParams;
  const width = paperWidth(sp.w);
  const settings = await getStoreSettings();
  return (
    <ReceiptShell width={width}>
      <PrintControls auto={sp.auto === "1"} />
      <div className="r-center">
        <div className="r-store">{settings.storeName}</div>
        <Sep />
        <div className="r-big">TESTE DE IMPRESSÃO</div>
        <div className="r-tag">{width === "a4" ? "FOLHA A4" : `BOBINA ${width} MM`}</div>
      </div>
      <Sep />
      <Row left="Esquerda" right="Direita" />
      <Row left="1x Esfiha de Carne" right="R$ 3,50" />
      <Row className="r-total" left="TOTAL" right="R$ 3,50" />
      <Sep />
      <div className="r-center r-small">Se as duas pontas da linha acima apareceram inteiras, o papel está certo.</div>
      <div className="r-center r-small">{printDate.format(new Date())}</div>
    </ReceiptShell>
  );
}
