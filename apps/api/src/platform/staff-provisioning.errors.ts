/** scopeId não bate com nenhum tenant/store vivo — 404, nunca deixar virar FK crua (500). */
export class ScopeNotFoundError extends Error {
  constructor(scopeType: 'tenant' | 'store', scopeId: string) {
    super(`${scopeType === 'tenant' ? 'Tenant' : 'Loja'} "${scopeId}" não encontrado(a).`);
    this.name = 'ScopeNotFoundError';
  }
}
