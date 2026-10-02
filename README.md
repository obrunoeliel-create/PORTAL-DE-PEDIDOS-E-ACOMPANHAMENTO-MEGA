# OrderFlow OS

Plataforma de pedidos para restaurantes: **cardápio digital (PWA)** para o cliente e **painel da loja** com monitor de pedidos em tempo real.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS · Prisma + PostgreSQL · Socket.IO · Zod · JWT (jose)

## Produção — A Mega Esfiha

🌐 **https://portal-de-pedidos-e-acompanhamento-mega.onrender.com**

| Página | Endereço |
|---|---|
| Cardápio do cliente | https://portal-de-pedidos-e-acompanhamento-mega.onrender.com |
| Pedido na mesa (QR Code) | https://portal-de-pedidos-e-acompanhamento-mega.onrender.com/?mesa=12 |
| Acompanhe seu pedido | https://portal-de-pedidos-e-acompanhamento-mega.onrender.com/pedido/&lt;token&gt; |
| Painel da loja | https://portal-de-pedidos-e-acompanhamento-mega.onrender.com/admin |

Variáveis de ambiente obrigatórias no Render (além das do `.env.example`):

```bash
NODE_ENV=production
APP_HOST=0.0.0.0
TRUST_PROXY=true
APP_ORIGIN=https://portal-de-pedidos-e-acompanhamento-mega.onrender.com
```

- **Build:** `npm install --include=dev && npx prisma migrate deploy && npm run build`
  (`--include=dev` é necessário: com `NODE_ENV=production` o npm pula `tsx`, `prisma` e `tailwindcss`, usados no build e no start)
- **Start:** `npm start`

## Como rodar

Pré-requisitos: **Node.js 20+** e **Docker** (ou um PostgreSQL próprio).

```bash
# 1. Variáveis de ambiente
cp .env.example .env          # Windows (PowerShell): Copy-Item .env.example .env
#    Edite o .env: defina JWT_SECRET (32+ chars) e SEED_ADMIN_PASSWORD (12+ chars).
#    Opcional: SEED_PIX_KEY e SEED_WHATSAPP_NUMBER.

# 2. Dependências e banco
npm install
docker compose up -d
npx prisma migrate dev --name init
npm run db:seed

# 3. Servidor (Next + WebSocket)
npm run dev
```

- Cardápio: http://localhost:3000 (pedido na mesa via QR Code: `http://localhost:3000/?mesa=12`)
- Painel: http://localhost:3000/admin (login com `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)

Para testar pelo celular na mesma rede, use `APP_HOST=0.0.0.0` e acesse pelo IP da máquina.
O painel deve ser usado via `localhost` ou HTTPS, porque o cookie de sessão é `Secure`.

Produção: `npm run build && npm start` (atrás de HTTPS; com proxy reverso, defina `TRUST_PROXY=true` e `APP_ORIGIN`).

> Nesta máquina o PostgreSQL 16 foi instalado nativamente (serviço `postgresql-x64-16`), sem Docker.

## Fluxo do pedido

1. O cliente faz o pedido no cardápio. No **delivery**, a taxa de entrega aparece como "a definir pela loja".
2. O pedido chega no painel em tempo real. Num delivery, o operador **digita a taxa no card**. O botão "Aceitar" só libera depois disso.
3. O botão **"Enviar valor final e link ao cliente"** abre o WhatsApp do cliente com o total e o link `/pedido/<token>`.
4. A página **Acompanhe seu pedido** (`/pedido/<token>`, um link privado e aleatório) mostra o status e o valor final. No PIX, mostra também o QR Code, a chave e o botão **"Enviar comprovante pelo WhatsApp"**, que abre a conversa da loja com o número do pedido e o valor já preenchidos.

Em balcão e mesa não há taxa, então o QR Code PIX aparece logo depois do pedido.

## Estrutura

```
server.ts                      Servidor HTTP customizado: Next.js + Socket.IO (auth por cookie no handshake)
prisma/schema.prisma           User, Category, Product, ProductVariant, Addon, Order, OrderItem, Driver, StoreSettings
prisma/seed.ts                 Cardápio inicial, configurações da loja e usuário gerente
src/middleware.ts              Proteção de /admin e /api/admin + checagem de Origin (anti-CSRF)
src/lib/
  jwt.ts                       Assinatura/verificação do JWT (HS256, issuer/audience, 8h)
  auth.ts                      Sessão via cookie HttpOnly; checagem de usuário ativo e papel no banco
  validators.ts                Schemas Zod estritos (.strict()) de todas as entradas
  pricing-core.ts / pricing.ts Regras de preço (1/2 a 1/2 pelo maior valor) — recalculado no servidor
  rate-limit.ts                Rate limiting (login e pedidos)
  pix.ts                       BR Code PIX estático com CRC16
  whatsapp.ts                  Resumo do pedido para WhatsApp
src/app/
  page.tsx                     Cardápio do cliente
  api/orders                   POST criação de pedido
  api/auth/{login,logout}
  api/admin/...                Status, entregador, entregadores, ativar/desativar produto
  admin/login                  Login
  admin/(panel)/               Pedidos (Kanban), Despacho, Cardápio, Financeiro
src/components/client|admin    Componentes de UI
```

## Segurança (OWASP Top 10)

| Controle | Implementação |
|---|---|
| Validação de entrada | Zod com `.strict()` (rejeita campos extras), limites de tamanho, enums e CUIDs; corpo limitado a 16 KB |
| Integridade de preço | Preços enviados pelo cliente são ignorados; tudo é recalculado do banco (`pricing.ts`) |
| Autenticação | JWT HS256 em cookie `HttpOnly` + `Secure` + `SameSite=Strict`, expiração de 8h; bcrypt custo 12; mensagem de erro genérica e comparação contra hash fictício (sem enumeração de usuários) |
| Autorização | Middleware + checagem no servidor em cada página/rota; papel lido do banco (MANAGER / OPERATOR); usuário inativo perde acesso na hora |
| CSRF / CSWSH | SameSite=Strict + verificação de `Origin` em toda mutação e no handshake do WebSocket |
| XSS | React escapa a saída; sanitização de texto livre (remove `<>` e caracteres de controle); CSP restritiva |
| SQL Injection | Somente Prisma ORM (consultas parametrizadas), sem SQL bruto |
| DoS / Spam | Rate limit: pedidos 5/min e 30/h por IP; login 10/15min por IP e 5/15min por conta. IP obtido do socket (não forjável pelo header) |
| Headers | CSP, HSTS (prod), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy |
| Concorrência | Mudança de status com controle otimista (dois operadores não conflitam) e máquina de estados |

## Próximos passos sugeridos

- **Rate limit distribuído**: o limiter atual é em memória (uma instância). Para escalar, use Redis.
- **PIX dinâmico**: integrar a API de um PSP (Efí, Mercado Pago...) e confirmar o pagamento por webhook.
- **WhatsApp API oficial** (Cloud API da Meta) para notificar o cliente automaticamente.
- **CSP com nonce** para remover `'unsafe-inline'` dos scripts.
- **Revogação de sessão** imediata (lista de tokens revogados ou `tokenVersion` no usuário).
- Telas de configuração da loja (taxa de entrega, chave PIX, abrir/fechar) e CRUD completo de produtos.
