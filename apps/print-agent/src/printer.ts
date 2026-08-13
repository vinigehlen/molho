import { spawn } from 'node:child_process';
import { renderEscPosTicket } from './escpos.js';
import type { PrintFormat } from './config.js';

export interface PrintOptions {
  cut: boolean;
}

export interface Printer {
  print(ticketText: string, options: PrintOptions): Promise<void>;
}

export class DryRunPrinter implements Printer {
  constructor(
    private readonly format: PrintFormat,
    private readonly log: (message: string) => void = console.log,
  ) {}

  async print(ticketText: string, options: PrintOptions): Promise<void> {
    if (this.format === 'escpos') {
      this.log(renderEscPosTicket(ticketText, options).toString('hex'));
      return;
    }
    this.log(ticketText);
  }
}

export class CommandPrinter implements Printer {
  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly format: PrintFormat,
  ) {}

  print(ticketText: string, options: PrintOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.args, { shell: false, stdio: ['pipe', 'ignore', 'pipe'] });
      const stderr: Buffer[] = [];

      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Comando de impressao saiu com codigo ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
      });

      child.stdin.end(this.format === 'escpos' ? renderEscPosTicket(ticketText, options) : ticketText);
    });
  }
}
