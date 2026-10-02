import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const r = (reais: number) => Math.round(reais * 100);

type SeedVariant = { name: string; price: number };

type SeedProduct = {
  name: string;
  description?: string;
  price?: number;
  variants?: SeedVariant[];
  /** Criado desativado: preço a confirmar pelo gerente antes de aparecer no cardápio. */
  inactive?: boolean;
};

type SeedCategory = {
  name: string;
  slug: string;
  allowsHalf?: boolean;
  products: SeedProduct[];
  addons?: { name: string; price: number }[];
};

const same = (names: string[], price: number): SeedProduct[] => names.map((name) => ({ name, price }));

/** Pizza com tamanhos Grande | Broto. */
const pizza = (name: string, description: string, grande: number, broto: number): SeedProduct => ({
  name,
  description,
  variants: [
    { name: "Grande", price: grande },
    { name: "Broto", price: broto },
  ],
});

/** Porção com tamanhos Grande | Meia. */
const porcao = (name: string, grande: number, meia: number, description?: string): SeedProduct => ({
  name,
  description,
  variants: [
    { name: "Grande", price: grande },
    { name: "Meia", price: meia },
  ],
});

const SABORES_SUCO =
  "Sabores: Abacaxi com Hortelã, Acerola, Caju, Coco, Goiaba, Limão, Manga, Morango, Açaí, Maracujá, Melão, Abacaxi ou Detox. Informe o sabor nas observações.";

const BEIRUTE_DESC = "Acompanha bacon, presunto, ovo, alface, queijo, tomate e maionese.";

