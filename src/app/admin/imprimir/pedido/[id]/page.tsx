import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { getStoreSettings } from "@/lib/settings";
import { cuidParam } from "@/lib/validators";
import { formatBRL } from "@/lib/money";
import { PAYMENT_LABEL, STATUS_LABEL } from "@/lib/labels";
import { Items, ReceiptShell, Row, Sep, paperWidth, printDate } from "@/components/print/Receipt";
import { PrintControls } from "@/components/print/PrintControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir pedido" };

const TYPE_TITLE = { DELIVERY: "DELIVERY", PICKUP: "RETIRADA NO BALCÃO", TABLE: "MESA" } as const;

export default async function PrintOrderPage({
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

  const [order, settings] = await Promise.all([
    prisma.order.findUnique({ where: { id: id.data }, include: { items: true, driver: { select: { name: true } } } }),
    getStoreSettings(),
  ]);
  if (!order) notFound();

  const isDelivery = order.type === "DELIVERY";
  return (
    <ReceiptShell width={paperWidth(sp.w)}>
      <PrintControls auto={sp.auto === "1"} />
      <div className="r-center">
        <div className="r-store">{settings.storeName}</div>
        <div className="r-small">{printDate.format(order.createdAt)}</div>
        <Sep />
        <div className="r-big">PEDIDO #{order.number}</div>
        <div className="r-tag">{order.type === "TABLE" && order.tableNumber ? `MESA ${order.tableNumber}` : TYPE_TITLE[order.type]}</div>
        {order.status === "CANCELED" && <div className="r-tag">*** CANCELADO ***</div>}
      </div>
      <Sep />

      <div>
        <strong>Cliente:</strong> {order.customerName}
      </div>
      {order.customerPhone && (
        <div>
          <strong>Telefone:</strong> {order.customerPhone}
        </div>
      )}
      {isDelivery && (
        <div className="r-box">
          <div>
            <strong>
              {order.addressStreet}, {order.addressNumber ?? "s/n"}
            </strong>
          </div>
          {order.addressComplement && <div>{order.addressComplement}</div>}
          <div>
            <strong>Bairro:</strong> {order.addressDistrict}
          </div>
          {order.addressReference && <div>Ref.: {order.addressReference}</div>}
        </div>
      )}
      <Sep />

      <Items items={order.items} />
      {order.notes && (
        <div className="r-box">
          <strong>OBS:</strong> {order.notes}
        </div>
      )}
      <Sep />

      <Row left="Subtotal" right={formatBRL(order.subtotal)} />
      {isDelivery && <Row left="Taxa de entrega" right={order.deliveryFee === null ? "a definir" : formatBRL(order.deliveryFee)} />}
      <Row className="r-total" left="TOTAL" right={formatBRL(order.total)} />
      <Sep />

      <div>
        <strong>Pagamento:</strong> {PAYMENT_LABEL[order.paymentMethod]}
      </div>
      {order.changeFor ? (
        <div>
          <strong>Troco para:</strong> {formatBRL(order.changeFor)} (levar {formatBRL(Math.max(0, order.changeFor - order.total))})
        </div>
      ) : null}
      {order.driver && (
        <div>
          <strong>Entregador:</strong> {order.driver.name}
        </div>
      )}
      <div className="r-small">Situação: {STATUS_LABEL[order.status]}</div>
      <Sep />
      <div className="r-center r-small">Impresso em {printDate.format(new Date())}</div>
    </ReceiptShell>
  );
}
