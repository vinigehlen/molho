/**
 * Placeholder pra `RequestContextService.run({ tenantId, isPlatform: true })`
 * quando a operação é de plataforma e não tem (ou ainda não resolveu) um
 * tenant real — ex.: criar um User (identidade global, sem tenant_id) ou
 * resolver qual tenant corresponde a um slug (busca é cross-tenant por
 * natureza). app_tenant_visible() nunca compara esse valor de verdade
 * quando is_platform=true (o OR já resolve), mas o GUC precisa de um uuid
 * válido pra não estourar o cast em nenhuma tabela com RLS que a operação
 * toque de passagem.
 */
export const PLATFORM_CONTEXT_TENANT_ID = '00000000-0000-0000-0000-000000000000';
