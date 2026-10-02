import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBoardOrders } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Usado pelo painel para ressincronizar após reconexão do WebSocket.
export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ orders: await getBoardOrders() });
}
