export class InvalidModuleKeyError extends Error {
  constructor(moduleKey: string) {
    super(`Módulo "${moduleKey}" não existe no registry.`);
    this.name = 'InvalidModuleKeyError';
  }
}

export class CoreModuleError extends Error {
  constructor(moduleKey: string) {
    super(`Módulo "${moduleKey}" é core — sempre ligado, não se gerencia por aqui.`);
    this.name = 'CoreModuleError';
  }
}

/** 409: conceder entitled/trial pra um módulo cujas dependências não estão entitled. */
export class MissingRequirementsError extends Error {
  constructor(public readonly missing: readonly string[]) {
    super(`Dependência(s) sem entitlement: ${missing.join(', ')}.`);
    this.name = 'MissingRequirementsError';
  }
}
