import { spawn } from 'node:child_process';
import type { Codepage } from './codepage.js';
import { renderEscPosTicket } from './escpos.js';
import type { PrintFormat } from './config.js';

export interface PrintOptions {
  cut: boolean;
}

export interface Printer {
  print(ticketText: string, options: PrintOptions): Promise<void>;
}

/** Bytes que vão pra impressora: ESC/POS cru ou texto puro. */
export function renderForPrinter(
  ticketText: string,
  format: PrintFormat,
  codepage: Codepage,
  options: PrintOptions,
): Buffer | string {
  return format === 'escpos' ? renderEscPosTicket(ticketText, { cut: options.cut, codepage }) : ticketText;
}

export class DryRunPrinter implements Printer {
  constructor(
    private readonly format: PrintFormat,
    private readonly codepage: Codepage,
    private readonly log: (message: string) => void = console.log,
  ) {}

  async print(ticketText: string, options: PrintOptions): Promise<void> {
    const rendered = renderForPrinter(ticketText, this.format, this.codepage, options);
    this.log(typeof rendered === 'string' ? rendered : rendered.toString('hex'));
  }
}

/** Escape hatch: comando explícito do sistema (`lp -o raw`, etc.), bytes no stdin. */
export class CommandPrinter implements Printer {
  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly format: PrintFormat,
    private readonly codepage: Codepage,
  ) {}

  print(ticketText: string, options: PrintOptions): Promise<void> {
    return runProcess(this.command, this.args, renderForPrinter(ticketText, this.format, this.codepage, options));
  }
}

/** Roda um processo sem shell, manda `payload` no stdin, resolve se sair 0. */
export function runProcess(command: string, args: string[], payload: Buffer | string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'ignore', 'pipe'] });
    const stderr: Buffer[] = [];

    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`"${command}" saiu com código ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
    });

    child.stdin.end(payload);
  });
}
