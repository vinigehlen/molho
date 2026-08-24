# Onboarding self-setup — plano de produto a partir do benchmark

Data: 2026-08-23

## Persona

Dono-operador de restaurante brasileiro com delivery próprio, faturamento entre R$ 40 mil e R$ 150 mil por mês, 2 a 8 pessoas na operação e rotina ainda centrada no WhatsApp. Ele quer publicar uma loja digital sem depender de suporte técnico, cadastrar um cardápio completo antes do primeiro pedido e reduzir retrabalho no horário de pico.

## Jornada principal

1. Cadastro por OTP.
2. Criação automática de tenant, owner e primeira loja.
3. Redirecionamento para `/gestor/configuracao`, nunca direto para o painel de pedidos enquanto a loja não estiver publicável.
4. Cadastro de loja: nome fantasia, CNPJ, responsável, telefone, WhatsApp, endereço livre, pedido mínimo e PIX.
5. Horários: edição por dia, loja fechada por dia e múltiplos turnos.
6. Entrega: primeira zona por cidade/UF com taxa e prazo.
7. Cardápio manual como fluxo primário: categoria, produto, descrição, preço base, foto principal, disponibilidade, grupos de variações/adicionais com mínimo/máximo e adicionais com preço.
8. Checklist de publicação: loja, horários, cardápio, entrega e pagamento.
9. Depois de publicável, o lojista pode ir para pedidos e compartilhar a loja.

## Implementado nesta rodada

- `/gestor/configuracao` recriada como wizard operacional de publicação.
- Pós-cadastro direcionado para `/gestor/configuracao`.
- CNPJ persistido em `Tenant.cnpj` via API de setup.
- Nome do responsável persistido em `users.name` do staff autenticado.
- Gestão manual de horários por dia com múltiplos turnos usando `StoreHours`.
- Cadastro manual de categorias e produtos usando as APIs existentes do catálogo.
- Upload de foto principal/galeria de produto usando URL presignada e `ProductImage`.
- Grupos de variações/adicionais com mínimo/máximo e adicionais com preço incremental.
- Cálculo visual de preço final exemplo: preço base + adicionais cadastrados.
- Disponibilidade manual do produto para marcar esgotado/reativar.
- Zona de entrega inicial por cidade/UF com taxa em centavos e ETA.
- PIX no cadastro de loja como requisito de publicação.
- Importação por planilha mantida como atalho secundário, não como fluxo principal.

## Próximas melhorias P0 com migration

Estas melhorias são de MVP, mas exigem evolução de schema, LGPD ou contratos antes de persistirem corretamente.

- Descrição pública da loja.
- Razão social separada do nome fantasia.
- Inscrição estadual opcional.
- Dados estruturados do responsável: CPF opcional, telefone e e-mail financeiro cifrados.
- Endereço estruturado da loja: CEP, rua, número, bairro, cidade, UF, complemento e referência.
- Foto de logo/capa da loja.
- Foto em cada variação/adicional.
- Edição de categoria com descrição, visibilidade e ordenação por arrastar.
- Edição completa de produto existente no wizard, não apenas criação.
- Disponibilidade por categoria/produto por dia e horário.

## Ganhos do benchmark que ficam gateados

O arquivo `docs/11-benchmark-concorrentes.md` lista ganhos importantes, mas alguns conflitam com o escopo MVP se forem ligados agora. Eles devem entrar como módulos/fases, não como comportamento ativo sem entitlement.

- Vídeo curto no produto: diferencial recomendado, P1 do catálogo.
- Galeria rica/múltiplas fotos por produto: base já existe; experiência completa fica P1.
- Promoção simples do item com preço “de/por”: P1, sem cupons no MVP.
- Cross-sell automático: fase posterior.
- Cashback/fidelidade/campanhas: fora do MVP, módulo futuro.
- Cupons avançados: fora do MVP, módulo futuro.
- Split payment: fora do MVP, depende de PSP online.
- Kanban configurável: P2 do gestor, módulo de operação avançada.
- Taxa por rota real: P2, depende de MapsProvider real.
- Auto item sold-out por estoque: P2, depende de controle de estoque.
- Agendamento com capacidade: P1/P2, há base de `StoreSchedulingSlot`, mas precisa fluxo completo no checkout/backoffice.
- Fiscal/NFC-e operacional: fora do MVP; coletar CNPJ é P0, emitir fiscal é add-on futuro.

## Critérios de aceite

- Novo cadastro chega em `/gestor/configuracao`.
- `/gestor/configuracao` responde 200 em staging.
- Lojista preenche dados básicos da loja, CNPJ, responsável, horários, PIX, zona de entrega e cardápio manual sem suporte.
- Horários salvam e recarregam por dia/turno.
- Produto pode ter categoria, descrição, preço, foto e adicionais com preço.
- Valores monetários persistem em centavos.
- Funcionalidades fora do MVP permanecem documentadas e gateadas, não parcialmente ligadas em produção.
