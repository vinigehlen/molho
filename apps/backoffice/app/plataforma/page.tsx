'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { MoButton, MoChip, MoInput } from '@molho/ui';
import { PLANS, type ModuleKey, type ModuleStateResponse, type Plan } from '@molho/contracts';
import {
  fetchPlatformTenants,
  fetchTenantModules,
  provisionStaff,
  provisionTenant,
  setTenantEntitlement,
  startImpersonation,
  type PlatformTenant,
} from '../../lib/platform-api';
import { subFromToken } from '../../lib/jwt-tenant';
import { setStaffSession } from '../../lib/staff-session';

const LOJISTA_ROLES = ['owner', 'manager', 'cashier', 'waiter', 'kitchen', 'courier', 'accountant', 'marketing'] as const;

export default function PlataformaPage() {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleStateResponse[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [busyModule, setBusyModule] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<(typeof LOJISTA_ROLES)[number]>('manager');
  const [staffScopeId, setStaffScopeId] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<string | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const [tenantName, setTenantName] = useState('');
  const [tenantPlan, setTenantPlan] = useState<Plan>('standard');
  const [tenantOwnerEmail, setTenantOwnerEmail] = useState('');
  const [tenantOwnerName, setTenantOwnerName] = useState('');
  const [tenantImmediate, setTenantImmediate] = useState(false);
  const [provisioningTenant, setProvisioningTenant] = useState(false);
  const [provisionTenantResult, setProvisionTenantResult] = useState<string | null>(null);
  const [provisionTenantError, setProvisionTenantError] = useState<string | null>(null);

  const [impersonateReason, setImpersonateReason] = useState('');
  const [impersonateReadOnly, setImpersonateReadOnly] = useState(true);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchPlatformTenants()
      .then(setTenants)
      .catch(() => setError('Não deu pra carregar os tenants.'));
  }, []);

  useEffect(() => {
    if (!selectedTenantId) return;
    setLoadingModules(true);
    fetchTenantModules(selectedTenantId)
      .then(setModules)
      .catch(() => setError('Não deu pra carregar os módulos desse tenant.'))
      .finally(() => setLoadingModules(false));
  }, [selectedTenantId]);

  async function toggleModule(module: ModuleStateResponse) {
    if (!selectedTenantId) return;
    setBusyModule(module.moduleKey);
    try {
      const updated = await setTenantEntitlement(
        selectedTenantId,
        module.moduleKey as ModuleKey,
        module.entitled ? 'revoked' : 'active',
      );
      setModules((prev) => prev.map((m) => (m.moduleKey === updated.moduleKey ? updated : m)));
    } catch {
      setError('Não deu pra atualizar o módulo. Tenta de novo.');
    } finally {
      setBusyModule(null);
    }
  }

  async function handleProvision() {
    setProvisionError(null);
    setProvisionResult(null);
    if (!staffEmail.trim()) return setProvisionError('Informe o e-mail do staff.');
    if (!staffScopeId.trim()) return setProvisionError('Informe o ID do tenant/loja (scopeId).');
    setProvisioning(true);
    try {
      const result = await provisionStaff({
        email: staffEmail.trim(),
        role: staffRole,
        scopeType: 'tenant',
        scopeId: staffScopeId.trim(),
      });
      setProvisionResult(result.created ? 'Staff criado com sucesso.' : 'Papel concedido a um staff já existente.');
      setStaffEmail('');
      setStaffScopeId('');
    } catch {
      setProvisionError('Não deu pra provisionar o staff. Confere o e-mail e o scopeId.');
    } finally {
      setProvisioning(false);
    }
  }

  async function handleProvisionTenant() {
    setProvisionTenantError(null);
    setProvisionTenantResult(null);
    if (!tenantName.trim()) return setProvisionTenantError('Informe o nome do restaurante.');
    if (!tenantOwnerEmail.trim()) return setProvisionTenantError('Informe o e-mail do dono.');
    if (!tenantOwnerName.trim()) return setProvisionTenantError('Informe o nome do dono.');
    setProvisioningTenant(true);
    try {
      const result = await provisionTenant({
        name: tenantName.trim(),
        plan: tenantPlan,
        ownerEmail: tenantOwnerEmail.trim(),
        ownerName: tenantOwnerName.trim(),
        immediate: tenantImmediate,
      });
      setProvisionTenantResult(`Loja "${result.tenant.name}" criada em /${result.tenant.slug}.`);
      setTenantName('');
      setTenantOwnerEmail('');
      setTenantOwnerName('');
      setTenants((prev) => [...prev, { id: result.tenant.id, slug: result.tenant.slug, name: result.tenant.name, planId: tenantPlan, status: tenantImmediate ? 'active' : 'trial' }]);
    } catch {
      setProvisionTenantError('Não deu pra provisionar a loja. Confere os dados.');
    } finally {
      setProvisioningTenant(false);
    }
  }

  /**
   * "Entrar como" (Épico 14, docs/01 §5-C.1) — abre a sessão de impersonation
   * exatamente como um login normal abriria: `setStaffSession` é o MESMO
   * mecanismo que `/login` usa, então todo o resto do backoffice (SSE,
   * client autenticado, `X-Tenant-Id`) funciona sem nenhum código especial.
   * Sem refresh token: quando o access expira (30min), o 401→refresh do
   * client normal usa o cookie do PRÓPRIO super-admin e devolve a sessão
   * real dele — nunca estende a impersonation silenciosamente.
   */
  async function handleImpersonate() {
    setImpersonateError(null);
    if (!selectedTenantId) return setImpersonateError('Selecione um tenant.');
    if (!impersonateReason.trim()) return setImpersonateError('Informe o motivo do acesso.');
    setImpersonating(true);
    try {
      const session = await startImpersonation(selectedTenantId, {
        reason: impersonateReason.trim(),
        readOnly: impersonateReadOnly,
      });
      setStaffSession({
        accessToken: session.accessToken,
        tenantId: session.tenantId,
        // sub do token de impersonation é o ATOR REAL (nunca um ID
        // sintético) — mesma decodificação-sem-verificar de subFromToken,
        // usada só pra marcar autoria de intents offline na fila.
        userId: subFromToken(session.accessToken) ?? '',
        tenantName: session.tenantName,
        tenantSlug: session.tenantSlug,
      });
      router.push('/gestor');
    } catch {
      setImpersonateError('Não deu pra iniciar a impersonation. Confere o motivo (mínimo 10 caracteres, 30 se for escrita).');
    } finally {
      setImpersonating(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error ? (
        <div className="flex items-start gap-2 rounded-md bg-critical/10 p-4 text-body text-critical-strong">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-title text-text">Provisionar loja nova</h2>
        <p className="text-body text-text-muted">Venda assistida — diferente do self-signup, cria o tenant direto daqui.</p>
        <div className="flex max-w-md flex-col gap-4">
          <MoInput label="Nome do restaurante" value={tenantName} onChange={(e) => { const v = e.currentTarget.value; setTenantName(v); }} />
          <div className="flex flex-col gap-2">
            <span className="text-body-strong text-text">Plano</span>
            <div className="flex flex-wrap gap-2">
              {PLANS.map((plan) => (
                <MoChip key={plan} selected={tenantPlan === plan} onClick={() => setTenantPlan(plan)}>
                  {plan}
                </MoChip>
              ))}
            </div>
          </div>
          <MoInput label="E-mail do dono" value={tenantOwnerEmail} onChange={(e) => { const v = e.currentTarget.value; setTenantOwnerEmail(v); }} />
          <MoInput label="Nome do dono" value={tenantOwnerName} onChange={(e) => { const v = e.currentTarget.value; setTenantOwnerName(v); }} />
          <label className="flex items-center gap-2 text-body text-text">
            <input type="checkbox" checked={tenantImmediate} onChange={(e) => setTenantImmediate(e.currentTarget.checked)} />
            Sem trial (cliente já fechado, módulos nascem ativos direto)
          </label>
          {provisionTenantError ? <p className="text-caption font-semibold text-critical-strong">{provisionTenantError}</p> : null}
          {provisionTenantResult ? <p className="text-caption font-semibold text-positive">{provisionTenantResult}</p> : null}
          <MoButton onClick={() => void handleProvisionTenant()} loading={provisioningTenant}>
            Provisionar loja
          </MoButton>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title text-text">Módulos por tenant</h2>
        <select
          className="h-[52px] w-full max-w-md rounded-md border border-border-strong bg-bg-card px-4 text-body text-text"
          value={selectedTenantId ?? ''}
          onChange={(e) => setSelectedTenantId(e.currentTarget.value || null)}
        >
          <option value="">Selecione um tenant</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name} ({tenant.slug})
            </option>
          ))}
        </select>

        {loadingModules ? <p className="text-body text-text-muted">Carregando módulos…</p> : null}

        {!loadingModules && selectedTenantId ? (
          <div className="flex flex-wrap gap-2">
            {modules.map((module) => (
              <MoChip
                key={module.moduleKey}
                selected={module.entitled}
                disabled={busyModule === module.moduleKey}
                onClick={() => void toggleModule(module)}
              >
                {module.moduleKey}
              </MoChip>
            ))}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title text-text">Entrar como</h2>
        <p className="text-body text-text-muted">
          Impersonation — motivo obrigatório, expira em 30min, somente leitura por padrão. O lojista é avisado por e-mail.
        </p>
        <div className="flex max-w-md flex-col gap-4">
          <MoInput
            label="Motivo do acesso"
            value={impersonateReason}
            onChange={(e) => { const v = e.currentTarget.value; setImpersonateReason(v); }}
            hint={impersonateReadOnly ? 'Mínimo 10 caracteres.' : 'Escrita: mínimo 30 caracteres.'}
          />
          <label className="flex items-center gap-2 text-body text-text">
            <input
              type="checkbox"
              checked={!impersonateReadOnly}
              onChange={(e) => setImpersonateReadOnly(!e.currentTarget.checked)}
            />
            Permitir escrita (uso excepcional — justificativa mais longa)
          </label>
          {impersonateError ? <p className="text-caption font-semibold text-critical-strong">{impersonateError}</p> : null}
          <MoButton onClick={() => void handleImpersonate()} loading={impersonating} disabled={!selectedTenantId}>
            Entrar como {tenants.find((t) => t.id === selectedTenantId)?.name ?? 'esta loja'}
          </MoButton>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title text-text">Provisionar staff</h2>
        <div className="flex max-w-md flex-col gap-4">
          <MoInput label="E-mail do staff" value={staffEmail} onChange={(e) => { const v = e.currentTarget.value; setStaffEmail(v); }} />
          <div className="flex flex-col gap-2">
            <span className="text-body-strong text-text">Papel</span>
            <div className="flex flex-wrap gap-2">
              {LOJISTA_ROLES.map((role) => (
                <MoChip key={role} selected={staffRole === role} onClick={() => setStaffRole(role)}>
                  {role}
                </MoChip>
              ))}
            </div>
          </div>
          <MoInput
            label="ID do tenant (scopeId)"
            value={staffScopeId}
            onChange={(e) => { const v = e.currentTarget.value; setStaffScopeId(v); }}
            hint="Cole o ID de um tenant da lista acima."
          />
          {provisionError ? <p className="text-caption font-semibold text-critical-strong">{provisionError}</p> : null}
          {provisionResult ? <p className="text-caption font-semibold text-positive">{provisionResult}</p> : null}
          <MoButton onClick={() => void handleProvision()} loading={provisioning}>
            Provisionar
          </MoButton>
        </div>
      </section>
    </div>
  );
}
