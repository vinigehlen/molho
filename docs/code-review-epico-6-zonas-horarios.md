# Code review — Épico 6: zonas e horários

Data da revisão: 14 de agosto de 2026
Branch revisada: `epico-6-ui-zona-horario`
Comparação principal: `main...epico-6-ui-zona-horario`

## 1. Objetivo

Este documento consolida as análises independentes de:

- QA e integração, com foco em comportamento funcional, isolamento por tenant,
  RBAC, concorrência, contratos HTTP e cobertura de testes;
- UI/UX, com foco em segurança operacional, responsividade, acessibilidade,
  estados assíncronos, clareza da interface e aderência ao design system Tempero;
- checklist React/Next da Vercel, cobrindo estrutura de componentes, hooks,
  renderização, acessibilidade, estado e tipagem.

A revisão foi estritamente de leitura. Nenhum código foi corrigido e nenhum
commit foi criado durante a análise.

## 2. Escopo revisado

### API de zonas

- `apps/api/src/delivery-zones/`
- endpoints de listar, criar, atualizar e excluir zonas;
- validação do contrato, RLS, soft-delete, duplicidade por cidade/UF e
  optimistic locking;
- testes e2e da API de zonas.

### API de horários

- `apps/api/src/store-hours-admin/`
- endpoints `GET` e `PUT` do conjunto semanal;
- atomicidade, concorrência, turnos noturnos e validação de sobreposição;
- testes e2e da API de horários.

### Backoffice

- `apps/backoffice/app/gestor/entrega/page.tsx`;
- link de acesso em `apps/backoffice/app/gestor/page.tsx`;
- clients em `apps/backoffice/lib/delivery-zones-api.ts` e
  `apps/backoffice/lib/store-hours-api.ts`;
- persistência temporária do `storeId`;
- testes unitários dos clients.

### Contratos e documentação consultados

- `packages/contracts/src/delivery-zone-admin.ts`;
- `packages/contracts/src/store-hours-admin.ts`;
- `packages/contracts/src/permissions.ts`;
- `packages/contracts/src/modules.ts`;
- `packages/db/prisma/schema.prisma`;
- `docs/04-brand-design-system.md`;
- `docs/handoff-epico-6-zonas-horarios.md`;
- regras de arquitetura e trabalho do repositório.

## 3. Parecer executivo

Não foi encontrado nenhum problema P0. Foram encontrados cinco problemas P1
que devem bloquear o merge:

1. a UI pode salvar dados na loja errada;
2. o optimistic lock de zonas está inoperante;
3. dois `PUT`s concorrentes de horários podem misturar os conjuntos;
4. o módulo opcional de zonas está acoplado aos horários core;
5. alterações feitas durante uma requisição podem ser apagadas silenciosamente.

Os requisitos funcionais básicos estão representados: zona por cidade
editável, zona `polygon` somente leitura na UI, tratamento legível da
duplicidade 409, N turnos por dia, dia fechado e turno atravessando
meia-noite. Entretanto, os riscos de gravação incorreta, concorrência e
modularidade tornam a fatia inadequada para merge no estado atual.

Recomendação: **não mesclar antes de resolver todos os P1 e adicionar os testes
de regressão correspondentes**.

## 4. Achados P1 — bloqueadores

### P1.1 — A tela pode salvar na loja errada

Arquivos:

- `apps/backoffice/app/gestor/entrega/page.tsx:105`;
- `apps/backoffice/app/gestor/entrega/page.tsx:121`;
- `apps/backoffice/app/gestor/entrega/page.tsx:143`;
- `apps/backoffice/app/gestor/entrega/page.tsx:185`.

O campo digitável `storeId` e a loja efetivamente carregada, representada por
`loadedStoreId`, são estados independentes. Após carregar a loja A, o operador
pode digitar B sem clicar em “Carregar”. A tela continua habilitada e as
gravações usam A enquanto o campo exibe B.

O mesmo ocorre quando a carga de B falha: o código mantém os dados e o
`loadedStoreId` anteriores. Criação de zona e salvamento de horários continuam
apontando para A; edição e exclusão conservam IDs de zonas de A.

#### Reprodução

1. Carregar a loja A.
2. Alterar o campo para o ID da loja B.
3. Não carregar B, ou provocar uma falha na carga.
4. Criar uma zona ou salvar horários.
5. A alteração é aplicada silenciosamente na loja A.

#### Impacto

Configuração operacional aplicada ao tenant/loja errada, com possível mudança
indevida de cobertura, taxa e disponibilidade do checkout.

#### Correção recomendada

- exibir a loja ativa de forma explícita e imutável;
- invalidar ou desabilitar os editores quando
  `storeId.trim() !== loadedStoreId`;
