import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrderSchema } from "@/lib/validators";
import { PayloadError, getClientIp, jsonError, readJson, tooManyRequests, validationError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { PricingError, priceOrderItems } from "@/lib/pricing";
import { getStoreSettings } from "@/lib/settings";
import { orderInclude } from "@/lib/orders";
import { emitToStaff } from "@/lib/socket-server";
import { orderPixPayload } from "@/lib/pix";
import { verifyTableToken } from "@/lib/tables";
import { buildOrderMessage, buildWhatsAppUrl, formatAddress } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // 1) Rate limit anti-spam: 5 pedidos/minuto e 30/hora por IP.
  const ip = getClientIp(req);
  for (const [key, limit, windowMs] of [
    [`order:min:${ip}`, 5, 60_000],
    [`order:hour:${ip}`, 30, 3_600_000],
  ] as const) {
    const rl = rateLimit(key, limit, windowMs);
    if (!rl.ok) return tooManyRequests(rl);
  }

  // 2) Leitura com limite de tamanho + validação estrita com Zod.
  let body: unknown;
  try {
    body = await readJson(req);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;

  // Pedido na mesa: precisa do QR Code verdadeiro daquela mesa.
  if (input.type === "TABLE" && !(await verifyTableToken(input.tableNumber, input.tableToken))) {
    return NextResponse.json(
      { error: "QR Code da mesa inválido ou desatualizado. Leia novamente o QR Code que está na sua mesa.", fields: { tableToken: "QR Code inválido." } },
      { status: 422 },
    );
  }

  const settings = await getStoreSettings();
  if (!settings.isOpen) return jsonError("A loja está fechada no momento.", 409);

  // 3) Preços sempre recalculados no servidor.
  let priced;
  try {
    priced = await priceOrderItems(input.items);
  } catch (err) {
    if (err instanceof PricingError) return jsonError(err.message, 422);
    throw err;
  }

  // Delivery: a taxa é definida depois pelo operador (null = a definir). Balcão e mesa não têm taxa.
  const deliveryFee = input.type === "DELIVERY" ? null : 0;
  const total = priced.subtotal;

  // Mesa paga no caixa (presencial); delivery e balcão usam a forma escolhida pelo cliente.
  const paymentMethod = input.type === "TABLE" ? "ON_SITE" : input.paymentMethod;
  const changeFor = input.type !== "TABLE" && input.paymentMethod === "CASH" ? input.changeFor : undefined;
  if (changeFor !== undefined && changeFor < total) {
    return changeForError();
  }

  const order = await prisma.order.create({
    data: {
      // 192 bits aleatórios: o link de acompanhamento não pode ser adivinhado a partir do número do pedido.
      trackingToken: randomBytes(24).toString("base64url"),
      type: input.type,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      tableNumber: input.type === "TABLE" ? input.tableNumber : null,
      ...(input.type === "DELIVERY" && {
        addressStreet: input.address.street,
        addressNumber: input.address.number,
        addressDistrict: input.address.district,
        addressComplement: input.address.complement ?? null,
        addressReference: input.address.reference ?? null,
      }),
      paymentMethod,
      changeFor: changeFor ?? null,
      whatsappUpdates: input.type === "TABLE" ? false : input.whatsappUpdates,
      subtotal: priced.subtotal,
      deliveryFee,
      total,
      notes: input.notes ?? null,
      items: { create: priced.lines },
    },
    include: orderInclude,
  });

  // 4) Notifica o painel em tempo real.
  emitToStaff("order:new", order);

  const pixPayload = orderPixPayload(settings, order);

  const whatsappUrl = settings.whatsappNumber
    ? buildWhatsAppUrl(
        settings.whatsappNumber,
        buildOrderMessage({
          number: order.number,
          storeName: settings.storeName,
          type: order.type,
          tableNumber: order.tableNumber,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          address:
            order.type === "DELIVERY"
              ? formatAddress({
                  street: order.addressStreet,
                  number: order.addressNumber,
                  district: order.addressDistrict,
                  complement: order.addressComplement,
                  reference: order.addressReference,
                })
              : null,
          paymentMethod: order.paymentMethod,
          changeFor: order.changeFor,
          items: priced.lines.map((l) => ({ ...l, addonNames: l.addons.map((a) => a.name) })),
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          total: order.total,
          notes: order.notes,
        }),
      )
    : null;

  // Retorna apenas o necessário ao cliente (sem IDs internos ou dados de outros pedidos).
  return NextResponse.json(
    {
      number: order.number,
      trackingToken: order.trackingToken,
      total: order.total,
      feePending: order.type === "DELIVERY" && order.deliveryFee === null,
      paymentMethod: order.paymentMethod,
      pix: pixPayload && settings.pixKey ? { payload: pixPayload, key: settings.pixKey, holderName: settings.pixHolderName } : null,
      whatsappUrl,
    },
    { status: 201 },
  );
}

function changeForError() {
  return NextResponse.json(
    { error: "O valor para troco deve ser maior ou igual ao total.", fields: { changeFor: "Valor insuficiente." } },
    { status: 422 },
  );
}
