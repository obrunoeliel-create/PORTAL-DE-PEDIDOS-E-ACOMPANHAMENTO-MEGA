// Mensagens do robô do WhatsApp: textos padrão e preenchimento das variáveis.
// O texto de cada uma pode ser alterado no portal (tabela WaTemplate) sem mexer no código.

export type TemplateKey =
  | "ORDER_RECEIVED"
  | "ORDER_PREPARING"
  | "ORDER_OUT_FOR_DELIVERY"
  | "ORDER_READY_PICKUP"
  | "ORDER_DELIVERED"
  | "ORDER_PICKED_UP"
  | "ORDER_CANCELED"
  | "RATING_REQUEST"
  | "RATING_THANKS"
  | "COUPON_COMEBACK"
  | "OPT_OUT_CONFIRM"
  | "CLUB_WELCOME"
  | "CLUB_LEVEL_UP"
  | "CLUB_MISSION_DONE"
  | "CLUB_BIRTHDAY"
  | "CLUB_REFERRAL"
  | "CLUB_REDEEMED"
  | "CLUB_POINTS_EXPIRING";

export type TemplateDef = { key: TemplateKey; name: string; when: string; body: string };

const ASSINATURA = "— *Mega Esfiha Jurema* 🍕";

/** WhatsApp oficial da loja (atendimento humano). */
export const HUMAN_WHATSAPP = "(11) 98355-7367";

/** Aviso no fim de TODA mensagem do robô: este número não tem atendimento humano. */
export const AUTO_NOTICE = `🤖 _Este número envia apenas avisos automáticos e não tem atendimento humano. Para falar com a loja, chame no WhatsApp oficial: ${HUMAN_WHATSAPP}_`;

/** Texto final enviado ao cliente: mensagem + aviso de número automático. */
export const withAutoNotice = (text: string) => `${text.trim()}\n\n${AUTO_NOTICE}`;

