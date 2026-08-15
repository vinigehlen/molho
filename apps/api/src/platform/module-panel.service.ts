import {
  type EntitlementStatusInput,
  type ModuleKey,
  type ModuleStateResponse,
  type SetEntitlementInput,
  MODULE_KEYS,
  isModuleKey,
  missingRequirements,
  moduleDef,
} from '@molho/contracts';
import type { EntitlementSource, EntitlementStatus } from '@molho/db';
import { CoreModuleError, InvalidModuleKeyError, MissingRequirementsError } from './module-panel.errors';
import type { EntitlementRow, ModulePanelRepository } from './module-panel.repository';

const DB_TO_CONTRACT_STATUS: Record<EntitlementStatus, EntitlementStatusInput> = {
  active: 'active',
  trialing: 'trial',
  suspended: 'revoked',
};
const CONTRACT_TO_DB_STATUS: Record<EntitlementStatusInput, EntitlementStatus> = {
  active: 'active',
  trial: 'trialing',
  revoked: 'suspended',
};

/** Toda mudança feita por este endpoint é override manual do super-admin — nunca 'plan'/'addon'/'trial' (esses vêm de onboarding/billing, outro fluxo). */
const MANUAL_SOURCE: EntitlementSource = 'manual';

const ACTION_FOR_STATUS: Record<EntitlementStatusInput, string> = {
  active: 'grant',
  trial: 'trial',
  revoked: 'revoke',
};

export class ModulePanelService {
  constructor(private readonly repo: ModulePanelRepository) {}

  async getModuleStates(tenantId: string): Promise<ModuleStateResponse[]> {
    await this.repo.assertTenantExists(tenantId);

    const [states, entitlements] = await Promise.all([
      this.repo.getModuleStates(tenantId),
      this.repo.getAllEntitlementRows(tenantId),
    ]);

    return MODULE_KEYS.filter((key) => !moduleDef(key).core).map((key) =>
      toResponse(key, states[key]!, entitlements.get(key) ?? null),
    );
  }

  async setEntitlement(
    tenantId: string,
    moduleKeyRaw: string,
    input: SetEntitlementInput,
    actorId: string,
  ): Promise<ModuleStateResponse> {
    if (!isModuleKey(moduleKeyRaw)) throw new InvalidModuleKeyError(moduleKeyRaw);
    const moduleKey = moduleKeyRaw;
    const def = moduleDef(moduleKey);
    if (def.core) throw new CoreModuleError(moduleKey);

    await this.repo.assertTenantExists(tenantId);

    // revoke sempre ok, mesmo com dependentes pendurados nele — é o super-admin
    // tirando um direito, não o lojista tentando ligar algo sem base.
    if (input.status !== 'revoked') {
      const entitledKeys = await this.repo.getEntitledModuleKeys(tenantId);
      const missing = missingRequirements(moduleKey, entitledKeys);
      if (missing.length > 0) throw new MissingRequirementsError(missing);
    }

    await this.repo.upsertEntitlement(tenantId, moduleKey, {
      source: MANUAL_SOURCE,
      status: CONTRACT_TO_DB_STATUS[input.status],
      // .trialEndsAt! : setEntitlementSchema.refine já garante presença sse status='trial'.
      trialEndsAt: input.status === 'trial' ? new Date(input.trialEndsAt!) : null,
    });
    await this.repo.recordModuleAudit(tenantId, moduleKey, actorId, ACTION_FOR_STATUS[input.status]);

    const [state, row] = await Promise.all([
      this.repo.getModuleState(tenantId, moduleKey),
      this.repo.getEntitlementRow(tenantId, moduleKey),
    ]);
    return toResponse(moduleKey, state, row);
  }
}

function toResponse(
  moduleKey: ModuleKey,
  state: { entitled: boolean; enabled: boolean; released: boolean; active: boolean },
  row: EntitlementRow | null,
): ModuleStateResponse {
  const def = moduleDef(moduleKey);
  return {
    moduleKey,
    entitled: state.entitled,
    enabled: state.enabled,
    released: state.released,
    active: state.active,
    source: row?.source ?? null,
    status: row ? DB_TO_CONTRACT_STATUS[row.status] : null,
    trialEndsAt: row?.trialEndsAt?.toISOString() ?? null,
    plans: [...(def.plans ?? [])],
    requires: [...(def.requires ?? [])],
    addon: def.addon === true,
  };
}
