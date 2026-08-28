import {
  defaultModulesForPlan,
  moduleDef,
  parseEmail,
  slugifyStoreName,
  type Plan,
  type SignupSlugAvailability,
  type SignupVerifyInput,
} from '@molho/contracts';
import { hashEmailForLookup } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import { StaffProvisioningRepository } from '../platform/staff-provisioning.repository';

const SIGNUP_PLAN: Plan = 'standard';
const TRIAL_DAYS = 7;

export interface SignupProvisioningResult {
  accessUser: { id: string; name: string };
  tenant: { id: string; slug: string; name: string };
  store: { id: string; name: string };
  created: boolean;
}

export class SignupProvisioningService {
  constructor(private readonly requestContext: RequestContextService) {}

  async provision(input: SignupVerifyInput): Promise<SignupProvisioningResult> {
    const email = parseEmail(input.email);
    const client = this.requestContext.getClient();
    const emailHash = hashEmailForLookup(email);
    const existingUser = await client.user.findFirst({
      where: { emailLookupHash: emailHash, deletedAt: null },
      select: { id: true, name: true },
    });

    if (existingUser) {
      const existingTenant = await client.userRole.findFirst({
        where: { userId: existingUser.id, role: 'owner', scopeType: 'tenant', scopeId: { not: null } },
        select: { scopeId: true },
        orderBy: { createdAt: 'asc' },
      });
      if (existingTenant?.scopeId) {
        const tenant = await client.tenant.findFirst({
          where: { id: existingTenant.scopeId, deletedAt: null },
          select: { id: true, slug: true, name: true },
        });
        if (tenant) {
          const store = await client.store.findFirst({
            where: { tenantId: tenant.id, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { createdAt: 'asc' },
          });
          if (store) return { accessUser: existingUser, tenant, store, created: false };
        }
      }
    }

    await client.plan.upsert({
      where: { id: SIGNUP_PLAN },
      update: {},
      create: {
        id: SIGNUP_PLAN,
        name: 'Standard',
        priceMonthCents: 9900,
        modules: defaultModulesForPlan(SIGNUP_PLAN),
      },
    });

    const slug = await this.nextAvailableSlug(normalizeSlugForCreation(slugifyStoreName(input.restaurantName)));
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const tenant = await client.tenant.create({
      data: {
        slug,
        name: input.restaurantName.trim(),
        planId: SIGNUP_PLAN,
        status: 'active',
        timezone: 'America/Sao_Paulo',
      },
      select: { id: true, slug: true, name: true },
    });
    const store = await client.store.create({
      data: {
        tenantId: tenant.id,
        name: input.restaurantName.trim(),
        addressText: 'Configure o endereço da loja',
        timezone: 'America/Sao_Paulo',
      },
      select: { id: true, name: true },
    });
    if (process.env.NODE_ENV !== 'production' && process.env.MOLHO_SIGNUP_FORCE_ROLLBACK_EMAIL === email) {
      throw new Error('Falha forçada de provisionamento do signup.');
    }

    const staffProvisioning = new StaffProvisioningRepository(this.requestContext);
    const identity = existingUser
      ? { id: existingUser.id, created: false }
      : await staffProvisioning.findOrCreateUser(email, input.ownerName.trim());
    await staffProvisioning.createRoleAssignment(identity.id, 'owner', 'tenant', tenant.id);
    const user = (await client.user.findUniqueOrThrow({
      where: { id: identity.id },
      select: { id: true, name: true },
    }));

    for (const moduleKey of defaultModulesForPlan(SIGNUP_PLAN).filter((key) => !moduleDef(key).core)) {
      await client.tenantEntitlement.create({
        data: { tenantId: tenant.id, moduleKey, source: 'trial', status: 'trialing', trialEndsAt },
      });
      await client.tenantSetting.create({ data: { tenantId: tenant.id, moduleKey, enabled: true } });
    }

    const category = await client.category.create({
      data: { tenantId: tenant.id, name: 'Cardápio', sortOrder: 0 },
      select: { id: true },
    });
    await client.product.createMany({
      data: [
        {
          tenantId: tenant.id,
          categoryId: category.id,
          name: 'X-Salada da casa',
          description: 'Pão macio, hambúrguer, queijo, salada e molho especial.',
          basePriceCents: 2890,
          sortOrder: 0,
        },
        {
          tenantId: tenant.id,
          categoryId: category.id,
          name: 'Batata crocante',
          description: 'Porção individual pra acompanhar o pedido.',
          basePriceCents: 1490,
          sortOrder: 1,
        },
        {
          tenantId: tenant.id,
          categoryId: category.id,
          name: 'Refrigerante lata',
          description: 'Geladinho, do jeito que salva o combo.',
          basePriceCents: 700,
          sortOrder: 2,
        },
      ],
    });

    await client.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: user.id,
        actorRole: 'owner',
        action: 'signup.provision',
        entity: 'tenant',
        afterJson: { tenantId: tenant.id, storeId: store.id, plan: SIGNUP_PLAN, status: 'trial' },
      },
    });

    return { accessUser: user, tenant, store, created: true };
  }

  /**
   * `GET /v1/signup/slug-available` (preview do form de cria\u00e7\u00e3o, Bloco 2) \u2014
   * roda a MESMA normaliza\u00e7\u00e3o + checagem de unicidade que `provision()` usa
   * de verdade, ent\u00e3o o preview nunca promete um slug que a cria\u00e7\u00e3o depois
   * n\u00e3o entrega. `restaurantName` vazio/s\u00f3-s\u00edmbolo normaliza pro fallback
   * `loja-*`, que sempre existe como candidato \u2014 nunca retorna slug vazio.
   */
  async checkSlugAvailability(candidateSlug: string): Promise<SignupSlugAvailability> {
    // `candidateSlug` chega JÁ passado por `slugifyStoreName` no front (é o
    // mesmo preview que o cliente vê embaixo do campo) — normaliza de novo
    // aqui só como defesa, nunca confia em input de query string cru.
    const base = normalizeSlugForCreation(slugifyStoreName(candidateSlug));
    const client = this.requestContext.getClient();
    const existing = await client.tenant.findFirst({ where: { slug: base, deletedAt: null }, select: { id: true } });
    if (!existing) return { available: true };
    const suggestion = await this.nextAvailableSlug(base);
    return { available: false, suggestion };
  }

  private async nextAvailableSlug(base: string): Promise<string> {
    const client = this.requestContext.getClient();
    for (let i = 0; i < 50; i += 1) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const existing = await client.tenant.findFirst({ where: { slug: candidate, deletedAt: null }, select: { id: true } });
      if (!existing) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}

/** Garante tamanho m\u00ednimo (3) e teto de URL (30) \u2014 decis\u00e3o de CRIA\u00c7\u00c3O, n\u00e3o
 * do preview puro (`slugifyStoreName`, @molho/contracts). */
function normalizeSlugForCreation(slug: string): string {
  const trimmed = slug.slice(0, 30).replace(/-+$/g, '');
  return trimmed.length >= 3 ? trimmed : `loja-${trimmed || 'molho'}`.slice(0, 30);
}
