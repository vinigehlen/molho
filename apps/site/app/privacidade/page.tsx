import type { Metadata } from 'next';
import { LegalPage } from '../../components/legal-page';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Como o Molho trata dados de restaurantes e clientes no cardápio digital, checkout e gestor de pedidos.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="24 de agosto de 2026">
      <section>
        <h2>Quem somos</h2>
        <p>
          O Molho é uma plataforma SaaS para restaurantes criarem cardápio digital, receberem pedidos, organizarem a
          operação e venderem direto, sem comissão por venda.
        </p>
        <p>
          Esta política explica como tratamos dados no site institucional e no produto. É uma versão inicial e deve ser
          revisada juridicamente antes do go-live comercial.
        </p>
      </section>

      <section>
        <h2>Dados que tratamos</h2>
        <p>
          Podemos tratar dados de contato do restaurante, dados cadastrais do responsável pela conta, dados de acesso,
          dados de configuração da loja, cardápio, pedidos, pagamentos informados pelo restaurante e informações técnicas
          de uso do serviço.
        </p>
        <p>
          No checkout do cliente final, o restaurante é o controlador dos dados do cliente. O Molho atua como operador,
          processando os dados necessários para criar o pedido, calcular entrega, exibir acompanhamento e manter histórico
          operacional.
        </p>
      </section>

      <section>
        <h2>Para que usamos</h2>
        <p>
          Usamos dados para criar e manter contas, publicar lojas, processar pedidos, proteger sessões, prevenir abuso,
          prestar suporte, cumprir obrigações legais e melhorar a experiência do produto.
        </p>
      </section>

      <section>
        <h2>Cookies e analytics</h2>
        <p>
          Cookies essenciais mantêm o site e o produto funcionando. Quando analytics público estiver habilitado, pediremos
          consentimento antes de usar cookies não essenciais para medir navegação e melhorar o funil de cadastro.
        </p>
      </section>

      <section>
        <h2>Compartilhamento</h2>
        <p>
          Podemos usar fornecedores de infraestrutura, banco de dados, e-mail, SMS, armazenamento, pagamentos e
          observabilidade. Esses fornecedores recebem apenas o necessário para executar suas funções.
        </p>
      </section>

      <section>
        <h2>Segurança</h2>
        <p>
          O Molho usa controles técnicos como autenticação por código, sessões protegidas, isolamento por tenant,
          criptografia de dados sensíveis quando aplicável e políticas de acesso restrito.
        </p>
      </section>

      <section>
        <h2>Seus direitos</h2>
        <p>
          Titulares podem solicitar acesso, correção, exclusão, portabilidade, informação sobre compartilhamento e revisão
          de consentimentos, conforme a LGPD.
        </p>
      </section>

      <section>
        <h2>Contato</h2>
        <p>
          Para falar sobre privacidade, escreva para{' '}
          <a href="mailto:contato@molho.live">contato@molho.live</a>.
        </p>
      </section>
    </LegalPage>
  );
}
