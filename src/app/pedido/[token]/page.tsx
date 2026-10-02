import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { trackingTokenParam } from "@/lib/validators";
import { OrderTracker } from "@/components/client/OrderTracker";

export const metadata: Metadata = {
  title: "Acompanhe seu pedido",
  // Link privado do cliente: não indexar e não vazar o token via Referer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function TrackOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const token = trackingTokenParam.safeParse((await params).token);
  if (!token.success) notFound();
  return <OrderTracker token={token.data} />;
}