// Cardápio "A Mega Esfiha" — setembro/2026.
const MENU: SeedCategory[] = [
  {
    name: "Esfihas",
    slug: "esfihas-tradicionais",
    products: [
      ...same(["Carne"], 3.5),
      ...same(["Queijo", "Calabresa", "Frango"], 4),
      ...same(["Requeijão", "Cheddar"], 3.5),
      ...same(["Bauru", "Atum"], 5),
    ],
  },
  {
    name: "Esfihas 2 Sabores",
    slug: "esfihas-especiais",
    products: [
      ...same(
        [
          "Carne com Queijo",
          "Carne com Cheddar",
          "Carne com Requeijão",
          "Calabresa com Queijo",
          "Calabresa com Cheddar",
          "Calabresa com Requeijão",
          "Caipira",
          "Frango com Queijo",
          "Frango com Requeijão",
          "Frango com Cheddar",
          "Palmito com Requeijão",
          "Palmito com Cheddar",
          "Palmito com Queijo",
          "Bacon com Requeijão",
          "Bacon com Cheddar",
          "Bacon com Queijo",
          "Milho com Cheddar",
          "Milho com Queijo",
          "Pizza",
          "2 Queijos",
          "3 Queijos",
        ],
        5,
      ),
      ...same(["Carne Seca com Queijo", "4 Queijos", "Atum com Queijo", "Atum com Requeijão"], 6),
    ],
  },
  {
    name: "Esfihas Doces",
    slug: "esfihas-doces",
    products: [
      ...same(["Chocolate", "Chocolate Branco"], 8),
      ...same(["Doce de Leite", "Brigadeiro", "Prestígio", "Confetes"], 9),
      ...same(["Banana Canela Chocolate", "Banana com Chocolate", "Romeu e Julieta", "Sensação"], 10),
    ],
  },
  {
    name: "Pizzas",
    slug: "pizzas",
    allowsHalf: true,
    products: [
      pizza("Mussarela", "Tomate, mussarela e azeitonas", 47, 24.5),
      pizza("Calabresa", "Calabresa fatiada e cebola", 46, 24),
      pizza("Bauru", "Presunto picado, tomate e mussarela", 48, 25),
      pizza("Baiana", "Presunto, ovo, cebola e calabresa", 49, 25.5),
      pizza("Toscana", "Calabresa e mussarela", 48, 25),
      pizza("Frango Requeijão", "Peito desfiado com requeijão", 48, 25),
      pizza("Milho", "Milho, requeijão ou mussarela", 49, 25.5),
      pizza("Atum", "Atum e cebola", 50, 26),
      pizza("Atum Mussarela", "Atum e mussarela", 54, 28),
      pizza("Palmito", "Palmito, mussarela e azeitona", 49, 25.5),
      pizza("Portuguesa", "Presunto, ovo, mussarela, ervilha e cebola", 53, 27.5),
      pizza("Á Moda", "Mussarela, bacon e tomate", 50, 26),
      pizza("Big Mega", "Frango, calabresa, cheddar, milho e ervilha", 53, 27.5),
      pizza("Caipira", "Frango, milho e mussarela", 50, 26),
      pizza("Canadense", "Atum, milho, cebola e mussarela", 55, 28.5),
      pizza("Jardineira", "Palmito, ervilha, milho, bacon e mussarela", 53, 27.5),
      pizza("Paulista", "Presunto, frango, milho e mussarela", 51, 26.5),
      pizza("Sertaneja", "Frango, ovo e mussarela", 50, 26),
      pizza("Á Moda do Chefe", "Frango, bacon, milho e mussarela", 53, 27.5),
      pizza("Dois Queijos", "Mussarela e requeijão", 49, 25.5),
      pizza("Três Queijos", "Mussarela, requeijão e cheddar", 51, 26.5),
      pizza("Quatro Queijos", "Mussarela, requeijão, cheddar e parmesão", 55, 28.5),
      pizza("Catolés", "Frango, mussarela e bacon", 51, 26.5),
      pizza("Jurema", "Calabresa, milho, ovo e mussarela", 52, 27),
      pizza("Carne Seca", "Carne seca e mussarela", 60, 31),
      pizza("Marguerita", "Mussarela, parmesão, manjericão e tomate", 49, 25.5),
    ],
    addons: [
      { name: "Acréscimo Queijo", price: 4 },
      { name: "Acréscimo Catupiry", price: 4 },
      { name: "Acréscimo Cheddar", price: 4 },
    ],
  },
  {
    name: "Pizzas Doces",
    slug: "pizzas-doces",
    allowsHalf: true,
    products: [
      pizza("Chocolate", "Chocolate", 47, 24.5),
      pizza("Sensação", "Morango e chocolate", 53, 27.5),
      pizza("Confetes", "Chocolate e confetes", 49, 25.5),
      pizza("Brigadeiro", "Chocolate e granulado", 49, 25.5),
      pizza("Prestígio", "Chocolate e coco ralado", 49, 25.5),
      pizza("Banana", "Banana, chocolate e canela", 51, 26.5),
      pizza("Romeu e Julieta", "Mussarela e goiabada", 51, 26.5),
      pizza("Banana Nevada", "Banana e chocolate gratinados", 53, 27.5),
    ],
  },
  {
    name: "Pastéis",
    slug: "pasteis",
    products: [
      ...same(
        [
          "Carne",
          "Queijo",
          "Calabresa",
          "Requeijão",
          "Frango",
          "Frango com Requeijão",
          "Pizza",
          "Bauru",
          "Palmito com Queijo",
          "Bacon com Queijo",
          "Atum",
        ],
        12,
      ),
      { name: "Especial", description: "Carne, frango, presunto, ovo, mussarela, calabresa e requeijão", price: 18 },
      ...same(["Carne Seca", "4 Queijos"], 15),
    ],
  },
  {
    name: "Lanches",
    slug: "lanches",
    products: [
      { name: "X-Burger", price: 17 },
      { name: "X-Salada", price: 19 },
      { name: "X-Bacon", price: 20 },
      { name: "X-Egg", price: 20 },
      { name: "Americano", price: 12 },
      { name: "Misto Quente", price: 9 },
      { name: "Bauru", price: 10 },
      { name: "X-Bacon Salada", price: 21 },
      { name: "X-Egg Salada", price: 21 },
      { name: "X-Tudo", price: 23 },
      { name: "X-Tudo Duplo", price: 26 },
    ].map((p) => ({ ...p, description: "No pão de hambúrguer" })),
    addons: [
      { name: "Acréscimo Fritas", price: 7 },
      { name: "Hambúrguer Extra", price: 3 },
      { name: "Acréscimo Cheddar", price: 2 },
    ],
  },
  {
    name: "Beirute",
    slug: "beirute",
    products: [
      { name: "Á Moda", description: `Hambúrguer picado, milho e ervilha. ${BEIRUTE_DESC}`, price: 37 },
      ...same(
        ["Frango com Requeijão", "Frango", "Calabresa com Requeijão", "Calabresa", "Atum", "Atum Requeijão"],
        37,
      ).map((p) => ({ ...p, description: BEIRUTE_DESC })),
      { name: "Carne Seca", description: BEIRUTE_DESC, price: 45 },
    ],
    addons: [
      { name: "Acompanhado com Fritas", price: 7 },
      { name: "Acréscimo Cheddar", price: 3 },
    ],
  },
  {
    name: "Porções",
    slug: "porcoes",
    products: [
      porcao("Fritas", 30, 20),
      porcao("Calabresa", 30, 20),
      porcao("Azeitona", 15, 9),
      porcao("Queijo", 30, 20),
      porcao("Fritas com Acompanhamento", 38, 28, "Mussarela derretida, cheddar, requeijão e bacon"),
    ],
  },
  {
    name: "Fogazzas",
    slug: "fogazzas",
    // O cardápio diz "a partir de R$ 10,00": criadas DESATIVADAS até o gerente confirmar os preços.
    products: same(["Pizza", "Calabresa com Queijo", "Frango com Queijo", "Carne com Queijo"], 10).map((p) => ({
      ...p,
      description: "Frita na hora",
      inactive: true,
    })),
  },
  {
    name: "Sucos",
    slug: "sucos",
    products: [
      {
        name: "Suco com Água",
        description: SABORES_SUCO,
        variants: [
          { name: "Copo 400ml", price: 10 },
          { name: "1/2 Litro", price: 15 },
          { name: "1 Litro", price: 22 },
        ],
      },
      {
        name: "Suco com Leite",
        description: SABORES_SUCO,
        variants: [
          { name: "Copo 400ml", price: 11 },
          { name: "1/2 Litro", price: 16 },
          { name: "1 Litro", price: 24 },
        ],
      },
      {
        name: "Laranja Natural",
        variants: [
          { name: "Copo 400ml", price: 12 },
          { name: "1 Litro", price: 24 },
        ],
      },
      {
        name: "Polpa com Laranja",
        description: SABORES_SUCO,
        variants: [
          { name: "Copo 400ml", price: 14 },
          { name: "1/2 Litro", price: 18 },
          { name: "1 Litro", price: 28 },
        ],
      },
    ],
  },
  {
    name: "Refrigerantes e Águas",
    slug: "refrigerantes",
    products: [
      { name: "Coca-Cola 2L", price: 17 },
      { name: "Refrigerante 2L (Sabores)", description: "Informe o sabor nas observações", price: 14 },
      { name: "Coca-Cola 600ml", price: 10 },
      { name: "Refrigerante 1 Litro", description: "Informe o sabor nas observações", price: 12 },
      { name: "H2O", price: 7 },
      { name: "Refrigerante 200ml", description: "Informe o sabor nas observações", price: 3 },
      { name: "Refrigerante Lata", description: "Informe o sabor nas observações", price: 7 },
      { name: "Del Valle Lata", description: "Informe o sabor nas observações", price: 7 },
      { name: "Dolly", price: 9 },
      { name: "Convenção", price: 10 },
      { name: "Schweppes", price: 7 },
      { name: "Água Garrafa 500ml", price: 3 },
      { name: "Água com Gás 500ml", price: 3.5 },
    ],
  },
  {
    name: "Bebidas Alcoólicas (+18)",
    slug: "bebidas-alcoolicas",
    products: [
      { name: "Energético", price: 12 },
      { name: "Caipirinha de Vodka (comum)", price: 14 },
      { name: "Caipirinha de Vodka (Smirnoff)", price: 17 },
      { name: "Caipirinha 51", price: 13 },
      { name: "Caipirinha de Velho Barreiro", price: 13 },
      { name: "Meia de Seda", price: 13 },
      { name: "Espanhola", price: 13 },
      { name: "Batida com Polpa", price: 13 },
      { name: "Chopp de Vinho (600ml)", price: 13 },
    ].map((p) => ({ ...p, description: "Proibido para menores de 18 anos" })),
  },
];

