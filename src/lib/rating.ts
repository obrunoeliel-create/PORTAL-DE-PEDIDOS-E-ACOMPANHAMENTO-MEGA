const RATE_WINDOW_MS = 7 * 86_400_000;

/** Avaliação pelo link: pedido de delivery/balcão concluído há menos de 7 dias e ainda sem nota. */
export function canRate(order: { type: string; status: string; completedAt: Date | null; rating: unknown }) {
  return (
    order.type !== "TABLE" &&
    order.status === "COMPLETED" &&
    !order.rating &&
    !!order.completedAt &&
    Date.now() - order.completedAt.getTime() < RATE_WINDOW_MS
  );
}
