export class DeliveryZoneNotFoundError extends Error {
  constructor() {
    super('Zona de entrega não encontrada.');
    this.name = 'DeliveryZoneNotFoundError';
  }
}

export class DeliveryZoneConflictError extends Error {
  constructor(message = 'Zona de entrega foi alterada por outra requisição — recarregue e tente de novo.') {
    super(message);
    this.name = 'DeliveryZoneConflictError';
  }
}

export class DeliveryZoneDuplicateCityError extends Error {
  constructor() {
    super('Já existe uma zona para esta cidade e UF nesta loja.');
    this.name = 'DeliveryZoneDuplicateCityError';
  }
}

export class DeliveryZoneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryZoneValidationError';
  }
}
