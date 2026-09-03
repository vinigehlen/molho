import { defaultModulesForPlan, moduleDef, parseEmail, slugifyStoreName, type ProvisionTenantInput, type ProvisionTenantResponse } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import { StaffProvisioningRepository } from './staff-provisioning.repository';
import { nextAvailableSlug, normalizeSlugForCreation } from './tenant-slug.util';

const TRIAL_DAYS = 7;

/** Preço mensal à vista travado em docs/02-definicoes-v1.md §"Planos e preços" (D1/D2, 13/07/2026) — mesma fonte que a página de preços. */
const PLAN_PRICE_MONTH_CENTS: Record<ProvisionTenantInput['plan'], number> = {
  standard: 9900,
  pro: 18900,
  premium: 29900,
};
const PLAN_NAME: Record<ProvisionTenantInput['plan'], string> = {
  standard: 'Standard',
  pro: 'Pro',
  premium: 'Premium',
};

export interface ProvisioningActor {
  id: string;
  role: string;
}

/**
 * Provisionamento de tenant PELO SUPER-ADMIN (Épico 14.6) — irmã enxuta de
 * `SignupProvisioningService` (self-signup), reusando o MESMO
 * `StaffProvisioningRepository.findOrCreateUser` pro owner (login por OTP
 * depois é o caminho normal, nunca senha) e o mesmo `nextAvailableSlug`.
 * Diferenças deliberadas: plano é ESCOLHIDO pelo admin (não fixo em
 * 'standard'), sem loja/categoria/produto de exemplo (a loja fechada por
 * venda assistida configura o cardápio de verdade no onboarding, Épico 13,
 * não precisa de dado fake pra demo), e `immediate` decide se os módulos
 * default nascem `trial` (mesmo racional do self-signup) ou `manual/active`
 * (cliente fechado, sem trial).
 */
export class PlatformProvisioningService {
  constructor(private readonly requestContext: RequestContextService) {}

  async provision(input: ProvisionTenantInput, actor: ProvisioningActor): Promise<ProvisionTenantResponse> {
    const client = this.requestContext.getClient();
    const ownerEmail = parseEmail(input.ownerEmail);

    // FK de tenant.planId exige a linha em `plans` — upsert idempotente
    // (mesmo padrão de signup-provisioning.service.ts), nunca assume que o
    // plano escolhido já foi seedado antes.
    await client.plan.upsert({
      where: { id: input.plan },
      update: {},
      create: {
        id: input.plan,
        name: PLAN_NAME[input.plan],
        priceMonthCents: PLAN_PRICE_MONTH_CENTS[input.plan],
        modules: defaultModulesForPlan(input.plan),
      },
    });

    const slug = await nextAvailableSlug(client, normalizeSlugForCreation(slugifyStoreName(input.name)));
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const tenant = await client.tenant.create({
      data: {
        slug,
        name: input.name.trim(),
        planId: input.plan,
        status: input.immediate ? 'active' : 'trial',
        timezone: 'America/Sao_Paulo',
      },
      select: { id: true, slug: true, name: true },
    });
    const store = await client.store.create({
      data: {
        tenantId: tenant.id,
        name: input.name.trim(),
        addressText: 'Configure o endereço da loja',
        timezone: 'America/Sao_Paulo',
      },
      select: { id: true, name: true },
    });

    const staffProvisioning = new StaffProvisioningRepository(this.requestContext);
    const owner = await staffProvisioning.findOrCreateUser(ownerEmail, input.ownerName.trim());
    await staffProvisioning.createRoleAssignment(owner.id, 'owner', 'tenant', tenant.id);

    for (const moduleKey of defaultModulesForPlan(input.plan).filter((key) => !moduleDef(key).core)) {
      await client.tenantEntitlement.create({
        data: input.immediate
          ? { tenantId: tenant.id, moduleKey, source: 'manual', status: 'active' }
          : { tenantId: tenant.id, moduleKey, source: 'trial', status: 'trialing', trialEndsAt },
      });
      await client.tenantSetting.create({ data: { tenantId: tenant.id, moduleKey, enabled: true } });
    }

    await client.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: actor.id,
        actorRole: actor.role,
        action: 'platform.provision_tenant',
        entity: 'tenant',
        afterJson: { plan: input.plan, immediate: input.immediate, ownerUserId: owner.id },
      },
    });

    return {
      tenant,
      store,
      ownerUserId: owner.id,
      ownerCreated: owner.created,
    };
  }
}
