import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Mesa Premiada - Edição de Natal.
 * Em cada dia de evento (sexta, sábado e domingo dentro do período), no horário da campanha (18:00 às 22:30),
 * o próprio sistema sorteia uma mesa ocupada num momento aleatório desse horário; ao pagar no caixa,
 * essa mesa ganha o desconto (conta até o valor do desconto sai de graça).
 * Tudo fica no servidor: nada sobre a mesa sorteada vai para as páginas do cliente antes do pagamento.
 */

const TZ = "America/Sao_Paulo";

/** Dia corrente em Brasília: chave "AAAA-MM-DD", Date (meia-noite UTC desse dia, para colunas DATE) e dia da semana. */
export function brDay(now: Date = new Date()) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  const date = new Date(`${key}T00:00:00.000Z`);
  return { key, date, weekday: date.getUTCDay() };
}

export async function getCampaign() {
  return prisma.campanhaNatal.findUnique({ where: { id: 1 } });
}

type Campaign = NonNullable<Awaited<ReturnType<typeof getCampaign>>>;

/** Hoje é dia de Mesa Premiada? (campanha ativa, dentro do período e num dos dias da semana) */
export function isEventDay(campaign: Campaign | null, day = brDay()): campaign is Campaign {
  return (
    !!campaign &&
    campaign.active &&
    day.date.getTime() >= campaign.startDate.getTime() &&
    day.date.getTime() <= campaign.endDate.getTime() &&
    campaign.weekdays.includes(day.weekday)
  );
}

/** Minutos desde a meia-noite em Brasília (0–1439). */
export function brMinutes(now: Date = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).split(":").map(Number);
  return h * 60 + m;
}

/** "18:00" a partir de 1080. */
export const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Agora está dentro do horário do sorteio (ex: 18:00 às 22:30)? */
export function inDrawWindow(campaign: Campaign, now: Date = new Date()) {
  const m = brMinutes(now);
  return m >= campaign.drawStartMinute && m <= campaign.drawEndMinute;
}

/**
 * Minuto do sorteio automático do dia: aleatório dentro do horário (até 15 min antes do fim, para dar
 * tempo de tentar de novo se não houver mesa ocupada). Calculado com uma chave secreta do servidor:
 * imprevisível para quem está de fora e o mesmo mesmo que o servidor reinicie.
 */
export function scheduledDrawMinute(campaign: Campaign, dayKey: string) {
  const start = campaign.drawStartMinute;
  const span = Math.max(1, campaign.drawEndMinute - 15 - start);
  const secret = process.env.JWT_SECRET ?? "mesa-premiada";
  const n = createHmac("sha256", secret).update(`mesa-premiada:${dayKey}`).digest().readUInt32BE(0);
  return start + (n % span);
}

/** Regra do prêmio: conta maior que o desconto → abate o desconto; conta menor ou igual → sai de graça. */
export function calcPrize(total: number, discount: number) {
  const applied = Math.min(Math.max(total, 0), discount);
  return { original: total, discount: applied, final: total - applied };
}

/** Sorteio de hoje. Se a comanda sorteada deixou de existir sem receber o prêmio, o sorteio é desfeito. */
export async function getTodayDraw(day = brDay()) {
  const draw = await prisma.mesaPremiada.findUnique({ where: { date: day.date } });
  if (draw && !draw.awarded && draw.tableSessionId === null) {
    await prisma.mesaPremiada.delete({ where: { id: draw.id } });
    return null;
  }
  return draw;
}

export class DrawError extends Error {}

/**
 * Sorteia 1 mesa ocupada (comanda aberta com pelo menos um pedido válido) para o dia de hoje.
 * O índice único na data garante uma única mesa por dia mesmo com dois cliques simultâneos.
 */
