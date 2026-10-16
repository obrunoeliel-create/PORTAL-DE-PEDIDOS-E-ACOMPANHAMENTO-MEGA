// Ponte entre as rotas do Next.js e a instância do Socket.IO criada no server.ts (mesmo processo).
// Sem imports com alias "@/": este arquivo também é carregado pelo server.ts via tsx.
import type { Server } from "socket.io";

export const STAFF_ROOM = "staff";
/** Namespace público do "Acompanhe seu pedido": cada pedido tem sua sala (o token secreto do link). */
export const TRACK_NAMESPACE = "/track";
export const trackRoom = (token: string) => `t:${token}`;

const g = globalThis as unknown as { __orderflowIo?: Server };

export function setIo(io: Server) {
  g.__orderflowIo = io;
}

type StaffEvent = "order:new" | "order:updated" | "campaign:updated" | "tablecalls:changed" | "wa:status" | "wa:message";

export function emitToStaff(event: StaffEvent, payload: unknown) {
  g.__orderflowIo?.to(STAFF_ROOM).emit(event, payload);
  // Pedido mudou: avisa a página de acompanhamento do cliente (só um sinal; os dados ela busca na API).
  if ((event === "order:new" || event === "order:updated") && payload && typeof payload === "object") {
    const token = (payload as { trackingToken?: unknown }).trackingToken;
    if (typeof token === "string") g.__orderflowIo?.of(TRACK_NAMESPACE).to(trackRoom(token)).emit("changed");
  }
}
