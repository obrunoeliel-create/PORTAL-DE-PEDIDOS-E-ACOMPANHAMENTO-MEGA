import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { getStoreSettings } from "@/lib/settings";
import { cuidParam } from "@/lib/validators";
import { formatBRL } from "@/lib/money";
import { PAYMENT_LABEL } from "@/lib/labels";
import { Items, ReceiptShell, Row, Sep, paperWidth, printDate } from "@/components/print/Receipt";
import { PrintControls } from "@/components/print/PrintControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir conta da mesa" };

/**
 * Conta da mesa (comanda): todos os pedidos não cancelados. Antes do fechamento é a "conta parcial";
 * o desconto da Mesa Premiada só aparece depois que o caixa fechou a mesa (o sorteio é surpresa).
 */
export default async function PrintTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string; auto?: string }>;
}) {
  await requirePageSession();
  const id = cuidParam.safeParse((await params).id);
  if (!id.success) notFound();
  const sp = await searchParams;

  const [session, settings] = await Promise.all([
    prisma.tableSession.findUnique({
      where: { id: id.data },
      include: { orders: { where: { status: { not: "CANCELED" } }, include: { items: true }, orderBy: { createdAt: "asc" } } },
    }),
    getStoreSettings(),
  ]);
  if (!session) notFound();

  const sum = session.orders.reduce((a, o) => a + o.total, 0);
  const closed = !!session.closedAt;
  const discount = closed ? session.discount : 0;
  const toPay = closed ? (session.total ?? sum - discount) : sum;

  return (
    <ReceiptShell width={paperWidth(sp.w)}>
      <PrintControls auto={sp.auto === "1"} />
      <div className="r-center">
        <div className="r-store">{settings.storeName}</div>
        <div className="r-small">Aberta em {printDate.format(session.openedAt)}</div>
        <Sep />
        <div className="r-big">MESA {session.tableNumber}</div>
        <div className="r-tag">{closed ? "CONTA PAGA" : "CONTA"}</div>
      </div>
      <Sep />

      {session.orders.length === 0 && <div className="r-center">Nenhum pedido nesta mesa.</div>}
      {session.orders.map((o) => (
        <div key={o.id}>
          <Row left={<strong>Pedido #{o.number}</strong>} right={o.customerName} className="r-small" />
          <Items items={o.items} />
          <Sep />
        </div>
      ))}

      <Row left={`Total (${session.orders.length} ${session.orders.length === 1 ? "pedido" : "pedidos"})`} right={formatBRL(sum)} />
      {discount > 0 && <Row left="Desconto Mesa Premiada" right={`- ${formatBRL(discount)}`} />}
      <Row className="r-total" left={closed ? "TOTAL PAGO" : "TOTAL A PAGAR"} right={formatBRL(toPay)} />
      <Sep />
      {closed ? (
        <div>
          <strong>Pago em:</strong> {session.paidWith ? PAYMENT_LABEL[session.paidWith].replace(" (na entrega)", "") : "cortesia"}
          {session.closedAt && <div className="r-small">Fechada em {printDate.format(session.closedAt)}</div>}
        </div>
      ) : (
        <div className="r-center r-small">Pagamento no caixa. Obrigado pela preferência!</div>
      )}
      <Sep />
      <div className="r-center r-small">Impresso em {printDate.format(new Date())}</div>
    </ReceiptShell>
  );
}
