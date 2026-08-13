export class StoreHoursStoreNotFoundError extends Error {
  constructor() {
    super('Loja não encontrada.');
    this.name = 'StoreHoursStoreNotFoundError';
  }
}

export class StoreHoursValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreHoursValidationError';
  }
}