export const TEMPLATES: TemplateDef[] = [
  {
    key: "ORDER_RECEIVED",
    name: "Pedido recebido",
    when: "Assim que o cliente faz o pedido",
    body: `🍕 Olá, {{nome}}!\n\nRecebemos seu pedido *nº {{pedido}}* no valor de *{{valor}}*.\nEstamos iniciando o atendimento.\n\nAcompanhe pelo portal:\n{{link}}\n\nObrigado por escolher a Mega Esfiha Jurema ❤️`,
  },
  {
    key: "ORDER_PREPARING",
    name: "Pedido em preparação",
    when: "Quando a loja aceita o pedido",
    body: `👨‍🍳 {{nome}}, seu pedido *nº {{pedido}}* foi aceito e nossa equipe já começou a preparar!\nLogo fica pronto.\n\nAcompanhe: {{link}}\n\n${ASSINATURA}`,
  },
  {
    key: "ORDER_OUT_FOR_DELIVERY",
    name: "Saiu para entrega",
    when: "Delivery: quando o motoboy sai",
    body: `Obaaa! {{nome}} , seu pedido saiu para entrega! 🤩 Lembrado que o motoboy saiu com alguns pedidos na frente, mas jajá seu pedido será entregue! bom apetite.\n\n🛵 Tempo estimado: {{tempo}}\nAcompanhe: {{link}}\n\n${ASSINATURA}`,
  },
  {
    key: "ORDER_READY_PICKUP",
    name: "Pronto para retirar",
    when: "Retirada no balcão: quando fica pronto",
    body: `✅ {{nome}}, seu pedido *nº {{pedido}}* está pronto!\nJá pode retirar no balcão da loja.\n\n📍 Av. Jurema, 850 – Parque Jurema\n\n${ASSINATURA}`,
  },
  {
    key: "ORDER_DELIVERED",
    name: "Pedido entregue",
    when: "Delivery: quando o pedido é concluído",
    body: `Pedido *nº {{pedido}}* entregue! 🎉\nObrigado pela preferência, {{nome}} ❤️\nEsperamos você novamente.\n\n{{clube}}\n\n${ASSINATURA}`,
  },
  {
    key: "ORDER_PICKED_UP",
    name: "Pedido retirado",
    when: "Balcão: quando o pedido é concluído",
    body: `Obrigado por retirar seu pedido *nº {{pedido}}*, {{nome}}! ❤️\nBom apetite e volte sempre.\n\n{{clube}}\n\n${ASSINATURA}`,
  },
  {
    key: "ORDER_CANCELED",
    name: "Pedido cancelado",
    when: "Quando a loja cancela o pedido",
    body: `{{nome}}, infelizmente seu pedido *nº {{pedido}}* precisou ser cancelado. 😔\nSe tiver qualquer dúvida, chame a loja no WhatsApp oficial: ${HUMAN_WHATSAPP}\n\n${ASSINATURA}`,
  },
  {
    key: "RATING_REQUEST",
    name: "Pedido de avaliação",
    when: "Horas depois do pedido concluído (configurável)",
    body: `Oi, {{nome}}! Como foi sua experiência com o pedido *nº {{pedido}}*? ⭐\n\nResponda com uma nota de *1 a 5*:\n1 ⭐  2 ⭐⭐  3 ⭐⭐⭐  4 ⭐⭐⭐⭐  5 ⭐⭐⭐⭐⭐\n\nOu avalie pelo link: {{link}}\n\n${ASSINATURA}`,
  },
  {
    key: "RATING_THANKS",
    name: "Agradecimento da avaliação",
    when: "Quando o cliente responde a nota",
    body: `Muito obrigado pela avaliação, {{nome}}! {{estrelas}}\nSua opinião ajuda a gente a melhorar sempre. ❤️`,
  },
  {
    key: "COUPON_COMEBACK",
    name: "Cupom de volta",
    when: "Dias depois do pedido, só para quem aceitou promoções",
    body: `🎁 {{nome}}, que saudade! Preparamos um presente para você voltar:\n\nCupom *{{cupom}}* – *{{desconto}} de desconto* no próximo pedido.\nVálido até {{validade}}.\n\nPeça agora: {{site}}\n\n${ASSINATURA}\n_Para não receber mais promoções, responda SAIR._`,
  },
  {
    key: "OPT_OUT_CONFIRM",
    name: "Confirmação de descadastro",
    when: "Quando o cliente responde SAIR",
    body: `Pronto, {{nome}}. Você não vai mais receber mensagens automáticas da Mega Esfiha Jurema.\nSe mudar de ideia, responda VOLTAR. 🍕`,
  },
  {
    key: "CLUB_WELCOME",
    name: "Clube: boas-vindas",
    when: "Quando o cliente entra no Clube Mega Jurema",
    body: `⭐ Bem-vindo(a) ao *Clube Mega Jurema*, {{nome}}!\n\nQuanto mais você volta, mais vantagens conquista. Você já ganhou *{{pontos}} pontos* de boas-vindas.\n\nCada pedido vale pontos para trocar por esfihas, pizzas, refrigerantes e vales-compras.\nVeja seu cartão: {{clubelink}}\n\n${ASSINATURA}`,
  },
  {
    key: "CLUB_LEVEL_UP",
    name: "Clube: subiu de nível",
    when: "Quando o cliente sobe de nível (Prata, Ouro, Diamante)",
    body: `🎉 Parabéns, {{nome}}! Você agora é *{{nivel}}* no Clube Mega Jurema!\n\n{{beneficio}}\n\nVeja suas vantagens: {{clubelink}}\n\n${ASSINATURA}`,
  },
  {
    key: "CLUB_MISSION_DONE",
    name: "Clube: missão concluída",
    when: "Quando o cliente completa uma missão",
    body: `🎯 Missão cumprida, {{nome}}!\n\n*{{missao}}* → você ganhou *{{pontos}} pontos*.\nSaldo: *{{saldo}} pontos*.\n\nVeja as próximas missões: {{clubelink}}\n\n${ASSINATURA}`,
  },
  {
    key: "CLUB_BIRTHDAY",
    name: "Clube: aniversário",
    when: "No dia do aniversário do cliente",
    body: `🎂 Feliz aniversário, {{nome}}!\n\nA Mega Esfiha Jurema preparou um presente: *{{pontos}} pontos* já estão no seu cartão do clube.\nSaldo: *{{saldo}} pontos*.\n\nComemore com a gente: {{site}}\n\n${ASSINATURA}`,
  },
  {
    key: "CLUB_REFERRAL",
    name: "Clube: indicação confirmada",
    when: "Quando o amigo indicado faz o primeiro pedido",
    body: `👯 {{nome}}, seu amigo(a) {{amigo}} fez o primeiro pedido com a sua indicação!\n\nVocê ganhou *{{pontos}} pontos*. Saldo: *{{saldo}} pontos*.\nIndique mais amigos: {{clubelink}}\n\n${ASSINATURA}`,
  },
  {
    key: "CLUB_REDEEMED",
    name: "Clube: resgate feito",
    when: "Quando o cliente troca pontos por uma recompensa",
    body: `🎁 Resgate confirmado, {{nome}}!\n\n*{{beneficio}}*\nCódigo: *{{cupom}}*\nVálido até {{validade}}.\n\nVales: digite o código no campo de cupom do site. Produtos: mostre o QR Code no caixa ou informe o código ao pedir.\nSeu cartão: {{clubelink}}\n\n${ASSINATURA}`,
  },
  {
    key: "CLUB_POINTS_EXPIRING",
    name: "Clube: pontos vão expirar",
    when: "Dias antes dos pontos expirarem por falta de pedidos",
    body: `⏳ {{nome}}, seus *{{saldo}} pontos* do Clube Mega Jurema expiram em {{validade}}.\n\nFaça um pedido até lá e eles continuam valendo (e você ainda ganha mais)!\n{{site}}\n\n${ASSINATURA}`,
  },
];

