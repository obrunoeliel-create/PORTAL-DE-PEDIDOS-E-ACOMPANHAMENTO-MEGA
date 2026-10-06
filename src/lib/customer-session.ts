import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

/**
 * Sessão do CLIENTE (separada da sessão da loja): cookie HttpOnly assinado que "lembra" o celular
 * por 180 dias. Só quem tem o cookie (ou entrou com WhatsApp + senha) vê nome e endereço salvos.
 */
export const CUSTOMER_COOKIE = "of_customer";
const MAX_AGE = 60 * 60 * 24 * 180;
const AUDIENCE = "orderflow-customer";
const ISSUER = "orderflow-os";

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET ausente ou curto");
  return new TextEncoder().encode(s);
}

export const customerCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const, // volta pelo link do WhatsApp/QR já reconhecido
  path: "/",
  maxAge: MAX_AGE,
};

export async function signCustomerToken(customerId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(customerId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export const customerSelect = {
  id: true,
  name: true,
  phone: true,
  addressStreet: true,
  addressNumber: true,
  addressDistrict: true,
  addressComplement: true,
  addressReference: true,
  zoneId: true,
} as const;

export type CustomerProfile = {
  id: string;
  name: string;
  phone: string;
  address: {
    street: string;
    number: string;
    district: string;
    complement: string | null;
    reference: string | null;
    zoneId: string | null;
  } | null;
};

export function toProfile(c: {
  id: string;
  name: string;
  phone: string;
  addressStreet: string | null;
  addressNumber: string | null;
  addressDistrict: string | null;
  addressComplement: string | null;
  addressReference: string | null;
  zoneId: string | null;
}): CustomerProfile {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    address:
      c.addressStreet && c.addressNumber && c.addressDistrict
        ? {
            street: c.addressStreet,
            number: c.addressNumber,
            district: c.addressDistrict,
            complement: c.addressComplement,
            reference: c.addressReference,
            zoneId: c.zoneId,
          }
        : null,
  };
}

/** Cliente da sessão atual (cookie), ou null. */
export async function getCurrentCustomer(): Promise<CustomerProfile | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload.sub !== "string") return null;
    const c = await prisma.customer.findUnique({ where: { id: payload.sub }, select: customerSelect });
    return c ? toProfile(c) : null;
  } catch {
    return null;
  }
}
