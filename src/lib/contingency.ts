import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getStoreSettings } from "./settings";
import { getCampaign } from "./mesa-premiada";
import type { SnapOrder, SnapTable, Snapshot } from "@/types/contingency";

const include = { items: true, driver: { select: { name: true } } } satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof include }>;

const RECENT_HOURS = 36;
const RECENT_LIMIT = 250;

function toSnap(o: OrderRow): SnapOrder {
  return {
    id: o.id,
    number: o.number,
    type: o.type,
    status: o.status,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    tableNumber: o.tableNumber,
    addressStreet: o.addressStreet,
    addressNumber: o.addressNumber,
    addressDistrict: o.addressDistrict,
    addressComplement: o.addressComplement,
    addressReference: o.addressReference,
    paymentMethod: o.paymentMethod,
    changeFor: o.changeFor,
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
    notes: o.notes,
    driverName: o.driver?.name ?? null,
    createdAt: o.createdAt.toISOString(),
    items: o.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      categoryLabel: i.categoryLabel,
      productName: i.productName,
      halfProductName: i.halfProductName,
      variantName: i.variantName,
      addons: Array.isArray(i.addons) ? (i.addons as { name?: string }[]).filter((a) => a?.name).map((a) => ({ name: String(a.name) })) : [],
      notes: i.notes,
      totalPrice: i.totalPrice,
    })),
  };
}

/**
 * Retrato da loja para o modo contingência: mesas abertas com o valor a cobrar, pedidos em andamento
 * e os últimos pedidos. O navegador do computador da loja guarda esta cópia e a mostra sem internet.
 */
export async function buildSnapshot(): Promise<Snapshot> {
  const since = new Date(Date.now() - RECENT_HOURS * 60 * 60 * 1000);
  const [settings, sessions, active, recent, campaign] = await Promise.all([
    getStoreSettings(),
    prisma.tableSession.findMany({
      where: { closedAt: null },
      include: { orders: { include, orderBy: { createdAt: "asc" } }, mesaPremiada: { select: { awarded: true } } },
      orderBy: { tableNumber: "asc" },
    }),
    prisma.order.findMany({
      where: { type: { not: "TABLE" }, status: { in: ["PENDING", "PREPARING", "OUT_FOR_DELIVERY"] } },
      include,
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.order.findMany({ where: { createdAt: { gte: since } }, include, orderBy: { createdAt: "desc" }, take: RECENT_LIMIT }),
    getCampaign(),
  ]);

  const tables: SnapTable[] = sessions.map((s) => {
    const valid = s.orders.filter((o) => o.status !== "CANCELED");
    return {
      sessionId: s.id,
      tableNumber: s.tableNumber,
      openedAt: s.openedAt.toISOString(),
      total: valid.reduce((a, o) => a + o.total, 0),
      prizeDiscount: s.mesaPremiada && !s.mesaPremiada.awarded ? (campaign?.discount ?? 0) : 0,
      hasPending: s.orders.some((o) => o.status === "PENDING"),
      orders: valid.map(toSnap),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    storeName: settings.storeName,
    tables,
    activeOrders: active.map(toSnap),
    recentOrders: recent.map(toSnap),
  };
}
