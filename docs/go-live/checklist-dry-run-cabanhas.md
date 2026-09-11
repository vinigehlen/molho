# Checklist — dry run Cabanhas BBQ

**Data-alvo:** 2026-09-11 (confirmar disponibilidade)
**Publicação:** janela de 11/09/2026 autorizada para o sistema operacional do Cabanhas.
`channel.storefront` permanece desligado durante o pré-voo e só é publicado depois que
domínio final, dados operacionais e backoffice estiverem validados.
**PII:** evidências devem usar pedido/cliente de teste e ocultar telefone/endereço.

## Pessoas e dados

- [ ] responsável técnico presente;
- [ ] operador Cabanhas nomeado e contato registrado no plantão;
- [x] PM assumiu `NG-01` e autorizou foco operacional do Cabanhas em 11/09/2026;
- [ ] jurídico amplo pós-corte registrado como não bloqueante do piloto operacional;
- [ ] cardápio, preços, CNPJ, endereço, horários, zonas e mínimo aprovados;
- [ ] chave/instruções PIX e dinheiro/cartão na entrega aprovados;
- [ ] owner real acessa por OTP; nenhum dado de staging foi copiado.

## Pré-voo técnico

- [ ] SHA/RC congelado e deployments READY/revertíveis;
- [ ] API com duas máquinas ready, Redis cross-instance e restore provados;
- [ ] upload R2 e assets no origin final;
- [ ] uptime/fallback operacional com destinatário testado; Sentry completo fica backlog
  futuro (`NG-08`);
- [ ] CSP enforcement sem violação bloqueante e TLS válido;
- [ ] dispositivo de impressão pareado, revogável e sem token de staff.
- [ ] `app.molho.live` abre backoffice/gestão;
- [ ] `cabanhas-bbq.molho.live` abre a loja do Cabanhas;
- [ ] `api.molho.live/ready` ou, se o certificado final não propagar a tempo,
  `molho-api.fly.dev/ready` responde `db=ok` e `redis=ok`.

## Go operacional do canal

- [ ] domínio final da loja validado;
- [ ] dados operacionais aprovados;
- [ ] owner/operador consegue entrar no backoffice;
- [ ] fila de pedidos/gestão acessível;
- [ ] `channel.storefront` publicado;
- [ ] primeiro acesso público confirmado após publicação.

## Jornada física

- [ ] abrir `cabanhas-bbq.molho.live` em celular por Wi-Fi;
- [ ] repetir por 4G;
- [ ] catálogo → carrinho → endereço/retirada → pagamento → aceite → OTP → pedido;
- [ ] pedido aparece no gestor em menos de 3 s;
- [ ] pedido aparece na visão de balcão/gestão correta;
- [ ] mudar status apenas pelos controles autorizados;
- [ ] WhatsApp abre `wa.me` correto;
- [ ] ticket imprime uma vez;
- [ ] manter agente ativo por 60 min e registrar início/fim;
- [ ] reiniciar uma máquina Fly;
- [ ] derrubar/religar impressora ou rede e comprovar recuperação sem duplicidade;
- [ ] comprovar fallback polling/SSE;
- [ ] cancelar o pedido de teste preservando auditoria;
- [ ] executar isolamento tenant A/B;
- [ ] revisar logs/eventos: zero PII, cookie, OTP ou token.

## Evidência e sign-off

Registrar IDs sanitizados do pedido/deployment/release, tempos, screenshots sem PII, foto
do ticket, alerta recebido e resultado de recuperação.

| Papel | Nome | Decisão | Horário |
|---|---|---|---|
| Responsável técnico |  | GO / NO-GO |  |
| Operador Cabanhas |  | GO / NO-GO |  |
| PM |  | GO / NO-GO |  |
| Jurídico amplo | pós-corte | backlog / bloqueia |  |

Qualquer caixa operacional vazia mantém `NG-15` vermelho. Jurídico amplo e Sentry completo
ficam pós-piloto se o PM mantiver o aceite de risco.
