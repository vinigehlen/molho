'use client';

import { MoButton, MoEmptyState, cn } from '@molho/ui';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import Link from 'next/link';
import React, { useRef, useState } from 'react';
import {
  commitCatalogImport,
  previewCatalogImport,
  type ImportRowReport,
  type ImportSummary,
} from '../../../../lib/catalog-import-api';

type Phase = 'pick' | 'analyzing' | 'review' | 'committing' | 'result';

const CARD = 'rounded-[20px] border border-border bg-bg-card p-5';
const ACCEPT = '.csv,.xlsx';

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function RowList({ rows, tone }: { rows: ImportRowReport[]; tone: 'ok' | 'error' }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border">
      {rows.map((row) => (
        <li key={row.line} className="flex flex-col gap-0.5 bg-bg-card px-3 py-2 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="tabular-nums text-xs text-text-muted">L{row.line}</span>
            <span className="font-medium text-text">{row.produto || '(sem nome)'}</span>
            {row.categoria ? <span className="text-xs text-text-muted">· {row.categoria}</span> : null}
          </div>
          {tone === 'error' && row.error ? <p className="text-xs text-critical-strong">{row.error}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export default function ImportarCardapioPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhase('pick');
    setFile(null);
    setPreview(null);
    setResult(null);
    setConsent(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function analyze(picked: File) {
    setFile(picked);
    setError(null);
    setPhase('analyzing');
    try {
      const summary = await previewCatalogImport(picked);
      setPreview(summary);
      setConsent(false);
      setPhase('review');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não deu pra ler a planilha.');
      setPhase('pick');
    }
  }

  async function commit() {
    if (!file) return;
    setError(null);
    setPhase('committing');
    try {
      const summary = await commitCatalogImport(file);
      setResult(summary);
      setPhase('result');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A importação falhou no meio do caminho.');
      setPhase('review');
    }
  }

  const validCount = preview?.createdCount ?? 0;
  const errorCount = preview?.errorCount ?? 0;
  const validRows = preview?.rows.filter((r) => r.status === 'valid') ?? [];
  const errorRows = preview?.rows.filter((r) => r.status === 'error') ?? [];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link
        href="/gestor/cardapio"
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-muted hover:text-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar pro cardápio
      </Link>

      <h1 className="text-xl font-semibold text-text">Importar cardápio</h1>
      <p className="mt-1 text-sm text-text-muted">
        Suba sua planilha .csv ou .xlsx. A gente confere tudo antes de criar qualquer produto — nada entra no
        cardápio sem você confirmar.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-[14px] border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical-strong"
        >
          {error}
        </p>
      ) : null}

      {(phase === 'pick' || phase === 'analyzing') && (
        <div className={cn(CARD, 'mt-4 flex flex-col items-center gap-3 text-center')}>
          <div className="flex h-16 w-16 items-center justify-center rounded-pill bg-brand-faint">
            <FileSpreadsheet className="h-7 w-7 text-brand-strong" aria-hidden="true" />
          </div>
          <p className="text-sm text-text-muted">
            {phase === 'analyzing' ? 'Conferindo as linhas da planilha…' : 'Escolha o arquivo pra começar.'}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label="Arquivo da planilha"
            disabled={phase === 'analyzing'}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void analyze(picked);
            }}
          />
          <MoButton
            icon={<Upload className="h-5 w-5" />}
            loading={phase === 'analyzing'}
            onClick={() => inputRef.current?.click()}
          >
            {phase === 'analyzing' ? 'Analisando…' : 'Escolher planilha'}
          </MoButton>
        </div>
      )}

      {phase === 'review' && preview && (
        <div className="mt-4 space-y-4">
          <div className={CARD}>
            <h2 className="text-body-strong font-semibold text-text">O que vai acontecer</h2>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <dt className="text-xs text-text-muted">Linhas no arquivo</dt>
                <dd className="tabular-nums text-lg font-semibold text-text">{preview.totalRows}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Prontas pra criar</dt>
                <dd className="tabular-nums text-lg font-semibold text-positive">{validCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Com erro</dt>
                <dd
                  className={cn(
                    'tabular-nums text-lg font-semibold',
                    errorCount > 0 ? 'text-critical-strong' : 'text-text-muted',
                  )}
                >
                  {errorCount}
                </dd>
              </div>
            </dl>
          </div>

          {validCount === 0 ? (
            <div className={CARD}>
              <MoEmptyState
                title="Nenhuma linha válida por aqui"
                description="Corrija os erros abaixo na sua planilha e suba de novo."
              />
            </div>
          ) : (
            <details className={CARD} open>
              <summary className="cursor-pointer text-body-strong font-semibold text-text">
                {plural(validCount, 'produto será criado', 'produtos serão criados')}
              </summary>
              <div className="mt-3">
                <RowList rows={validRows} tone="ok" />
              </div>
            </details>
          )}

          {errorCount > 0 && (
            <details className={CARD} open>
              <summary className="flex cursor-pointer items-center gap-2 text-body-strong font-semibold text-critical-strong">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {plural(errorCount, 'linha com erro', 'linhas com erro')} — serão ignoradas
              </summary>
              <div className="mt-3">
                <RowList rows={errorRows} tone="error" />
              </div>
            </details>
          )}

          {validCount > 0 && (
            <div className={CARD}>
              <label className="flex items-start gap-3 text-sm text-text">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 rounded-[6px] border-border text-brand"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  {errorCount > 0
                    ? `Entendi: as ${errorCount} linhas com erro ficam de fora e os ${validCount} produtos válidos serão criados agora.`
                    : `Confirmo a criação de ${plural(validCount, 'produto', 'produtos')} no cardápio.`}
                </span>
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <MoButton disabled={!consent || validCount === 0} onClick={() => void commit()}>
              {validCount > 0 ? `Importar ${plural(validCount, 'produto', 'produtos')}` : 'Importar'}
            </MoButton>
            <MoButton variant="ghost" icon={<RotateCcw className="h-5 w-5" />} onClick={reset}>
              Trocar arquivo
            </MoButton>
          </div>
        </div>
      )}

      {phase === 'committing' && (
        <div className={cn(CARD, 'mt-4 flex flex-col items-center gap-3 text-center')}>
          {/* ponytail: barra indeterminada — o endpoint de commit é uma request só, sem stream de progresso real */}
          <div className="h-2 w-full overflow-hidden rounded-pill bg-brand-faint">
            <div className="h-full w-1/3 animate-pulse rounded-pill bg-brand" />
          </div>
          <p className="text-sm text-text-muted">Criando os produtos no cardápio…</p>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="mt-4 space-y-4">
          <div className={cn(CARD, 'flex flex-col items-center gap-2 text-center')}>
            <CheckCircle2 className="h-10 w-10 text-positive" aria-hidden="true" />
            <h2 className="text-body-strong font-semibold text-text">
              {plural(result.createdCount, 'produto criado', 'produtos criados')}
            </h2>
            {result.errorCount > 0 ? (
              <p className="text-sm text-text-muted">
                {plural(result.errorCount, 'linha ficou de fora', 'linhas ficaram de fora')} por causa de erro.
              </p>
            ) : (
              <p className="text-sm text-text-muted">Tudo certo, sem sobra.</p>
            )}
          </div>

          {result.errorCount > 0 && (
            <details className={CARD}>
              <summary className="cursor-pointer text-body-strong font-semibold text-critical-strong">
                Linhas que não entraram
              </summary>
              <div className="mt-3">
                <RowList rows={result.rows.filter((r) => r.status === 'error')} tone="error" />
              </div>
            </details>
          )}

          <div className="flex flex-wrap gap-3">
            <Link href="/gestor/cardapio">
              <MoButton>Ver cardápio</MoButton>
            </Link>
            <MoButton variant="ghost" icon={<Upload className="h-5 w-5" />} onClick={reset}>
              Importar outra planilha
            </MoButton>
          </div>
        </div>
      )}
    </main>
  );
}
