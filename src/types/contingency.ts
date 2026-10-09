// Cópia de segurança (modo contingência) guardada no navegador do computador da loja.
import type { OrderStatusValue, OrderTypeValue, PaymentMethodValue } from "./order";

export type SnapItem = {
  id: string;
  quantity: number;
  categoryLabel: string | null;
  productName: string;
  halfProductName: string | null;
  variantName: string | null;
  addons: { name: string }[];
  notes: string | null;
  totalPrice: number;
};

export type SnapOrder = {
  id: string;
  number: number;
  type: OrderTypeValue;
  status: OrderStatusValue;
  customerName: string;
  customerPhone: string;
  tableNumber: number | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressDistrict: string | null;
  addressComplement: string | null;
  addressReference: string | null;
  paymentMethod: PaymentMethodValue;
  changeFor: number | null;
  subtotal: number;
  deliveryFee: number | null;
  total: number;
  notes: string | null;
  driverName: string | null;
  createdAt: string;
  items: SnapItem[];
};

export type SnapTable = {
  sessionId: string;
  tableNumber: number;
  openedAt: string;
  /** Soma dos pedidos não cancelados. */
  total: number;
  /** Desconto da Mesa Premiada a aplicar no caixa (0 = mesa comum). Só a equipe vê. */
  prizeDiscount: number;
  hasPending: boolean;
  orders: SnapOrder[];
};

export type Snapshot = {
  generatedAt: string;
  storeName: string;
  tables: SnapTable[];
  /** Delivery e balcão ainda em andamento. */
  activeOrders: SnapOrder[];
  /** Últimos pedidos (todos os tipos), do mais novo para o mais antigo. */
  recentOrders: SnapOrder[];
};

/** Mesa fechada no caixa sem internet: fica na fila até a internet voltar. */
export type QueuedClose = {
  id: string;
  sessionId: string;
  tableNumber: number;
  paidWith: "CASH" | "CARD" | "PIX" | null;
  /** Total da mesa (sem desconto) no momento do fechamento, para conferir na volta da internet. */
  expectedTotal: number;
  /** Valor cobrado do cliente (já com o desconto da Mesa Premiada, se houver). */
  charged: number;
  at: string;
  /** Preenchido quando a loja precisa conferir (ex: chegou pedido novo da mesa durante a queda). */
  problem?: string;
};
