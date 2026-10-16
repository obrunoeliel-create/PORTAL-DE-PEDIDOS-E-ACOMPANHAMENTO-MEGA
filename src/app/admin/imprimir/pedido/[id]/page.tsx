import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { getStoreSettings } from "@/lib/settings";
import { cuidParam } from "@/lib/validators";
import { formatBRL } from "@/lib/money";
import { PAYMENT_LABEL } from "@/lib/labels";
import { maskCep } from "@/lib/cep";
import { Items, ReceiptShell, Row, Sep, paperWidth, printDate } from "@/components/print/Receipt";
import { PrintControls } from "@/components/print/PrintControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir pedido" };

const TYPE_TITLE = { DELIVERY: "DELIVERY", PICKUP: "BALCÃO", TABLE: "MESA" } as const;

/** Cupom do pedido (cozinha / entrega): o que importa em letra grande, sem linhas sobrando. */
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
  const typeTitle = order.type === "TABLE" && order.tableNumber ? `MESA ${order.tableNumber}` : TYPE_TITLE[order.type];
  return (
    <ReceiptShell width={paperWidth(sp.w)}>
      <PrintControls auto={sp.auto === "1"} />
      <div className="r-center">
        <div className="r-store">{settings.storeName}</div>
        <div className="r-big">#{order.number}</div>
        <div className="r-tag">{typeTitle}</div>
        {order.status === "CANCELED" && <div className="r-tag">CANCELADO</div>}
        <div className="r-small">{printDate.format(order.createdAt)}</div>
      </div>
      <Sep />

      <div>
        <strong>{order.customerName}</strong>
        {order.customerPhone && <span> · {order.customerPhone}</span>}
      </div>
      {isDelivery && (
        <div className="r-box">
          <div>
            <strong>
              {order.addressStreet}, {order.addressNumber ?? "s/n"}
            </strong>
            {order.addressComplement && <span> — {order.addressComplement}</span>}
          </div>
          <div>
            {order.addressDistrict}
            {order.addressZip && <span> · CEP {maskCep(order.addressZip)}</span>}
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

      {(isDelivery || order.discount > 0) && <Row left="Subtotal" right={formatBRL(order.subtotal)} />}
      {order.discount > 0 && <Row left={`Cupom ${order.couponCode ?? ""}`} right={`-${formatBRL(order.discount)}`} />}
      {isDelivery && <Row left="Entrega" right={order.deliveryFee === null ? "a definir" : formatBRL(order.deliveryFee)} />}
      <Row className="r-total" left="TOTAL" right={formatBRL(order.total)} />
      <div>
        <strong>Pagamento:</strong> {PAYMENT_LABEL[order.paymentMethod]}
        {order.changeFor ? (
          <span>
            {" "}
            · troco p/ {formatBRL(order.changeFor)} (levar {formatBRL(Math.max(0, order.changeFor - order.total))})
          </span>
        ) : null}
      </div>
      {order.driver && (
        <div>
          <strong>Motoboy:</strong> {order.driver.name}
        </div>
      )}
      {order.createdBy && <div className="r-small">Lançado na loja por {order.createdBy}</div>}
    </ReceiptShell>
  );
}
