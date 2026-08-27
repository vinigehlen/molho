import { loadQueue, type QueuedIntent } from './order-queue';
import { syncOrderQueue } from './order-queue-sync';
import { logoutStaffSession } from './staff-auth';
import { disarmStream } from './api-client';

export type LogoutResult = { ok: true } | { ok: false; message: string };

/**
 * Logout único do backoffice, chamado de qualquer página pela sidebar
 * (Épico 9b item 3): avisa e tenta sincronizar fila offline pendente ANTES
 * de sair — nunca deixa o operador sair achando que aplicou algo que só
 * ficou enfileirado — e faz disarm do stream de qualquer forma, ANTES de
 * descartar o JWT.
 *
 * Quem já tem uma instância viva de `useOrderQueue` (só o board hoje) passa
 * `pending`/`sync` dela, pra reusar o mesmo estado em vez de abrir uma
 * segunda leitura da fila. Quem não tem (sidebar chamando de outra página)
 * passa `null` nos dois — cai no `loadQueue`/`syncOrderQueue` avulsos, que
 * são I/O puro sem hook nenhum vivo por perto, então não corre risco de
 * duas cópias do mesmo estado divergindo.
 */
export async function performStaffLogout(params: {
  tenantId: string | null;
  userId: string | null;
  online: boolean;
  pending: QueuedIntent[] | null;
  sync: (() => Promise<number>) | null;
  confirmDiscard: (message: string) => boolean;
}): Promise<LogoutResult> {
  const { tenantId, userId, online, pending, sync, confirmDiscard } = params;

  const queue = pending ?? (tenantId ? loadQueue(tenantId) : []);
  if (queue.length > 0) {
    if (!online) {
      const confirmed = confirmDiscard(
        `Há ${queue.length} ação(ões) ainda no aparelho. Elas ficam guardadas para o próximo login neste restaurante. Sair mesmo assim?`,
      );
      if (!confirmed) return { ok: false, message: '' };
    } else if (tenantId && userId) {
      const unresolved = sync ? await sync() : (await syncOrderQueue(tenantId, userId)).unresolved;
      if (unresolved > 0) {
        return { ok: false, message: 'Há ações pendentes que precisam da sua decisão antes de sair.' };
      }
    }
  }

  let disarmed = await disarmStream();
  if (!disarmed.ok) disarmed = await disarmStream();
  if (!disarmed.ok) return { ok: false, message: 'Não foi possível encerrar o tempo real. Tente novamente.' };
  if (!(await logoutStaffSession())) return { ok: false, message: 'Não foi possível encerrar sua sessão. Tente novamente.' };
  return { ok: true };
}
