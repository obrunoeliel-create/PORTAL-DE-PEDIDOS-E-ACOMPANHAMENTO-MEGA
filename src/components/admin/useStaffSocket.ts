"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { BoardOrder } from "@/types/order";

type Handlers = {
  onNew?: (order: BoardOrder) => void;
  onUpdated?: (order: BoardOrder) => void;
  /** Chamado a cada (re)conexão — use para ressincronizar o estado. */
  onConnect?: () => void;
};

export function useStaffSocket(handlers: Handlers) {
  const ref = useRef(handlers);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    // Mesma origem: o cookie HttpOnly de sessão é enviado automaticamente no handshake.
    // WebSocket primeiro (o handshake sempre leva Origin); polling só como reserva.
    const socket = io({ path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    socket.on("connect", () => {
      setConnected(true);
      ref.current.onConnect?.();
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("order:new", (o: BoardOrder) => ref.current.onNew?.(o));
    socket.on("order:updated", (o: BoardOrder) => ref.current.onUpdated?.(o));
    return () => {
      socket.disconnect();
    };
  }, []);

  return connected;
}

export async function fetchBoardOrders(): Promise<BoardOrder[] | null> {
  try {
    const res = await fetch("/api/admin/orders", { cache: "no-store" });
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return null;
    }
    if (!res.ok) return null;
    return ((await res.json()) as { orders: BoardOrder[] }).orders;
  } catch {
    return null;
  }
}

export function upsertOrder(list: BoardOrder[], order: BoardOrder): BoardOrder[] {
  const idx = list.findIndex((o) => o.id === order.id);
  if (idx === -1) return [...list, order];
  const copy = list.slice();
  copy[idx] = order;
  return copy;
}
