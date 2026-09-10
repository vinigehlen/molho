'use client';

import React, { type ReactNode, useEffect, useState } from 'react';
import { fetchPrintQueueStatus, PrintingUnavailableError, type PrintQueueStatus } from '../../../lib/printing-api';
import { PrintDevicesCard } from './print-devices-card';

const TEST_PRINT_COMMAND = `pnpm --filter @molho/print-agent build
MOLHO_PRINT_FORMAT=escpos pnpm --filter @molho/print-agent test-print`;

const START_AGENT_COMMAND = `MOLHO_API_URL=https://api.molho.live \\
MOLHO_PRINT_DEVICE_TOKEN=molho_pd_... \\
MOLHO_PRINT_FORMAT=escpos \\
pnpm --filter @molho/print-agent start`;

/**
 * Configuração da impressão da cozinha. Vive dentro da tela de Configuração
 * (seção "Impressora") — não tem mais entrada própria na barra lateral.
 */
export function PrinterSettings() {
  const [queueStatus, setQueueStatus] = useState<{ state: 'loading' | 'ready' | 'unavailable' | 'error'; data: PrintQueueStatus | null }>({
    state: 'loading',
    data: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetchPrintQueueStatus()
      .then((data) => {
        if (!cancelled) setQueueStatus({ state: 'ready', data });
      })
      .catch((error) => {
        if (cancelled) return;
        setQueueStatus({ state: error instanceof PrintingUnavailableError ? 'unavailable' : 'error', data: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Configure o computador da loja para puxar a fila de comandas e mandar para a impressora local.
      </p>

      <section className="rounded-[14px] border border-border bg-bg p-4">
        <h3 className="text-base font-semibold text-text">Como está funcionando agora</h3>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          Pedido novo cria uma comanda na fila quando o módulo de impressão está ativo. O botão “Imprimir” no pedido cria uma
          segunda via. Quem tira a comanda do papel é o agente local, rodando no computador conectado à impressora.
        </p>
        <div className="mt-3 rounded-[14px] bg-brand-faint p-3 text-sm text-brand-strong">
          O consumidor pelo navegador continua como fallback de prova, mas a impressão silenciosa/confiável do piloto é pelo
          agente local.
        </div>
      </section>

      <QueueStatusCard status={queueStatus} />

      <PrintDevicesCard />

      <section className="grid gap-4 md:grid-cols-2">
        <StepCard step="1" title="Pareie o dispositivo">
          <p>
            Acima: “Parear dispositivo”, dê um nome (ex.: Cozinha), copie o código{' '}
            <code className="rounded bg-bg px-1 py-0.5">molho_pd_…</code>.
          </p>
        </StepCard>

        <StepCard step="2" title="Rode o agente no computador da loja">
          <p>
            <code className="rounded bg-bg px-1 py-0.5">@molho/print-agent</code> com{' '}
            <code className="rounded bg-bg px-1 py-0.5">MOLHO_PRINT_FORMAT=escpos</code> acha a impressora sozinho (Windows
            ou Mac) e imprime com acento. Windows precisa do driver da Elgin/Bematech instalado.
          </p>
        </StepCard>
      </section>

      <CommandCard
        title="Cupom de teste local"
        description="Sem API nem token. Se o papel sair com acento, a ponte computador → impressora está pronta."
        command={TEST_PRINT_COMMAND}
      />

      <CommandCard
        title="Ligar a fila real"
        description="Cole o código do dispositivo pareado acima em MOLHO_PRINT_DEVICE_TOKEN."
        command={START_AGENT_COMMAND}
      />

      <section className="rounded-[14px] border border-border bg-bg p-4">
        <h3 className="text-base font-semibold text-text">Limites desta versão</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-text-muted">
          <li>Sem instalador/serviço empacotado: o operador técnico roda o processo (próxima fatia).</li>
          <li>macOS precisa da impressora adicionada em Ajustes → Impressoras (ou uma fila CUPS raw).</li>
          <li>Reimpressão continua pelo botão “Imprimir” no card do pedido; ela não muda estado operacional.</li>
        </ul>
      </section>
    </div>
  );
}

function QueueStatusCard({
  status,
}: {
  status: { state: 'loading' | 'ready' | 'unavailable' | 'error'; data: PrintQueueStatus | null };
}) {
  if (status.state === 'loading') {
    return (
      <section className="rounded-[14px] border border-border bg-bg p-4">
        <h3 className="text-base font-semibold text-text">Fila de impressão</h3>
        <p className="mt-2 text-sm text-text-muted">Carregando status…</p>
      </section>
    );
  }

  if (status.state === 'unavailable') {
    return (
      <section className="rounded-[14px] border border-caution bg-bg p-4">
        <h3 className="text-base font-semibold text-text">Fila de impressão</h3>
        <p className="mt-2 text-sm text-text-muted">O módulo de impressão não está ativo nesta loja.</p>
      </section>
    );
  }

  if (status.state === 'error' || !status.data) {
    return (
      <section className="rounded-[14px] border border-critical bg-bg p-4">
        <h3 className="text-base font-semibold text-text">Fila de impressão</h3>
        <p className="mt-2 text-sm text-critical">Não deu pra carregar o status da fila agora.</p>
      </section>
    );
  }

  const { queued, printing, failed, stalePrinting, oldestQueuedAt, lastFailureAt, lastError } = status.data;
  return (
    <section className="rounded-[14px] border border-border bg-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text">Fila de impressão</h3>
          <p className="mt-1 text-sm text-text-muted">
            Resumo rápido para ver se tem comanda presa, em impressão ou falhando.
          </p>
        </div>
        {failed > 0 || stalePrinting > 0 ? (
          <span className="rounded-full bg-caution px-3 py-1 text-xs font-medium text-text">atenção</span>
        ) : (
          <span className="rounded-full bg-positive px-3 py-1 text-xs font-medium text-text">ok</span>
        )}
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-4">
        <QueueMetric label="Na fila" value={queued} />
        <QueueMetric label="Imprimindo" value={printing} />
        <QueueMetric label="Lease vencido" value={stalePrinting} />
        <QueueMetric label="Falhou" value={failed} />
      </dl>
      {(oldestQueuedAt || lastFailureAt || lastError) && (
        <div className="mt-4 space-y-1 text-xs text-text-muted">
          {oldestQueuedAt && <p>Mais antiga na fila: {new Date(oldestQueuedAt).toLocaleString('pt-BR')}</p>}
          {lastFailureAt && <p>Última falha: {new Date(lastFailureAt).toLocaleString('pt-BR')}</p>}
          {lastError && <p className="text-critical">Erro recente: {lastError}</p>}
        </div>
      )}
    </section>
  );
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[14px] bg-bg-card p-3">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-text">{value}</dd>
    </div>
  );
}

function StepCard({ step, title, children }: { step: string; title: string; children: ReactNode }) {
  return (
    <article className="rounded-[14px] border border-border bg-bg p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-on-brand">
          {step}
        </span>
        <h3 className="text-base font-semibold text-text">{title}</h3>
      </div>
      <div className="mt-3 text-sm leading-6 text-text-muted">{children}</div>
    </article>
  );
}

function CommandCard({ title, description, command }: { title: string; description: string; command: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2_000);
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <section className="rounded-[14px] border border-border bg-bg p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-text">{title}</h3>
        <button
          className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text"
          type="button"
          onClick={() => void copyCommand()}
        >
          {copyState === 'copied' ? 'Copiado!' : 'Copiar comando'}
        </button>
      </div>
      <p className="mt-2 text-sm text-text-muted">{description}</p>
      {copyState === 'failed' && (
        <p className="mt-2 text-xs font-medium text-critical" aria-live="polite">
          Não consegui copiar automaticamente. Selecione o comando e copie manualmente.
        </p>
      )}
      <pre className="mt-3 overflow-x-auto rounded-[14px] bg-text p-4 text-xs leading-5 text-bg">
        <code>{command}</code>
      </pre>
    </section>
  );
}