async function seedMenu() {
  for (const [catIndex, cat] of MENU.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: catIndex, allowsHalf: cat.allowsHalf ?? false },
      create: { name: cat.name, slug: cat.slug, sortOrder: catIndex, allowsHalf: cat.allowsHalf ?? false },
    });

    for (const [i, p] of cat.products.entries()) {
      const variants = p.variants ?? [];
      const data = {
        description: p.description ?? null,
        price: variants.length ? 0 : r(p.price ?? 0),
        sortOrder: i,
      };
      // `active` só é definido na criação: re-rodar o seed não desfaz o que o gerente ativou/desativou.
      const product = await prisma.product.upsert({
        where: { categoryId_name: { categoryId: category.id, name: p.name } },
        update: data,
        create: { ...data, name: p.name, categoryId: category.id, active: !p.inactive },
      });

      for (const [vi, v] of variants.entries()) {
        await prisma.productVariant.upsert({
          where: { productId_name: { productId: product.id, name: v.name } },
          update: { price: r(v.price), sortOrder: vi },
          create: { name: v.name, price: r(v.price), sortOrder: vi, productId: product.id },
        });
      }
      await prisma.productVariant.deleteMany({
        where: { productId: product.id, name: { notIn: variants.map((v) => v.name) } },
      });
    }

    // Itens que saíram do cardápio: apaga, ou desativa se já constam em pedidos (preserva o histórico).
    const stale = await prisma.product.findMany({
      where: { categoryId: category.id, name: { notIn: cat.products.map((p) => p.name) } },
      select: { id: true, _count: { select: { orderItems: true } } },
    });
    for (const s of stale) {
      if (s._count.orderItems > 0) await prisma.product.update({ where: { id: s.id }, data: { active: false } });
      else await prisma.product.delete({ where: { id: s.id } });
    }

    const addons = cat.addons ?? [];
    for (const a of addons) {
      await prisma.addon.upsert({
        where: { categoryId_name: { categoryId: category.id, name: a.name } },
        update: { price: r(a.price) },
        create: { name: a.name, price: r(a.price), categoryId: category.id },
      });
    }
    await prisma.addon.deleteMany({
      where: { categoryId: category.id, name: { notIn: addons.map((a) => a.name) } },
    });
  }
}