export async function drawTodayTable(trigger: "AUTO" | "MANUAL", by: string) {
  const day = brDay();
  const campaign = await getCampaign();
  if (!isEventDay(campaign, day)) throw new DrawError("Hoje não é dia de Mesa Premiada.");
  if (!inDrawWindow(campaign)) {
    throw new DrawError(`O sorteio da Mesa Premiada só acontece das ${hhmm(campaign.drawStartMinute)} às ${hhmm(campaign.drawEndMinute)}.`);
  }

  const existing = await getTodayDraw(day);
  if (existing) return existing;

  // Participam só as mesas da faixa da campanha (ex: 1 a 26) que estejam ocupadas agora.
  const occupied = await prisma.tableSession.findMany({
    where: {
      closedAt: null,
      tableNumber: { gte: campaign.minTable, lte: campaign.maxTable },
      orders: { some: { status: { not: "CANCELED" } } },
    },
    select: { id: true, tableNumber: true },
    orderBy: { openedAt: "asc" },
  });
  if (occupied.length === 0) {
    throw new DrawError(`Nenhuma mesa ocupada agora entre a ${campaign.minTable} e a ${campaign.maxTable} para sortear.`);
  }

  // randomInt usa o gerador criptográfico do sistema: sorteio imparcial e imprevisível.
  const winner = occupied[randomInt(occupied.length)];
  try {
    return await prisma.mesaPremiada.create({
      data: { date: day.date, tableNumber: winner.tableNumber, tableSessionId: winner.id, trigger, drawnBy: by },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await prisma.mesaPremiada.findUnique({ where: { date: day.date } });
      if (again) return again;
    }
    throw err;
  }
}

/**
 * Sorteio automático: chamado pelo servidor a cada minuto. Em dia de evento, a partir do minuto
 * sorteado do dia e até o fim do horário, sorteia uma mesa ocupada (se não houver nenhuma ocupada,
 * tenta de novo no minuto seguinte). Devolve o sorteio quando acabou de acontecer.
 */
export async function autoDrawTick(now: Date = new Date()) {
  const day = brDay(now);
  const campaign = await getCampaign();
  if (!isEventDay(campaign, day) || !inDrawWindow(campaign, now)) return null;
  if (brMinutes(now) < scheduledDrawMinute(campaign, day.key)) return null;
  if (await getTodayDraw(day)) return null;
  try {
    return await drawTodayTable("AUTO", "Sistema");
  } catch (err) {
    if (err instanceof DrawError) return null;
    throw err;
  }
}

/** Prêmio pendente desta comanda (sorteada e ainda não paga), com o valor do desconto da campanha. */
export async function pendingPrizeFor(sessionId: string) {
  const draw = await prisma.mesaPremiada.findUnique({ where: { tableSessionId: sessionId } });
  if (!draw || draw.awarded) return null;
  const campaign = await getCampaign();
  return { drawId: draw.id, discount: campaign?.discount ?? 5000 };
}

/** Estado da campanha para o painel da loja (nunca para o cliente). */
export async function campaignStateForStaff() {
  const day = brDay();
  const campaign = await getCampaign();
  const eventDay = isEventDay(campaign, day);
  const draw = eventDay ? await getTodayDraw(day) : null;
  return {
    eventDay,
    drawStart: hhmm(campaign?.drawStartMinute ?? 1080),
    drawEnd: hhmm(campaign?.drawEndMinute ?? 1350),
    inWindow: !!campaign && inDrawWindow(campaign),
    windowOver: !!campaign && brMinutes() > campaign.drawEndMinute,
    name: campaign?.name ?? "Mesa Premiada",
    discount: campaign?.discount ?? 5000,
    minTable: campaign?.minTable ?? 1,
    maxTable: campaign?.maxTable ?? 26,
    draw: draw
      ? { tableNumber: draw.tableNumber, sessionId: draw.tableSessionId, awarded: draw.awarded, trigger: draw.trigger }
      : null,
  };
}

/**
 * Divulgação da campanha no cardápio (dados PÚBLICOS: período, dias, prêmio e mesas participantes).
 * Não inclui nada do sorteio. Devolve null se a campanha estiver desligada ou já tiver terminado.
 */
export async function publicCampaignInfo() {
  const campaign = await getCampaign();
  if (!campaign || !campaign.active) return null;
  const day = brDay();
  const dayMs = 24 * 60 * 60 * 1000;
  if (day.date.getTime() > campaign.endDate.getTime()) return null;
  const started = day.date.getTime() >= campaign.startDate.getTime();
  return {
    name: campaign.name,
    startDate: campaign.startDate.toISOString().slice(0, 10),
    endDate: campaign.endDate.toISOString().slice(0, 10),
    weekdays: campaign.weekdays,
    discount: campaign.discount,
    minTable: campaign.minTable,
    maxTable: campaign.maxTable,
    drawStart: hhmm(campaign.drawStartMinute),
    drawEnd: hhmm(campaign.drawEndMinute),
    started,
    daysToStart: started ? 0 : Math.round((campaign.startDate.getTime() - day.date.getTime()) / dayMs),
    eventToday: isEventDay(campaign, day),
  };
}
