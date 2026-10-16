import Link from "next/link";
import { getClubConfig, getTiers } from "@/lib/club/core";
import { HUMAN_WHATSAPP } from "@/lib/wa/templates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Regulamento do Clube Mega Jurema" };

/** Regulamento do programa de fidelidade e política de privacidade (os números vêm da configuração atual). */
export default async function ClubRulesPage() {
  const [cfg, tiers] = await Promise.all([getClubConfig(), getTiers()]);
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 text-stone-800">
      <Link href="/clube" className="text-sm font-semibold text-brand-700">
        ← Voltar ao clube
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Regulamento do Clube Mega Jurema</h1>
      <p className="text-sm text-stone-500">Programa de fidelidade da Mega Esfiha Jurema — Av. Jurema, 850, Parque Jurema, Guarulhos/SP.</p>

      <Section title="1. Participação">
        <p>A participação é gratuita e voluntária, para pessoas com cadastro na loja (WhatsApp e senha). Ao entrar, o cliente aceita este regulamento. Pode sair a qualquer momento pedindo à loja; os pontos não usados são cancelados.</p>
      </Section>

      <Section title="2. Pontos">
        <ul>
          <li>
            Cada R$ 1,00 gasto em itens (sem a taxa de entrega e já descontados cupons) vale {cfg.pointsPerReal} {cfg.pointsPerReal === 1 ? "ponto" : "pontos"}, multiplicado pelo bônus do nível.
          </li>
          <li>Os pontos entram quando o pedido é concluído (entregue ou retirado). Pedido cancelado não gera pontos e, se já tiver gerado, eles são estornados.</li>
          <li>Pedidos de delivery e balcão feitos com o mesmo WhatsApp do cadastro contam pontos. Consumo em mesa ainda não gera pontos.</li>
          <li>
            Bônus: {cfg.welcomeBonus} pontos ao entrar; {cfg.profileBonus} ao completar o perfil; {cfg.birthdayBonus} no aniversário (uma vez por ano); {cfg.ratingBonus} por avaliar um pedido;{" "}
            {cfg.referralBonusReferrer} por amigo indicado que fizer o primeiro pedido (o amigo ganha {cfg.referralBonusFriend}).
          </li>
          <li>Campanhas de pontos (dobro, triplo) valem só nos dias, horários e produtos anunciados.</li>
          {cfg.pointsExpiryMonths > 0 && <li>Os pontos expiram se o cliente ficar {cfg.pointsExpiryMonths} meses sem fazer pedidos. Avisamos pelo WhatsApp antes.</li>}
          <li>Pontos não têm valor em dinheiro, não podem ser vendidos, transferidos ou trocados por dinheiro.</li>
        </ul>
      </Section>

      <Section title="3. Níveis">
        <p>O nível é definido pelos pontos ganhos nos últimos 12 meses (resgatar pontos não faz o cliente cair de nível):</p>
        <ul>
          {tiers.map((t) => (
            <li key={t.key}>
              {t.icon} <b>{t.name}</b>: a partir de {t.minPoints} pontos — {t.multiplier > 100 ? `${t.multiplier - 100}% a mais de pontos` : "pontos normais"}.
            </li>
          ))}
        </ul>
      </Section>

      <Section title="4. Recompensas e resgates">
        <ul>
          <li>As recompensas, seus custos em pontos e os níveis exigidos aparecem na página do clube e podem mudar; resgates já feitos continuam valendo.</li>
          <li>Cada resgate gera um código único e um QR Code, válido por {cfg.redemptionValidDays} dias e para um único uso. Vencido, não é reembolsado.</li>
          <li>Vales-compras são usados no campo de cupom do site ou no caixa; produtos são retirados na loja ou informados no pedido. Um resgate por pedido.</li>
          <li>O cliente pode cancelar um resgate ainda não usado; os pontos voltam ao saldo.</li>
        </ul>
      </Section>

      <Section title="5. Uso indevido">
        <p>Cadastros falsos, uso de dados de terceiros ou tentativas de fraude levam ao cancelamento dos pontos e da participação.</p>
      </Section>

      <h2 className="pt-4 font-display text-2xl font-extrabold">Política de privacidade (LGPD)</h2>
      <Section title="Quais dados usamos">
        <p>Nome, WhatsApp, e-mail, cidade, data de nascimento e gênero (opcionais), endereço de entrega, histórico de pedidos, pontos, resgates e avaliações.</p>
      </Section>
      <Section title="Para quê">
        <ul>
          <li>Fazer e entregar seus pedidos e enviar os avisos do pedido (execução do contrato — art. 7º, V, da Lei 13.709/2018).</li>
          <li>Funcionar o clube: pontos, níveis, missões, aniversário e indicações (execução do contrato que você aceitou ao entrar).</li>
          <li>Enviar cupons e promoções pelo WhatsApp somente se você marcou que aceita (consentimento — art. 7º, I). Responda SAIR a qualquer momento.</li>
          <li>Entender preferências (produtos, dias e horários) para melhorar o cardápio e as ofertas, sem vender ou repassar seus dados.</li>
        </ul>
      </Section>
      <Section title="Segurança e prazo">
        <p>Os dados ficam em servidor protegido, com senha guardada de forma criptografada, acesso restrito à equipe da loja e registro das ações sensíveis. O histórico de mensagens é apagado após 180 dias. Os dados do cadastro ficam enquanto você for cliente ou até você pedir a exclusão.</p>
      </Section>
      <Section title="Seus direitos">
        <p>
          Você pode pedir acesso, correção, cópia ou exclusão dos seus dados e retirar o consentimento de promoções, pelo WhatsApp oficial da loja: <b>{HUMAN_WHATSAPP}</b>.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 text-sm leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
      <h2 className="font-display text-lg font-bold text-stone-900">{title}</h2>
      {children}
    </section>
  );
}