async function seedSettings() {
  const env = process.env;
  const data = {
    storeName: env.SEED_STORE_NAME || "OrderFlow OS",
    pixKey: env.SEED_PIX_KEY || null,
    pixMerchantName: env.SEED_PIX_MERCHANT_NAME || null,
    pixMerchantCity: env.SEED_PIX_MERCHANT_CITY || null,
    pixHolderName: env.SEED_PIX_HOLDER_NAME || null,
    whatsappNumber: env.SEED_WHATSAPP_NUMBER?.replace(/\D/g, "") || null,
  };
  await prisma.storeSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!email) throw new Error("Defina SEED_ADMIN_EMAIL no .env");
  if (password.length < 12) throw new Error("SEED_ADMIN_PASSWORD precisa ter pelo menos 12 caracteres");

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: process.env.SEED_ADMIN_NAME || "Gerente", role: Role.MANAGER },
  });
}

async function seedTables() {
  const count = Number.parseInt(process.env.TABLE_COUNT ?? "50", 10) || 50;
  for (let number = 1; number <= count; number++) {
    const exists = await prisma.diningTable.findUnique({ where: { number } });
    if (!exists) await prisma.diningTable.create({ data: { number, token: randomBytes(18).toString("base64url") } });
  }
}

async function main() {
  await seedMenu();
  await seedTables();
  await seedSettings();
  await seedAdmin();
  console.log("Seed concluído.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
