// Servidor HTTP customizado: Next.js + Socket.IO no mesmo processo.
// O App Router não suporta WebSockets nativamente, por isso o servidor customizado.
import { createServer, type IncomingMessage } from "node:http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Server } from "socket.io";
import { SESSION_COOKIE, isAllowedOrigin, readCookie, verifySession } from "./src/lib/jwt";
import { STAFF_ROOM, setIo } from "./src/lib/socket-server";

const dev = process.env.NODE_ENV !== "production";
// Carrega o .env antes de ler PORT/APP_HOST (o Next só o carregaria dentro de prepare()).
loadEnvConfig(process.cwd(), dev);
const port = Number(process.env.PORT ?? 3000);
const host = process.env.APP_HOST ?? "localhost";
const trustProxy = process.env.TRUST_PROXY === "true";

function clientIp(req: IncomingMessage): string {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

const app = next({ dev, hostname: host, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Sobrescreve qualquer x-real-ip enviado pelo cliente: base confiável para o rate limit.
    req.headers["x-real-ip"] = clientIp(req);
    handle(req, res);
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    // Não derruba upgrades que não são do Socket.IO (ex: HMR do Next em dev).
    destroyUpgrade: false,
    // Bloqueia Cross-Site WebSocket Hijacking: só aceita conexões da própria origem.
    // Navegadores não enviam Origin em GET para o mesmo site (handshake via polling); nesse caso
    // vale o Sec-Fetch-Site, que o navegador preenche e uma página de outro site não consegue forjar.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      const allowed = origin
        ? isAllowedOrigin(origin, req.headers.host, req.headers["x-forwarded-host"])
        : req.headers["sec-fetch-site"] === "same-origin";
      callback(null, allowed);
    },
  });

  // Apenas a equipe autenticada (cookie HttpOnly com JWT válido) entra na sala de pedidos.
  io.use(async (socket, nextFn) => {
    const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    const session = token ? await verifySession(token) : null;
    if (!session) return nextFn(new Error("unauthorized"));
    socket.data.session = session;
    nextFn();
  });

  io.on("connection", (socket) => {
    socket.join(STAFF_ROOM);
  });

  setIo(io);

  httpServer.listen(port, host, () => {
    console.log(`> OrderFlow OS pronto em http://${host}:${port} (${dev ? "dev" : "produção"})`);
  });
});
