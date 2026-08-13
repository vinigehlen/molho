'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PrintingUnavailableError,
  type ClaimedPrintJob,
  claimNextPrintJob,
  markPrintJobFailed,
  markPrintJobPrinted,
} from '../../lib/printing-api';

const WORKER_STORAGE_KEY = 'molho:printing-worker-id';
const POLL_IDLE_MS = 4_000;
const POLL_AFTER_JOB_MS = 800;
const LEASE_SECONDS = 120;

type ConsumerStatus = 'idle' | 'printing' | 'offline' | 'unavailable' | 'error';

function browserWorkerId(): string {
  try {
    const existing = window.localStorage.getItem(WORKER_STORAGE_KEY);
    if (existing) return existing;
    const created = `browser:${crypto.randomUUID()}`;
    window.localStorage.setItem(WORKER_STORAGE_KEY, created);
    return created;
  } catch {
    return `browser:${crypto.randomUUID()}`;
  }
}

function afterPrint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (fallback) clearTimeout(fallback);
      window.removeEventListener('afterprint', finish);
      resolve();
    };
    window.addEventListener('afterprint', finish, { once: true });
    window.print();
    // `afterprint` e o sinal correto, mas nao e igualmente confiavel em todos
    // os browsers. Como `window.print()` bloqueia ate o dialogo fechar, este
    // fallback roda so depois da tentativa de impressao terminar.
    fallback = setTimeout(finish, 1_000);
  });
}

export function PrintJobConsumer({ active }: { active: boolean }) {
  const workerId = useMemo(browserWorkerId, []);
  const stoppedRef = useRef(false);
  const currentJobRef = useRef<ClaimedPrintJob | null>(null);
  const [currentJob, setCurrentJob] = useState<ClaimedPrintJob | null>(null);
  const [status, setStatus] = useState<{ state: ConsumerStatus; message: string }>({
    state: 'idle',
    message: 'Impressora do navegador pronta',
  });

  useEffect(() => {
    stoppedRef.current = false;
    if (!active) {
      setStatus({ state: 'offline', message: 'Impressão pausada — sem conexão' });
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;

    async function loop(delay: number) {
      timeout = setTimeout(async () => {
        if (stoppedRef.current) return;

        try {
          const job = await claimNextPrintJob(workerId, LEASE_SECONDS);
          if (!job) {
            setStatus({ state: 'idle', message: 'Impressora do navegador pronta' });
            await loop(POLL_IDLE_MS);
            return;
          }

          currentJobRef.current = job;
          setCurrentJob(job);
          setStatus({ state: 'printing', message: `Imprimindo pedido ${job.orderId.slice(0, 8).toUpperCase()}…` });
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await afterPrint();
          await markPrintJobPrinted(job, workerId);
          currentJobRef.current = null;
          setCurrentJob(null);
          setStatus({ state: 'idle', message: 'Última comanda enviada pra impressão' });
          await loop(POLL_AFTER_JOB_MS);
        } catch (error) {
          const failedJob = currentJobRef.current;
          currentJobRef.current = null;
          setCurrentJob(null);

          if (error instanceof PrintingUnavailableError) {
            setStatus({ state: 'unavailable', message: 'Impressão não ativa nesta loja' });
            await loop(POLL_IDLE_MS * 3);
            return;
          }

          if (failedJob) {
            await markPrintJobFailed(
              failedJob,
              workerId,
              error instanceof Error ? error.message : 'Falha desconhecida ao imprimir pelo navegador',
            ).catch(() => null);
          }
          setStatus({ state: 'error', message: 'Falha ao consumir a fila de impressão' });
          await loop(POLL_IDLE_MS);
        }
      }, delay);
    }

    void loop(0);

    return () => {
      stoppedRef.current = true;
      currentJobRef.current = null;
      if (timeout) clearTimeout(timeout);
    };
  }, [active, workerId]);

  return (
    <>
      <span className={statusClass(status.state)} aria-live="polite">
        {status.message}
      </span>
      {currentJob && <PrintJobPaper job={currentJob} />}
    </>
  );
}

function PrintJobPaper({ job }: { job: ClaimedPrintJob }) {
  return (
    <div id="kitchen-ticket" className="mx-auto max-w-sm p-4 font-mono text-sm text-black">
      <pre className="whitespace-pre-wrap">{job.ticketText}</pre>
    </div>
  );
}

function statusClass(state: ConsumerStatus): string {
  const base = 'rounded-full px-3 py-1 text-xs font-medium';
  if (state === 'printing') return `${base} bg-brand text-on-brand`;
  if (state === 'error' || state === 'unavailable' || state === 'offline') return `${base} bg-caution text-white`;
  return `${base} border border-border text-text`;
}
