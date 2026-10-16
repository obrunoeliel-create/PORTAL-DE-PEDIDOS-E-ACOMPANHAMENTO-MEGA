// Servidor HTTP customizado: Next.js + Socket.IO no mesmo processo.
// O App Router não suporta WebSockets nativamente, por isso o servidor customizado.
import { createServer, type IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Server } from "socket.io";
import { SESSION_COOKIE, isAllowedOrigin, readCookie, verifySession } from "./src/lib/jwt";
import { STAFF_ROOM, TRACK_NAMESPACE, setIo, trackRoom } from "./src/lib/socket-server";

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
const TRACKING_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
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

  // "Acompanhe seu pedido" (público): o cliente entra só na sala do próprio pedido, identificada pelo
  // token secreto do link. A sala recebe apenas um sinal de "mudou"; os dados vêm da API do pedido.
  io.of(TRACK_NAMESPACE).on("connection", (socket) => {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string" || !TRACKING_TOKEN_RE.test(token)) {
      socket.disconnect(true);
      return;
    }
    socket.join(trackRoom(token));
  });

  setIo(io);

  httpServer.listen(port, host, () => {
    console.log(`> OrderFlow OS pronto em http://${host}:${port} (${dev ? "dev" : "produção"})`);
    process.env.INTERNAL_TICK_SECRET = randomBytes(32).toString("hex");
    startMesaPremiadaClock();
    startWhatsAppClock();
  });
});

/**
 * Relógio do sorteio automático da Mesa Premiada: a cada minuto o servidor chama a própria rota interna
 * (que roda dentro do Next, com acesso ao banco). O segredo é gerado aqui e só existe neste processo.
 */
function startMesaPremiadaClock() {
  const local = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  const base = `http://${local}:${port}`;
  const tick = async () => {
    try {
      const res = await fetch(`${base}/api/internal/mesa-premiada/tick`, {
        method: "POST",
        headers: { Origin: base, "x-internal-secret": process.env.INTERNAL_TICK_SECRET ?? "" },
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json().catch(() => null)) as { drawn?: number | null } | null;
      if (data?.drawn) console.log(`[mesa-premiada] sorteio automático: mesa ${data.drawn}`);
    } catch (err) {
      console.warn("[mesa-premiada] relógio do sorteio falhou:", err instanceof Error ? err.message : err);
    }
  };
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000).unref();
}

/**
 * Relógio do robô do WhatsApp (a cada 20 s): mantém a conexão com o número da loja e envia a fila
 * (avisos de pedido, avaliações e cupons agendados, campanhas). Roda dentro do Next pela rota interna.
 */
function startWhatsAppClock() {
  const local = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  const base = `http://${local}:${port}`;
  const tick = async () => {
    try {
      await fetch(`${base}/api/internal/wa/tick`, {
        method: "POST",
        headers: { Origin: base, "x-internal-secret": process.env.INTERNAL_TICK_SECRET ?? "" },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      console.warn("[whatsapp] relógio do robô falhou:", err instanceof Error ? err.message : err);
    }
  };
  setTimeout(tick, 8_000);
  setInterval(tick, 20_000).unref();
}