- limpar o contexto anterior ao iniciar uma troca e após uma carga que falhar;
- separar o valor digitado do seletor da identidade confirmada da loja;
- adicionar teste de componente para troca, divergência e falha de carga.

### P1.2 — O optimistic lock de `DeliveryZone` está inoperante

Arquivos:

- `apps/api/src/delivery-zones/delivery-zone.repository.ts:136`;
- `apps/api/src/delivery-zones/delivery-zone.repository.ts:144`;
- `apps/api/src/delivery-zones/delivery-zone.repository.ts:187`;
- `apps/api/src/delivery-zones/delivery-zone.repository.ts:223`;
- `packages/db/prisma/schema.prisma:534`.

A tabela possui `version`, e as mutações incrementam essa coluna, mas nenhum
update/delete recebe ou compara uma versão esperada. O filtro usa apenas o ID e
`deleted_at IS NULL`.

Consequentemente, dois gestores podem carregar a mesma versão, editar e receber
sucesso. A última resposta sobrescreve a primeira. O
`DeliveryZoneConflictError` é praticamente inalcançável: sem filtro por
`version`, zero linhas significa registro ausente, não conflito de edição.

#### Impacto

Atualização perdida e falsa confirmação de sucesso em edição concorrente.

#### Correção recomendada

- incluir `version` no contrato de resposta e nas mutações;
- executar `UPDATE ... WHERE id = ? AND version = ? AND deleted_at IS NULL`;
- devolver 409 quando nenhuma linha for afetada e a zona ainda existir;
- aplicar a mesma regra ao soft-delete;
- testar duas mutações concorrentes com a mesma versão.

Essa correção exige coordenação com o dono de `packages/contracts`; não deve ser
feita unilateralmente na branch atual.

### P1.3 — Dois PUTs concorrentes de horários podem misturar conjuntos

Arquivo: `apps/api/src/store-hours-admin/store-hours-admin.repository.ts:23`.

O replace marca as linhas atuais como apagadas e depois insere o novo conjunto.
A transação do request torna cada operação individualmente atômica, mas não
serializa duas substituições concorrentes da mesma loja.

Sob `READ COMMITTED`, duas transações podem não enxergar as inserções uma da
outra e ambas inserirem seus turnos. O resultado pode ser a união dos dois
conjuntos, violando a semântica de `PUT` integral.

#### Impacto

Horários persistidos não correspondem a nenhuma das configurações confirmadas
pelos operadores.

#### Correção recomendada

- antes do replace, executar `SELECT ... FOR UPDATE` sobre a linha da loja;
- manter update e inserção dentro da mesma transação do request;
- adicionar e2e com dois `PUT`s concorrentes;
- avaliar uma revisão agregada para também impedir sobrescrita silenciosa de um
  formulário antigo.

### P1.4 — Módulo desligado bloqueia também os horários core

Arquivos:

- `apps/backoffice/app/gestor/page.tsx:175`;
- `apps/backoffice/app/gestor/entrega/page.tsx:130`;
- `apps/api/src/delivery-zones/delivery-zone.controller.ts:43`;
- `apps/api/src/store-hours-admin/store-hours-admin.controller.ts:28`.

O link “Entrega” foi adicionado diretamente à navegação, sem ser gerado pelo
registry ou protegido por um gate de módulo. Na página, zonas e horários são
carregados juntos por `Promise.all`.

Se `delivery.zones` estiver desligado, o endpoint de zonas retorna 403 e a
Promise inteira falha. Isso impede carregar horários, embora a API de horários
esteja corretamente sob o módulo core `catalog`.

#### Impacto

Um módulo opcional desligado se torna destrutivo e bloqueia uma configuração
core, violando a regra de modularidade do produto.

#### Correção recomendada

- gerar ou gatear o link conforme o registry de módulos;
- aplicar o gate apenas ao painel de zonas;
- carregar zonas e horários separadamente;
- manter loading, erro e vazio independentes por painel;
- testar explicitamente o perfil “somente core”.

### P1.5 — Alterações feitas durante o salvamento são apagadas

Arquivos:

- `apps/backoffice/app/gestor/entrega/page.tsx:148`;
- `apps/backoffice/app/gestor/entrega/page.tsx:162`;
- `apps/backoffice/app/gestor/entrega/page.tsx:190`;
- `apps/backoffice/app/gestor/entrega/page.tsx:194`.

Durante POST/PUT, os inputs e as ações “Adicionar turno” e “Remover” continuam
ativos. Quando a resposta chega, `setZoneForm(EMPTY_ZONE_FORM)` ou
`setShifts(...)` substitui o estado completo.

