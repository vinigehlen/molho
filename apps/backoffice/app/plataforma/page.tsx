'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MoButton, MoChip, MoInput } from '@molho/ui';
import type { ModuleKey, ModuleStateResponse } from '@molho/contracts';
import {
  fetchPlatformTenants,
  fetchTenantModules,
  provisionStaff,
  setTenantEntitlement,
  type PlatformTenant,
} from '../../lib/platform-api';

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

  return (
    <div className="flex flex-col gap-8">
      {error ? (
        <div className="flex items-start gap-2 rounded-md bg-critical/10 p-4 text-body text-critical-strong">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

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
