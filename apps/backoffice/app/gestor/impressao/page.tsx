'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { fetchPrintQueueStatus, PrintingUnavailableError, type PrintQueueStatus } from '../../../lib/printing-api';

const TEST_PRINT_COMMAND = `pnpm --filter @molho/print-agent build
MOLHO_PRINT_COMMAND=lp \\
MOLHO_PRINT_ARGS='["-d","Cozinha","-o","raw"]' \\
MOLHO_PRINT_FORMAT=escpos \\
pnpm --filter @molho/print-agent test-print`;

const START_AGENT_COMMAND = `MOLHO_API_URL=https://api.staging.molho.live \\
MOLHO_STAFF_ACCESS_TOKEN=... \\
MOLHO_TENANT_ID=... \\
MOLHO_PRINT_COMMAND=lp \\
MOLHO_PRINT_ARGS='["-d","Cozinha","-o","raw"]' \\
MOLHO_PRINT_FORMAT=escpos \\
pnpm --filter @molho/print-agent start`;

export default function ImpressaoPage() {
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
    <main className="min-h-screen bg-bg p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brand-strong">Impressão</p>
            <h1 className="text-2xl font-semibold text-text">Impressão da cozinha</h1>
            <p className="mt-1 text-sm text-text-muted">
              Configure o computador da loja para puxar a fila de comandas e mandar para a impressora local.
            </p>
          </div>
          <Link className="rounded-full border border-border px-3 py-1 text-sm font-medium text-text" href="/gestor">
            Voltar aos pedidos
          </Link>
        </div>

        <section className="rounded-[20px] border border-border bg-bg-card p-4">
          <h2 className="text-base font-semibold text-text">Como está funcionando agora</h2>
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

        <section className="grid gap-4 md:grid-cols-2">
          <StepCard step="1" title="Instale e rode no computador da loja">
            <p>
              Use o app <code className="rounded bg-bg px-1 py-0.5">@molho/print-agent</code>. Ele consome a API com token de
              staff, reivindica jobs da fila e confirma <code className="rounded bg-bg px-1 py-0.5">printed</code> ou{' '}
              <code className="rounded bg-bg px-1 py-0.5">failed</code>.
            </p>
          </StepCard>

          <StepCard step="2" title="Escolha a saída da impressora">
            <p>
              Para CUPS/macOS/Linux, o piloto usa <code className="rounded bg-bg px-1 py-0.5">lp</code>. Em térmica ESC/POS,
              prefira saída crua com <code className="rounded bg-bg px-1 py-0.5">-o raw</code>.
            </p>
          </StepCard>
        </section>

        <CommandCard
          title="Cupom de teste local"
          description="Rode sem API, token ou tenant. Se o papel sair, a ponte computador → impressora está pronta."
          command={TEST_PRINT_COMMAND}
        />

        <CommandCard
          title="Ligar a fila real"
          description="Depois do teste físico, rode o agente com API, token de staff e tenant da loja piloto."
          command={START_AGENT_COMMAND}
        />

        <section className="rounded-[20px] border border-border bg-bg-card p-4">
          <h2 className="text-base font-semibold text-text">Limites desta versão</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-text-muted">
            <li>Sem pareamento remoto ainda: o token e o tenant são configurados no ambiente do agente.</li>
            <li>Sem instalador/service manager: o operador técnico roda o processo localmente.</li>
            <li>Sem driver por fabricante: o ESC/POS atual é básico e normaliza acentos para ASCII.</li>
            <li>Reimpressão continua pelo botão “Imprimir” no card do pedido; ela não muda estado operacional.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function QueueStatusCard({
  status,
}: {
  status: { state: 'loading' | 'ready' | 'unavailable' | 'error'; data: PrintQueueStatus | null };
}) {
  if (status.state === 'loading') {
    return (
      <section className="rounded-[20px] border border-border bg-bg-card p-4">
        <h2 className="text-base font-semibold text-text">Fila de impressão</h2>
        <p className="mt-2 text-sm text-text-muted">Carregando status…</p>
      </section>
    );
  }

  if (status.state === 'unavailable') {
    return (
      <section className="rounded-[20px] border border-caution bg-bg-card p-4">
        <h2 className="text-base font-semibold text-text">Fila de impressão</h2>
        <p className="mt-2 text-sm text-text-muted">O módulo de impressão não está ativo nesta loja.</p>
      </section>
    );
  }

  if (status.state === 'error' || !status.data) {
    return (
      <section className="rounded-[20px] border border-critical bg-bg-card p-4">
        <h2 className="text-base font-semibold text-text">Fila de impressão</h2>
        <p className="mt-2 text-sm text-critical">Não deu pra carregar o status da fila agora.</p>
      </section>
    );
  }

  const { queued, printing, failed, stalePrinting, oldestQueuedAt, lastFailureAt, lastError } = status.data;
  return (
    <section className="rounded-[20px] border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text">Fila de impressão</h2>
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
    <div className="rounded-[14px] bg-bg p-3">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-text">{value}</dd>
    </div>
  );
}

function StepCard({ step, title, children }: { step: string; title: string; children: ReactNode }) {
  return (
    <article className="rounded-[20px] border border-border bg-bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-on-brand">
          {step}
        </span>
        <h2 className="text-base font-semibold text-text">{title}</h2>
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
    <section className="rounded-[20px] border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text">{title}</h2>
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
