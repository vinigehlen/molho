# Checklist — dry run Cabanhas BBQ

**Data-alvo:** 2026-09-11 (confirmar disponibilidade)
**Publicação:** proibida durante o ensaio; `channel.storefront` permanece desligado.
**PII:** evidências devem usar pedido/cliente de teste e ocultar telefone/endereço.

## Pessoas e dados

- [ ] responsável técnico presente;
- [ ] operador Cabanhas nomeado e contato registrado no plantão;
- [ ] jurídico aprovado;
- [ ] cardápio, preços, CNPJ, endereço, horários, zonas e mínimo aprovados;
- [ ] chave/instruções PIX e dinheiro/cartão na entrega aprovados;
- [ ] owner real acessa por OTP; nenhum dado de staging foi copiado.

## Pré-voo técnico

- [ ] SHA/RC congelado e deployments READY/revertíveis;
- [ ] API com duas máquinas ready, Redis cross-instance e restore provados;
- [ ] upload R2 e assets no origin final;
- [ ] Sentry/uptime/alertas com destinatário testados;
- [ ] CSP enforcement sem violação bloqueante e TLS válido;
- [ ] dispositivo de impressão pareado, revogável e sem token de staff.

## Jornada física

- [ ] abrir `cabanhas-bbq.molho.live` em celular por Wi-Fi;
- [ ] repetir por 4G;
- [ ] catálogo → carrinho → endereço/retirada → pagamento → aceite → OTP → pedido;
- [ ] pedido aparece no gestor em menos de 3 s;
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
| Jurídico |  | aprovado / pendente |  |

Qualquer caixa vazia mantém `NG-15` vermelho. DNS e publicação pertencem ao plano de corte
após `ZG-5`, nunca a este checklist.
