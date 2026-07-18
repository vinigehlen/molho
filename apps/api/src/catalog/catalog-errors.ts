/** version do payload ficou pra trás do version da linha — outra requisição já alterou. */
export class CatalogConflictError extends Error {
  constructor(entity: string) {
    super(`${entity} foi alterado por outra requisição — recarregue e tente de novo.`);
    this.name = 'CatalogConflictError';
  }
}

/** Linha não existe, está soft-deleted, ou pertence a outro tenant (RLS torna as duas últimas indistinguíveis de propósito). */
export class CatalogNotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} não encontrado.`);
    this.name = 'CatalogNotFoundError';
  }
}

/** Regra de negócio violada antes de tocar o banco (preço negativo, min > max...). */
export class CatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogValidationError';
  }
}