Qualquer edição feita depois do clique em salvar desaparece silenciosamente. A
carga de outra loja também pode descartar alterações locais sem aviso.

#### Correção recomendada

- bloquear o editor correspondente durante a requisição;
- usar estados de salvamento independentes por painel e por linha quando
  aplicável;
- manter um estado `dirty`;
- confirmar antes de trocar de loja ou sair com alterações pendentes;
- alternativamente, reconciliar a resposta contra um snapshot versionado.

## 5. Achados P2 — necessários antes de considerar a fatia pronta

### P2.1 — Sobreposição de turnos não é validada

Arquivos:

- `packages/contracts/src/store-hours-admin.ts:7`;
- `apps/api/src/store-hours-admin/store-hours-admin.service.ts:17`.

O contrato deixa deliberadamente a validação de sobreposição para o servidor,
mas o service verifica apenas abertura igual ao fechamento. Turnos duplicados
ou como segunda 11h–14h e segunda 12h–15h são aceitos.

A validação precisa transformar os turnos em intervalos semanais e considerar
os que atravessam meia-noite, inclusive a colisão com o turno do dia seguinte.
Casos inválidos devem retornar 400 legível.

### P2.2 — UUID e geometria inválidos podem virar 500

Arquivos:

- `apps/api/src/delivery-zones/delivery-zone.controller.ts:65`;
- `apps/api/src/delivery-zones/delivery-zone.repository.ts:162`;
- `apps/api/src/delivery-zones/delivery-zone.repository.ts:182`;
- `apps/api/src/delivery-zones/delivery-zone.repository.ts:202`.

Os parâmetros não passam por validação de UUID antes de chegarem a casts SQL.
Além disso, o contrato valida a forma superficial do GeoJSON, mas anel aberto,
coordenada inválida ou geometria rejeitada pelo PostGIS pode escapar como erro
interno.

Recomendação:

- validar UUID nos controllers;
- validar fechamento e faixa das coordenadas;
- traduzir erros conhecidos do PostGIS para
  `DeliveryZoneValidationError`/HTTP 400;
- adicionar e2e para UUID inválido, anel aberto e coordenadas inválidas.

### P2.3 — Exclusão operacional em um clique

Arquivos:

- `apps/backoffice/app/gestor/entrega/page.tsx:172`;
- `apps/backoffice/app/gestor/entrega/page.tsx:424`.

Uma zona é excluída no primeiro toque, sem confirmação, desfazer ou estado
pendente por registro. O botão continua clicável durante o DELETE, permitindo
chamadas duplicadas.

Como a exclusão altera imediatamente a cobertura do checkout, recomenda-se:

- confirmação explícita com nome, cidade e UF;
- estado pendente apenas para a zona sendo removida;
- desabilitar chamadas duplicadas;
- oferecer desfazer se houver fluxo seguro para isso.

### P2.4 — Validação local incompleta e mensagens genéricas

Arquivos:

- `apps/backoffice/app/gestor/entrega/page.tsx:92`;
- `apps/backoffice/app/gestor/entrega/page.tsx:152`;
- `apps/backoffice/lib/store-hours-api.ts:14`;
- `apps/backoffice/lib/delivery-zones-api.ts:26`.

Nome/cidade vazios, UF inválida, números fracionários ou negativos e horários
iguais podem chegar ao servidor. Valores `NaN` podem ser serializados como
`null`. Fora do caso especializado de duplicidade 409, os clients descartam a
mensagem do backend e mostram apenas o status HTTP.

Recomendação:

- validar com `createDeliveryZoneSchema` e `putStoreHoursSchema.safeParse`;
- mostrar erros junto ao campo correspondente;
- preservar mensagens seguras e legíveis do backend em todo 4xx;
- manter uma mensagem global apenas para falhas não associadas a um campo.

### P2.5 — Divergências de acessibilidade e Tempero

Referências:

- `apps/backoffice/app/gestor/entrega/page.tsx:279`;
- `apps/backoffice/app/gestor/entrega/page.tsx:331`;
- `apps/backoffice/app/gestor/entrega/page.tsx:398`;
- `docs/04-brand-design-system.md:278`;
- `docs/04-brand-design-system.md:309`.

Foram observados:

- campos com `border-border`, embora inputs exijam `border-border-strong`;
- ausência de foco visível consistente;
- controles abaixo do alvo mínimo de 44 px;
- uso de `disabled:opacity-50`, proibido pelo Tempero;
- estados críticos que não usam os tokens fortes previstos;
- seletor de loja sem label visual permanente.

Recomendação: reutilizar `MoInput`, `MoButton` e componentes Tempero ou replicar
integralmente seus tokens, tamanhos e estados.

