export class TeamMemberNotFoundError extends Error {
  constructor(userId: string) {
    super(`Staff "${userId}" não encontrado(a) neste tenant.`);
    this.name = 'TeamMemberNotFoundError';
  }
}

/** manager (subordinatesOnly) tentando atribuir/revogar owner ou outro manager. */
export class RoleNotManageableError extends Error {
  constructor(role: string) {
    super(`Sem permissão para atribuir ou revogar o papel "${role}".`);
    this.name = 'RoleNotManageableError';
  }
}

export class CannotManageOwnRoleError extends Error {
  constructor() {
    super('Não é possível alterar ou revogar o próprio acesso por aqui.');
    this.name = 'CannotManageOwnRoleError';
  }
}

/** Convite pra e-mail que já tem papel neste tenant — usar a troca de papel, não um novo convite. */
export class AlreadyMemberError extends Error {
  constructor() {
    super('Este e-mail já tem papel neste tenant — use a troca de papel.');
    this.name = 'AlreadyMemberError';
  }
}

/** Revogar o último owner deixaria o tenant sem ninguém pra gerenciar a equipe. */
export class LastOwnerError extends Error {
  constructor() {
    super('Este é o último owner do tenant — atribua outro owner antes de revogar ou trocar o papel.');
    this.name = 'LastOwnerError';
  }
}