export const TEMPLATE_MAP = Object.fromEntries(TEMPLATES.map((t) => [t.key, t])) as Record<TemplateKey, TemplateDef>;

/** Variáveis aceitas nos textos (mostradas no editor). */
export const TEMPLATE_VARS: { v: string; desc: string }[] = [
  { v: "{{nome}}", desc: "Primeiro nome do cliente" },
  { v: "{{pedido}}", desc: "Número do pedido" },
  { v: "{{valor}}", desc: "Total do pedido" },
  { v: "{{link}}", desc: "Link de acompanhamento do pedido" },
  { v: "{{tempo}}", desc: "Tempo estimado de entrega" },
  { v: "{{cupom}}", desc: "Código do cupom" },
  { v: "{{desconto}}", desc: "Desconto do cupom (ex: 10%)" },
  { v: "{{validade}}", desc: "Validade do cupom" },
  { v: "{{site}}", desc: "Endereço do cardápio" },
  { v: "{{estrelas}}", desc: "Nota dada pelo cliente" },
  { v: "{{pontos}}", desc: "Pontos ganhos (clube)" },
  { v: "{{saldo}}", desc: "Saldo de pontos (clube)" },
  { v: "{{nivel}}", desc: "Nível no clube (Bronze, Prata...)" },
  { v: "{{missao}}", desc: "Nome da missão concluída" },
  { v: "{{beneficio}}", desc: "Benefício ou recompensa" },
  { v: "{{amigo}}", desc: "Nome do amigo indicado" },
  { v: "{{clube}}", desc: "Linha com os pontos ganhos no pedido (só para quem é do clube)" },
  { v: "{{clubelink}}", desc: "Link do cartão do clube" },
];

export type TemplateVars = Partial<
  Record<
    "nome" | "pedido" | "valor" | "link" | "tempo" | "cupom" | "desconto" | "validade" | "site" | "estrelas" | "pontos" | "saldo" | "nivel" | "missao" | "beneficio" | "amigo" | "clube" | "clubelink",
    string
  >
>;

/** Troca {{variavel}} pelo valor; variável sem valor vira texto vazio. */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => (vars as Record<string, string | undefined>)[name.toLowerCase()] ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Maria Francisca Brandão" → "Maria". */
export const firstName = (name: string) => (name.trim().split(/\s+/)[0] ?? "").slice(0, 40);
