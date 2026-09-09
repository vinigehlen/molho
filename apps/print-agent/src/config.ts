import { type Codepage, parseCodepage } from './codepage.js';

export type PrintFormat = 'text' | 'escpos';

export interface PrintOutputConfig {
  /** Escape hatch: comando explícito (`lp`, etc.). Vazio = transporte automático. */
  printCommand: string | null;
  printArgs: string[];
  printFormat: PrintFormat;
  /** Nome exato da fila/impressora. Vazio = auto-detecção. */
  printerName: string | null;
  codepage: Codepage;
}

export interface PrintAgentConfig extends PrintOutputConfig {
  apiUrl: string;
  /** Credencial de DISPOSITIVO (`molho_pd_...`), NG-06. Não é token de staff. */
  deviceToken: string;
  /** Opcional: o token já identifica o tenant; se presente, a API confere. */
  tenantId: string | null;
  workerId: string;
  once: boolean;
  healthEvery: number;
  width: number;
  leaseSeconds: number;
  pollMs: number;
}

const DEFAULT_WIDTH = 80;
const DEFAULT_LEASE_SECONDS = 120;
const DEFAULT_POLL_MS = 3_000;
const DEFAULT_HEALTH_EVERY = 20;

export function readConfig(env: NodeJS.ProcessEnv = process.env): PrintAgentConfig {
  const apiUrl = required(env, 'MOLHO_API_URL').replace(/\/+$/, '');
  const tenantId = env.MOLHO_TENANT_ID || null;
  return {
    ...readOutputConfig(env),
    apiUrl,
    deviceToken: required(env, 'MOLHO_PRINT_DEVICE_TOKEN'),
    tenantId,
    workerId: env.MOLHO_PRINT_WORKER_ID || `agent:${tenantId ?? 'device'}`,
    once: booleanEnv(env, 'MOLHO_PRINT_ONCE'),
    healthEvery: intEnv(env, 'MOLHO_PRINT_HEALTH_EVERY', DEFAULT_HEALTH_EVERY, 0, 1_000),
    width: intEnv(env, 'MOLHO_PRINT_WIDTH', DEFAULT_WIDTH, 1, 120),
    leaseSeconds: intEnv(env, 'MOLHO_PRINT_LEASE_SECONDS', DEFAULT_LEASE_SECONDS, 5, 300),
    pollMs: intEnv(env, 'MOLHO_PRINT_POLL_MS', DEFAULT_POLL_MS, 500, 60_000),
  };
}

export function readOutputConfig(env: NodeJS.ProcessEnv = process.env): PrintOutputConfig {
  return {
    printCommand: env.MOLHO_PRINT_COMMAND || null,
    printArgs: parsePrintArgs(env.MOLHO_PRINT_ARGS),
    printFormat: printFormat(env.MOLHO_PRINT_FORMAT),
    printerName: env.MOLHO_PRINTER_NAME || null,
    codepage: parseCodepage(env.MOLHO_PRINT_CODEPAGE),
  };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} obrigatório.`);
  return value;
}

function intEnv(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} precisa ser inteiro entre ${min} e ${max}.`);
  }
  return parsed;
}

function booleanEnv(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = env[key];
  if (!raw) return false;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  throw new Error(`${key} precisa ser "1", "0", "true" ou "false".`);
}

function parsePrintArgs(raw: string | undefined): string[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('MOLHO_PRINT_ARGS precisa ser um JSON array de strings.');
  }
  return parsed;
}

function printFormat(raw: string | undefined): PrintFormat {
  if (!raw) return 'text';
  if (raw === 'text' || raw === 'escpos') return raw;
  throw new Error('MOLHO_PRINT_FORMAT precisa ser "text" ou "escpos".');
}
