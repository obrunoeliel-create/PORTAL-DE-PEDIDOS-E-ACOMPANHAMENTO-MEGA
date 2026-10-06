import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { cuidParam } from "@/lib/validators";
import { jsonError } from "@/lib/http";
import { clearRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const WEAK = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "0123"]);

// Cliente esqueceu a senha: a loja gera uma nova (mostrada uma única vez) e passa para ele.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Cliente não encontrado.", 404);

  let pin = "";
  do pin = String(randomInt(0, 10_000)).padStart(4, "0");
  while (WEAK.has(pin));

  const customer = await prisma.customer.findUnique({ where: { id: id.data }, select: { phone: true } });
  if (!customer) return jsonError("Cliente não encontrado.", 404);
  await prisma.customer.update({ where: { id: id.data }, data: { pinHash: await bcrypt.hash(pin, 10) } });
  // Libera o bloqueio por tentativas erradas: o cliente já pode entrar com a senha nova.
  clearRateLimit(`cust:login:phone:${customer.phone}`);
  return NextResponse.json({ pin });
}
