import type { Metadata } from 'next';
import { LegalPage } from '../../components/legal-page';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Regras de uso do Molho para restaurantes, trial, assinatura, responsabilidades e cancelamento.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="24 de agosto de 2026">
      <section>
        <h2>Objeto</h2>
        <p>
          O Molho licencia o uso de uma plataforma SaaS para restaurantes criarem cardápio digital, receberem pedidos,
          configurarem entrega, acompanharem a operação e venderem direto para seus clientes.
        </p>
        <p>
          Estes termos são uma versão inicial e devem ser revisados juridicamente antes do go-live comercial.
        </p>
      </section>

      <section>
        <h2>Conta e acesso</h2>
        <p>
          O restaurante é responsável por manter dados corretos, controlar quem acessa o painel e avisar o Molho sobre
          qualquer uso indevido. O acesso pode usar código por e-mail, SMS ou outro canal configurado.
        </p>
      </section>

      <section>
        <h2>Trial, planos e cobrança</h2>
        <p>
          O Molho pode oferecer trial de 7 dias sem cartão. Após o trial, o restaurante escolhe um plano vigente. Os
          preços publicados podem incluir plano mensal, anual, add-ons e regras de reajuste informadas antes da cobrança.
        </p>
      </section>

      <section>
        <h2>Responsabilidades do restaurante</h2>
        <p>
          O restaurante é responsável por cardápio, preços, disponibilidade dos produtos, qualidade dos alimentos,
          atendimento ao cliente, entrega, tributos, obrigações fiscais e políticas comerciais aplicadas aos seus pedidos.
        </p>
      </section>

      <section>
        <h2>Pagamentos e pedidos</h2>
        <p>
          No MVP, o Molho organiza pedidos e pode exibir PIX estático, dinheiro ou cartão na entrega conforme configuração
          da loja. A conferência manual de pagamento e eventual estorno manual são responsabilidade operacional do
          restaurante até que um provedor de pagamento online esteja integrado.
        </p>
      </section>

      <section>
        <h2>Uso aceitável</h2>
        <p>
          Não é permitido usar o Molho para atividade ilegal, violar direitos de terceiros, tentar burlar segurança,
          explorar falhas, enviar spam ou publicar conteúdo enganoso.
        </p>
      </section>

      <section>
        <h2>Disponibilidade e suporte</h2>
        <p>
          O Molho busca manter o serviço estável e seguro, mas pode haver indisponibilidade por manutenção, falhas de
          terceiros, internet do restaurante ou eventos fora do nosso controle.
        </p>
      </section>

      <section>
        <h2>Cancelamento</h2>
        <p>
          O restaurante pode cancelar conforme as regras do plano contratado. Dados operacionais poderão ser mantidos pelo
          período necessário para obrigações legais, segurança, auditoria e exportação.
        </p>
      </section>

      <section>
        <h2>Contato</h2>
        <p>
          Para dúvidas sobre estes termos, escreva para{' '}
          <a href="mailto:contato@molho.live">contato@molho.live</a>.
        </p>
      </section>
    </LegalPage>
  );
}
