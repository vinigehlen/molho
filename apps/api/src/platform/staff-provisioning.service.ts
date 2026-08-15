import type { ProvisionStaffInput, ProvisionStaffResponse } from '@molho/contracts';
import { parseEmail } from '@molho/contracts';
import type { StaffProvisioningRepository } from './staff-provisioning.repository';

export interface ProvisioningActor {
  id: string;
  role: string;
}

/**
 * Cria (ou reusa) o User staff e concede o papel+escopo pedido — idempotente:
 * rodar 2x com o MESMO (email, role, scopeType, scopeId) não duplica nada,
 * `created` no response distingue "user novo" de "papel novo" pra quem chama.
 */
export class StaffProvisioningService {
  constructor(private readonly repo: StaffProvisioningRepository) {}

  async provision(input: ProvisionStaffInput, actor: ProvisioningActor): Promise<ProvisionStaffResponse> {
    const email = parseEmail(input.email);
    const { tenantId } = await this.repo.assertScopeExists(input.scopeType, input.scopeId);
    const { id: userId, created: userCreated } = await this.repo.findOrCreateUser(email);

    const alreadyGranted = await this.repo.hasRoleAssignment(userId, input.role, input.scopeType, input.scopeId);
    if (!alreadyGranted) {
      await this.repo.createRoleAssignment(userId, input.role, input.scopeType, input.scopeId);
    }

    await this.repo.recordAuditLog({
      tenantId,
      actorId: actor.id,
      actorRole: actor.role,
      userId,
      role: input.role,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      created: userCreated || !alreadyGranted,
    });

    return {
      userId,
      role: input.role,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      created: !alreadyGranted,
    };
  }
}
