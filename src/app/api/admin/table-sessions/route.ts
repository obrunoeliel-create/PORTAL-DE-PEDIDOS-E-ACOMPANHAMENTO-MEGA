import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { listOpenSessions } from "@/lib/table-sessions";
import { toBoardOrder } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Comandas abertas (mesas com conta em andamento) — usado pela tela "Comandas".
export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const sessions = await listOpenSessions();
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      tableNumber: s.tableNumber,
      openedAt: s.openedAt.toISOString(),
      orders: s.orders.map(toBoardOrder),
    })),
  });
}
