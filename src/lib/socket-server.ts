// Ponte entre as rotas do Next.js e a instância do Socket.IO criada no server.ts (mesmo processo).
// Sem imports com alias "@/": este arquivo também é carregado pelo server.ts via tsx.
import type { Server } from "socket.io";

export const STAFF_ROOM = "staff";

const g = globalThis as unknown as { __orderflowIo?: Server };

export function setIo(io: Server) {
  g.__orderflowIo = io;
}

export function emitToStaff(event: "order:new" | "order:updated", payload: unknown) {
  g.__orderflowIo?.to(STAFF_ROOM).emit(event, payload);
}
