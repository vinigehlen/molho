import { spawn } from 'node:child_process';

export interface Printer {
  print(ticketText: string): Promise<void>;
}

export class DryRunPrinter implements Printer {
  constructor(private readonly log: (message: string) => void = console.log) {}

  async print(ticketText: string): Promise<void> {
    this.log(ticketText);
  }
}

export class CommandPrinter implements Printer {
  constructor(
    private readonly command: string,
    private readonly args: string[],
  ) {}

  print(ticketText: string): Promise<void> {
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

      child.stdin.end(ticketText);
    });
  }
}
