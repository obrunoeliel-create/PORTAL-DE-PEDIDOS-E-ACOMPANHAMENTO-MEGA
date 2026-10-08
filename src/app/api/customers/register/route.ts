import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { customerRegisterSchema } from "@/lib/validators";
import { PayloadError, getClientIp, jsonError, readJson, tooManyRequests, validationError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { sendCustomerWelcome } from "@/lib/welcome";
import { CUSTOMER_COOKIE, customerCookieOptions, customerSelect, signCustomerToken, toProfile } from "@/lib/customer-session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rl = rateLimit(`cust:register:${getClientIp(req)}`, 5, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await readJson(req, 4096);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = customerRegisterSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { name, phone, email, pin, address } = parsed.data;

  if (await prisma.customer.findUnique({ where: { phone }, select: { id: true } })) {
    return NextResponse.json(
      { error: "Já existe um cadastro com esse WhatsApp. Entre com sua senha.", fields: { phone: "WhatsApp já cadastrado." } },
      { status: 409 },
    );
  }

  // Bairro da lista de taxas: o nome oficial vem do cadastro de bairros.
  let district = address?.district ?? null;
  let zoneId: string | null = null;
  if (address?.zoneId) {
    const zone = await prisma.deliveryZone.findFirst({ where: { id: address.zoneId, active: true } });
    if (zone) {
      district = zone.name;
      zoneId = zone.id;
    }
  }

  const customer = await prisma.customer.create({
    data: {
      name,
      phone,
      email: email ?? null,
      pinHash: await bcrypt.hash(pin, 10),
      addressStreet: address?.street ?? null,
      addressNumber: address?.number ?? null,
      addressDistrict: district,
      addressComplement: address?.complement ?? null,
      addressReference: address?.reference ?? null,
      zoneId,
    },
    select: customerSelect,
  });

  // Boas-vindas por WhatsApp e e-mail em segundo plano: não atrasa o cadastro.
  void sendCustomerWelcome(customer.id);

  const res = NextResponse.json({ customer: toProfile(customer) }, { status: 201 });
  res.cookies.set(CUSTOMER_COOKIE, await signCustomerToken(customer.id), customerCookieOptions);
  return res;
}
