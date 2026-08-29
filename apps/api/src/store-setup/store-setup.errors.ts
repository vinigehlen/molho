export class StoreSetupNotFoundError extends Error {
  constructor() {
    super('Loja não encontrada.');
  }
}

export class StoreSetupValidationError extends Error {}
