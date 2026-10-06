import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Busca de clientes cadastrados (por nome ou WhatsApp) — para atendimento e redefinição de senha.
export async function GET(req: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  const digits = q.replace(/\D/g, "");
  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : undefined,
    select: {
      id: true,
      name: true,
      phone: true,
      addressStreet: true,
      addressNumber: true,
      addressDistrict: true,
      lastOrderAt: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
    orderBy: [{ lastOrderAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 50,
  });
  return NextResponse.json({ customers });
}
