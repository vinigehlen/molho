export class SchedulingSlotStoreNotFoundError extends Error {
  constructor() {
    super('Loja não encontrada.');
    this.name = 'SchedulingSlotStoreNotFoundError';
  }
}

export class SchedulingSlotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulingSlotValidationError';
  }
}
