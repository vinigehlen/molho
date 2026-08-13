# Merges pendentes

Registro temporário enquanto o Claude Code está sem créditos. Não fazer merge
automático: o Vinicius revisa e mescla na ordem abaixo.

## Fila a partir da API de zonas

1. `epico-6-api-zona`
   - Commit: `4f27e1c adiciona API admin de zonas de entrega`
   - Base pretendida: `main` em `fbaf98d adiciona contratos de zona e horário do lojista`
   - Território: `apps/api`
   - Conteúdo:
     - `GET /v1/admin/stores/:storeId/delivery-zones`
     - `POST /v1/admin/stores/:storeId/delivery-zones`
     - `PATCH /v1/admin/delivery-zones/:zoneId`
     - `DELETE /v1/admin/delivery-zones/:zoneId`
   - Gate registrado na fatia:
     - `CI=true pnpm lint`
     - `CI=true pnpm test`
     - `CI=true pnpm build`
     - `CI=true pnpm --filter @molho/api run test:e2e`
     - Resultado e2e na ocasião: `9 passed (9)`, `70 passed (70)`, `0 skipped`.

2. `epico-6-api-horario`
   - Commit: `8a6f2fa adiciona API admin de horários da loja`
   - Branch empilhada sobre: `epico-6-api-zona`
   - Dependência de merge: só revisar/mesclar depois de `epico-6-api-zona`.
   - Território: `apps/api`
   - Conteúdo:
     - `GET /v1/admin/stores/:storeId/hours`
     - `PUT /v1/admin/stores/:storeId/hours`
   - Gate registrado na fatia:
     - `CI=true pnpm lint`
     - `CI=true pnpm test`
     - `CI=true pnpm build`
     - `CI=true pnpm --filter @molho/api run test:e2e`
     - Resultado e2e na ocasião: `10 passed (10)`, `75 passed (75)`, `0 skipped`.

3. `epico-6-ui-zona-horario`
   - Commits:
     - `cbc8dce adiciona clients de entrega do backoffice`
     - `9259e28 adiciona tela de zonas e horários no gestor`
   - Branch empilhada sobre: `epico-6-api-horario`
   - Dependência de merge: só revisar/mesclar depois de `epico-6-api-zona` e
     `epico-6-api-horario`.
   - Território: `apps/backoffice`
   - Conteúdo:
     - client de zonas de entrega usando os contratos de admin
     - client de horários da loja usando `GET/PUT /v1/admin/stores/:storeId/hours`
     - rota `/gestor/entrega` para listar/criar/editar/excluir zonas por cidade
     - zonas `polygon` aparecem read-only como "zona por raio — editar via suporte"
     - grade semanal com N turnos por dia, dia fechado sem turnos e turno cruzando
       meia-noite permitido
   - Observação: enquanto o backoffice não expõe seletor/catálogo de lojas, a tela
     recebe o `storeId` manualmente e salva o último valor no `localStorage`.
   - Gate registrado na fatia:
     - `CI=true pnpm --filter @molho/backoffice typecheck`
     - `CI=true pnpm --filter @molho/backoffice test`
     - `CI=true pnpm lint`
     - `CI=true pnpm test`
     - `CI=true pnpm build`