### P2.6 — Risco de overflow no mobile

Arquivos:

- `apps/backoffice/app/gestor/entrega/page.tsx:519`;
- `apps/backoffice/app/gestor/page.tsx:150`.

Cada turno mantém dois campos de hora e o botão “Remover” em três colunas
rígidas, inclusive em 320–375 px. O cabeçalho do gestor também acumula links
sem `wrap` ou menu compacto.

Recomendação:

- empilhar a ação de remover em uma segunda linha no mobile;
- garantir alvos de toque de pelo menos 44 px;
- permitir `wrap` nos atalhos ou adotar menu compacto;
- validar em 320, 375, 768 e desktop.

### P2.7 — Fluxos de interação sem testes

Arquivos:

- `apps/backoffice/lib/delivery-zones-api.test.ts`;
- `apps/backoffice/lib/store-hours-api.test.ts`.

Os testes atuais verificam principalmente URL, método e payload dos clients.
Não cobrem:

- troca ou falha de loja;
- divergência entre loja digitada e loja ativa;
- edição durante salvamento;
- módulo `delivery.zones` desligado;
- confirmação e repetição de exclusão;
- validação de campos;
- N turnos, dia fechado e virada de meia-noite na UI;
- responsividade e acessibilidade.

Recomendação: adicionar testes de componente com Testing Library e pelo menos
um fluxo Playwright em viewport mobile.

## 6. Achado P3 — qualidade dos mocks e fronteira do contrato

### P3.1 — Testes aceitam respostas incompatíveis com o contrato

Arquivos:

- `apps/backoffice/lib/delivery-zones-api.test.ts:22`;
- `apps/backoffice/lib/delivery-zones-api.ts:26`.

O mock de listagem usa um ID que não é UUID e omite campos obrigatórios. Isso
passa porque o client faz cast TypeScript sem validar o response schema em
runtime.

Recomendação:

- construir fixtures válidas pelos schemas compartilhados;
- validar respostas na fronteira com os schemas de response ou, no mínimo,
  validar todas as fixtures dos testes;
- testar explicitamente resposta incompatível e mensagem de falha segura.

## 7. Observações de UI não bloqueantes

- “Uma cidade por loja” sugere que só uma cidade pode ser atendida. Preferir
  “Uma zona por cidade e UF”.
- “ETA mínimo/máximo” é jargão. Preferir “Prazo mínimo/máximo (min)”.
- Listas vazias não apresentam `MoEmptyState`.
- A carga troca apenas o texto do botão; falta skeleton do conteúdo.
- Ao clicar em “Editar” numa zona distante, o formulário no topo não recebe
  foco nem entra em vista.

## 8. Verificações executadas durante o review

Foram executados, sem alterações de código:

```text
CI=true pnpm --filter @molho/backoffice test
CI=true pnpm --filter @molho/backoffice typecheck
CI=true pnpm --filter @molho/api test
```

Resultados:

- backoffice: 14 arquivos e 68 testes aprovados;
- typecheck do backoffice aprovado;
- API unitária: 57 arquivos e 402 testes aprovados.

Esses resultados não invalidam os achados: os problemas principais estão em
fluxos de interação, modularidade e concorrência não cobertos pelos testes
atuais.

O e2e real e o build completo não foram repetidos nesta revisão read-only. Os
resultados anteriores permanecem registrados no handoff, mas todo commit de
correção deverá executar novamente o gate completo.

## 9. Ordem recomendada de correção

1. impedir divergência entre loja exibida e loja gravada;
2. serializar o replace de horários por loja;
3. separar os carregamentos e aplicar corretamente o gate modular;
4. impedir perda de edição durante save e troca de loja;
5. coordenar com o dono de contracts o optimistic lock de zonas;
6. validar sobreposição de turnos e entradas inválidas da API;
7. corrigir confirmação de exclusão, validação local, acessibilidade e mobile;
8. adicionar testes de componente, concorrência e perfil core-only;
9. executar `pnpm lint && pnpm test && pnpm build` e os e2e reais da API.

## 10. Critério sugerido para liberar o merge

O merge deve ser considerado somente quando:

- todos os P1 estiverem corrigidos e cobertos por testes;
- o perfil com `delivery.zones` desligado mantiver horários funcionais;
- dois PUTs concorrentes não produzirem mistura de turnos;
- edições concorrentes de zona retornarem 409 em vez de sobrescrever;
- a UI não puder salvar em loja diferente da apresentada como ativa;
- o fluxo mobile estiver funcional e sem overflow;
- o gate completo e os e2e reais passarem sem skips de bootstrap.
