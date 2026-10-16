import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { getBoardOrders, orderInclude, toBoardOrder } from "@/lib/orders";
import { staffOrderSchema } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { PricingError, priceOrderItems } from "@/lib/pricing";
import { getOrOpenTableSession } from "@/lib/table-sessions";
import { emitToStaff } from "@/lib/socket-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Usado pelo painel para ressincronizar após reconexão do WebSocket.
export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ orders: await getBoardOrders() });
}

/**
 * Pedido lançado pela loja no portal: balcão, delivery (cliente pediu por telefone/presencial) ou
 * itens a mais numa mesa. Entra já ACEITO (em preparo) — quem lançou é a própria loja.
 * Os preços são recalculados aqui a partir do cardápio, como nos pedidos do cliente.
 */
export async function POST(req: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await readJson(req, 32 * 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = staffOrderSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;

  if (input.type === "TABLE") {
    const table = await prisma.diningTable.findUnique({ where: { number: input.tableNumber }, select: { active: true } });
    if (!table?.active) {
      return NextResponse.json({ error: `A mesa ${input.tableNumber} não existe ou está desativada.`, fields: { tableNumber: "Mesa inválida." } }, { status: 422 });
    }
  }

  let priced;
  try {
    priced = await priceOrderItems(input.items);
  } catch (err) {
    if (err instanceof PricingError) return jsonError(err.message, 422);
    throw err;
  }

  // Delivery: taxa do bairro da lista; fora da lista vale a taxa digitada pela loja (ou fica a definir).
  let deliveryFee: number | null = input.type === "DELIVERY" ? (input.deliveryFee ?? null) : 0;
  let district = input.type === "DELIVERY" ? input.address.district : null;
  if (input.type === "DELIVERY" && input.address.zoneId) {
    const zone = await prisma.deliveryZone.findFirst({ where: { id: input.address.zoneId, active: true } });
    if (!zone) return NextResponse.json({ error: "Esse bairro não está mais na lista. Escolha de novo.", fields: { "address.zoneId": "Bairro indisponível." } }, { status: 422 });
    deliveryFee = zone.fee;
    district = zone.name;
  }
  const total = priced.subtotal + (deliveryFee ?? 0);

  const paymentMethod = input.type === "TABLE" ? "ON_SITE" : input.paymentMethod;
  const changeFor = input.type !== "TABLE" && input.paymentMethod === "CASH" ? input.changeFor : undefined;
  if (changeFor !== undefined && deliveryFee !== null && changeFor < total) {
    return NextResponse.json({ error: "O troco precisa ser para um valor maior ou igual ao total.", fields: { changeFor: "Valor insuficiente." } }, { status: 422 });
  }

  const phone = input.type === "TABLE" ? "" : input.customerPhone;
  // Cliente com cadastro (mesmo WhatsApp): o pedido entra no histórico dele.
  const customer = phone ? await prisma.customer.findUnique({ where: { phone }, select: { id: true } }) : null;
  const tableSessionId = input.type === "TABLE" ? await getOrOpenTableSession(input.tableNumber) : null;
  const now = new Date();

  const order = await prisma.order.create({
    data: {
      trackingToken: randomBytes(24).toString("base64url"),
      type: input.type,
      status: "PREPARING",
      acceptedAt: now,
      createdBy: auth.user.name,
      customerId: customer?.id ?? null,
      tableSessionId,
      customerName: input.customerName,
      customerPhone: phone,
      tableNumber: input.type === "TABLE" ? input.tableNumber : null,
      ...(input.type === "DELIVERY" && {
        addressStreet: input.address.street,
        addressNumber: input.address.number,
        addressDistrict: district,
        addressComplement: input.address.complement ?? null,
        addressReference: input.address.reference ?? null,
        addressZip: input.address.zip ?? null,
      }),
      paymentMethod,
      changeFor: changeFor ?? null,
      subtotal: priced.subtotal,
      deliveryFee,
      total,
      notes: input.notes ?? null,
      items: { create: priced.lines },
    },
    include: orderInclude,
  });
  if (customer) await prisma.customer.update({ where: { id: customer.id }, data: { lastOrderAt: now } });

  const board = toBoardOrder(order);
  emitToStaff("order:new", board);
  return NextResponse.json({ order: board }, { status: 201 });
}
