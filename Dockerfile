# OrderFlow OS — imagem de produção (Render, ou qualquer host com Docker)
# Node 24 (LTS ativa).
# Debian slim em vez de Alpine: o Prisma precisa de OpenSSL e glibc.

# ---------- 1) Dependências ----------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Inclui devDependencies: tsx (servidor), prisma (migrações) e tailwind (build) são usados em produção.
RUN npm ci --include=dev

# ---------- 2) Build ----------
FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ---------- 3) Runtime ----------
FROM node:24-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/server.ts /app/next.config.mjs /app/tsconfig.json ./

# Não roda como root.
USER node

# O Render injeta PORT (padrão 10000); o server.ts lê essa variável.
EXPOSE 3000

# Aplica as migrações pendentes e sobe o servidor (Next.js + Socket.IO).
CMD ["sh", "-c", "npx prisma migrate deploy && node_modules/.bin/tsx server.ts"]
