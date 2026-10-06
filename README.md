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

## Pedidos na mesa (QR Code)

- Pedido na mesa **só pelo QR Code** que fica na mesa: `/?mesa=N&t=<chave>`. A chave é única por mesa e conferida no servidor; sem ela não existe a opção "mesa".
- A mesa fica **travada** para o cliente. Só a loja troca a mesa de um pedido (card do pedido → "Trocar mesa").
- Mesa **não tem pagamento online**: o pedido entra como "No caixa (presencial)" e o cliente vê apenas o total.
- Portal → **Mesas** (gerente): imprime os QR Codes (A4, 4 por folha) e gera um QR novo se algum vazar (o antigo para de funcionar).
- Criar mesas: `npm run db:seed-tables` (padrão 50; `TABLE_COUNT=60` para mais). Mesas existentes não mudam.

## Comanda da mesa

- Todos os pedidos da mesma mesa entram numa **comanda** e somam num total único.
- O cliente da mesa informa **só o nome** (sem telefone, sem endereço) e vê a conta da mesa no acompanhamento.
- Portal → **Comandas**: mesas com conta aberta, pedidos e total. "Receber e fechar mesa" pede a forma de pagamento,
  conclui os pedidos e fecha a comanda; o próximo pedido daquela mesa abre uma comanda nova, zerada.
- Não fecha com pedido "aguardando aceite" (aceite ou cancele antes). Trocar a mesa de um pedido leva-o para a comanda da mesa nova.
- Financeiro mostra as mesas fechadas no dia por forma de pagamento.

## Cadastro de clientes (opcional)

- Na chegada o cliente pode **entrar**, **se cadastrar** ou **pedir sem cadastro**.
- Cadastro: nome, WhatsApp, **senha de 4 números** e, se quiser, o endereço. A senha existe para que ninguém veja
  o endereço de outra pessoa só digitando o telefone dela (LGPD).
- O aparelho fica lembrado por 180 dias (cookie HttpOnly): nas próximas visitas os dados já aparecem.
- No delivery o carrinho pergunta "Entregar neste endereço?" (endereço salvo) ou permite informar outro e salvá-lo.
- Senha errada: 5 tentativas por WhatsApp a cada 15 min. Portal → **Clientes**: busca e botão "Nova senha" para quem esqueceu.

## Faixa de Natal

`src/components/client/Christmas.tsx`: faixa animada "Vem aí a Mesa Premiada", luzinhas e neve no topo do cardápio.
Os textos ficam em `MESSAGES`; a decoração some sozinha em 07/01/2027 (`CAMPAIGN_UNTIL`).

## WhatsApp automático (opt-in)

No checkout de **delivery e balcão** o cliente pode marcar "Quero receber atualizações no WhatsApp". Se marcou, o sistema envia sozinho:
- quando a loja **aceita** o pedido;
- quando **sai para entrega** (delivery) ou fica **pronto para retirada** (balcão).

O envio usa a **API oficial do WhatsApp Business (Meta Cloud API)** — o único jeito de enviar sem ninguém clicar. Configuração:

1. Em https://business.facebook.com crie/verifique a empresa e, em https://developers.facebook.com, um app do tipo *Business* com o produto **WhatsApp**.
2. Cadastre o número da loja (um número que **não** esteja em uso no app WhatsApp comum, ou migre o atual).
3. Crie um **usuário do sistema** com permissão `whatsapp_business_messaging` e gere um **token permanente** → `WHATSAPP_TOKEN`.
4. Copie o **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
5. Em *Modelos de mensagem*, crie 3 modelos categoria **Utilidade**, idioma **Português (BR)**, com 4 variáveis:
   - `pedido_aceito`: "Olá, {{1}}! Seu pedido #{{2}} na Mega Esfiha Jurema foi aceito e já está sendo preparado. Total: {{3}}. Acompanhe: {{4}}"
   - `pedido_saiu_entrega`: "{{1}}, seu pedido #{{2}} saiu para entrega! 🛵 Total: {{3}}. Acompanhe: {{4}}"
   - `pedido_pronto_retirada`: "{{1}}, seu pedido #{{2}} está pronto para retirada no balcão! Total: {{3}}. Acompanhe: {{4}}"
6. Coloque as variáveis `WHATSAPP_*` (ver `.env.example`) no Render e faça um novo deploy.

O card do pedido no painel mostra se cada aviso foi enviado (✓) ou o erro da Meta; o botão manual de WhatsApp continua disponível.

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
