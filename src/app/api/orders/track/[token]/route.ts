import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackingTokenParam } from "@/lib/validators";
import { getClientIp, jsonError, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getStoreSettings } from "@/lib/settings";
import { orderPixPayload } from "@/lib/pix";
import type { TrackedOrder } from "@/types/order";
import { tableSessionTotals } from "@/lib/table-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Público: quem tem o token (enviado só ao cliente) vê o pedido. A página consulta a cada poucos segundos.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(`track:${getClientIp(req)}`, 60, 60_000);
  if (!rl.ok) return tooManyRequests(rl);

  const token = trackingTokenParam.safeParse((await params).token);
  if (!token.success) return jsonError("Pedido não encontrado.", 404);

  const [order, settings] = await Promise.all([
    prisma.order.findUnique({ where: { trackingToken: token.data }, include: { items: true, tableSession: { select: { tableNumber: true, closedAt: true, discount: true, total: true } } } }),
    getStoreSettings(),
  ]);
  if (!order) return jsonError("Pedido não encontrado.", 404);

  const payload = orderPixPayload(settings, order);
  const body: TrackedOrder = {
    number: order.number,
    status: order.status,
    type: order.type,
    tableNumber: order.tableNumber,
    customerName: order.customerName,
    items: order.items.map((i) => ({
      quantity: i.quantity,
      productName: i.productName,
      halfProductName: i.halfProductName,
      categoryLabel: i.categoryLabel,
      variantName: i.variantName,
      addons: Array.isArray(i.addons) ? i.addons.map((a) => String((a as { name?: unknown })?.name ?? "")) : [],
      totalPrice: i.totalPrice,
    })),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    feePending: order.type === "DELIVERY" && order.deliveryFee === null,
    total: order.total,
    paymentMethod: order.paymentMethod,
    changeFor: order.changeFor,
    createdAt: order.createdAt.toISOString(),
    pix: payload && settings.pixKey ? { payload, key: settings.pixKey, holderName: settings.pixHolderName } : null,
    store: { name: settings.storeName, whatsappNumber: settings.whatsappNumber },
    tableTab:
      order.tableSessionId && order.tableSession
        ? {
            tableNumber: order.tableSession.tableNumber,
            ...(await tableSessionTotals(order.tableSessionId)),
            closed: !!order.tableSession.closedAt,
            // Desconto da Mesa Premiada: só existe na comanda depois de fechada no caixa.
            prizeDiscount: order.tableSession.closedAt ? order.tableSession.discount : 0,
            paid: order.tableSession.closedAt ? order.tableSession.total : null,
          }
        : null,
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
