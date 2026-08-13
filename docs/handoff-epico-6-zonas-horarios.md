# Handoff — Épico 6: zonas e horários

Este documento resume o que ficou pronto enquanto o Claude Code estava sem créditos.
Não fazer merge automático: o Vinicius revisa e mescla na ordem abaixo.

## Ordem obrigatória de revisão e merge

1. `epico-6-api-zona`
2. `epico-6-api-horario`
3. `epico-6-ui-zona-horario`

As branches são empilhadas. A UI depende dos endpoints de zona e horário.

## 1. API de zonas

- Branch: `epico-6-api-zona`
- Base pretendida: `main` em `fbaf98d adiciona contratos de zona e horário do lojista`
- Commit: `4f27e1c adiciona API admin de zonas de entrega`
- Território: `apps/api`
- Não mexeu em `packages/contracts` nem `packages/db`.

### Entregue

- `GET /v1/admin/stores/:storeId/delivery-zones`
- `POST /v1/admin/stores/:storeId/delivery-zones`
- `PATCH /v1/admin/delivery-zones/:zoneId`
- `DELETE /v1/admin/delivery-zones/:zoneId`

### Regras implementadas

- staff auth + tenant + permissão admin seguindo a convenção existente
- validação server-side espelhando o contrato
- XOR entre zona por cidade e zona por polígono
- `feeCents >= 0`
- `etaMinMinutes <= etaMaxMinutes`
- `priority >= 0`
- duplicata por `molho_city_key(city)+state` no mesmo tenant/store retorna 409
- delete é soft-delete via `deletedAt`

### Gate registrado

- `CI=true pnpm lint`
- `CI=true pnpm test`
- `CI=true pnpm build`
- `CI=true pnpm --filter @molho/api run test:e2e`
- Resultado e2e na ocasião: `9 passed (9)`, `70 passed (70)`, `0 skipped`.

## 2. API de horários

- Branch: `epico-6-api-horario`
- Branch empilhada sobre: `epico-6-api-zona`
- Commit: `8a6f2fa adiciona API admin de horários da loja`
- Território: `apps/api`
- Não mexeu em `packages/contracts` nem `packages/db`.

### Entregue

- `GET /v1/admin/stores/:storeId/hours`
- `PUT /v1/admin/stores/:storeId/hours`

### Regras implementadas

- `PUT` salva o conjunto inteiro de turnos
- dia sem turnos representa loja fechada
- múltiplos turnos por dia
- turno cruzando meia-noite permitido (`closesAtMinutes < opensAtMinutes`)
- validação pelo contrato já existente

### Gate registrado

- `CI=true pnpm lint`
- `CI=true pnpm test`
- `CI=true pnpm build`
- `CI=true pnpm --filter @molho/api run test:e2e`
- Resultado e2e na ocasião: `10 passed (10)`, `75 passed (75)`, `0 skipped`.

## 3. UI de zonas e horários

- Branch: `epico-6-ui-zona-horario`
- Branch empilhada sobre: `epico-6-api-horario`
- Commits:
  - `cbc8dce adiciona clients de entrega do backoffice`
  - `9259e28 adiciona tela de zonas e horários no gestor`
- Território: `apps/backoffice`
- Importa contratos existentes de `@molho/contracts`.
- Não mexeu em API, DB, deploy nem contratos.

### Entregue

- rota `/gestor/entrega`
- atalho `🛵 Entrega` na tela do gestor
- client de zonas:
  - `fetchDeliveryZones`
  - `createDeliveryZone`
  - `updateDeliveryZone`
  - `deleteDeliveryZone`
- client de horários:
  - `fetchStoreHours`
  - `saveStoreHours`
- testes unitários dos clients

### UX implementada

- zonas por cidade:
  - listar
  - criar
  - editar
  - excluir
  - campos: `name`, `city`, `UF`, `feeCents`, `etaMin`, `etaMax`, `priority`
- zonas `polygon`:
  - aparecem read-only
  - microcopy: `zona por raio — editar via suporte`
- erro 409:
  - vira mensagem legível de duplicata
  - não mostra erro cru
- horários:
  - grade semanal
  - N turnos por dia
  - adicionar/remover turno
  - remover todos os turnos = fechado
  - turno cruzando meia-noite permitido
  - salvar envia `PUT` do conjunto inteiro

### Limitação temporária

O backoffice ainda não expõe um seletor/catálogo de lojas para a tela descobrir o
`storeId` automaticamente. Para não sair do território `apps/backoffice`, a tela
recebe o `storeId` manualmente e salva o último valor no `localStorage`.

Quando staff auth/seletor de loja entrar, substituir esse input temporário pelo
wiring real.

### Gate registrado

- `CI=true pnpm --filter @molho/backoffice typecheck`
- `CI=true pnpm --filter @molho/backoffice test`
- `CI=true pnpm lint`
- `CI=true pnpm test`
- `CI=true pnpm build`

Resultado relevante do último gate raiz:

```text
@molho/api:test:
Test Files  57 passed (57)
Tests       402 passed (402)

pnpm build:
Tasks: 6 successful, 6 total
```

## Checklist sugerido para revisão manual

Depois dos merges em ordem:

1. Abrir `/gestor/entrega`.
2. Informar um `storeId` real.
3. Criar zona por cidade.
4. Tentar criar duplicata na mesma cidade/UF e confirmar 409 legível.
5. Editar taxa, ETA e prioridade.
6. Excluir zona e confirmar soft-delete pela API.
7. Salvar horários com:
   - dia fechado
   - múltiplos turnos no mesmo dia
   - turno cruzando meia-noite
8. Validar no checkout/storefront se zona + horário seguem influenciando a disponibilidade.

