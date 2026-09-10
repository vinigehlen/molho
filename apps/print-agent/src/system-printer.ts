import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Codepage } from './codepage.js';
import { renderEscPosTicket } from './escpos.js';
import type { PrintOptions, Printer } from './printer.js';
import { runProcess } from './printer.js';

/**
 * Resolve o binário por caminho absoluto — um LaunchAgent do macOS / Tarefa
 * Agendada do Windows roda com PATH mínimo, e `spawn('lp')` dá
 * "No such file or directory". Tenta os caminhos padrão, cai pro nome puro.
 */
function resolveBin(name: string, candidates: string[]): string {
  return candidates.find((p) => existsSync(p)) ?? name;
}

const LP_BIN = resolveBin('lp', ['/usr/bin/lp', '/bin/lp', '/usr/local/bin/lp']);
const LPSTAT_BIN = resolveBin('lpstat', ['/usr/bin/lpstat', '/bin/lpstat', '/usr/local/bin/lpstat']);
const POWERSHELL_BIN = resolveBin('powershell', [
  `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
]);

/**
 * Impressão RAW pelo spooler do SO — plug & play, sem `MOLHO_PRINT_COMMAND`.
 *
 * - macOS/Linux: fila CUPS, `lp -d <fila> -o raw`.
 * - Windows: spooler via PowerShell + `WritePrinter` (winspool), datatype RAW.
 *   Não precisa de módulo nativo; precisa do driver da impressora instalado
 *   (a Elgin/Bematech entrega um instalador assinado).
 *
 * Seleção da impressora, em ordem:
 * 1. `MOLHO_PRINTER_NAME` exato, se definido;
 * 2. primeira fila cujo nome casa com impressora térmica conhecida;
 * 3. primeira fila da lista.
 * Zero fila → erro com instrução (instalar driver / rodar lpadmin).
 */

const THERMAL_HINT = /(i7|i8|i9|bematech|elgin|thermal|term|receipt|cupom|pos-?80|generic ?\/ ?text|raw)/i;

/**
 * 1) `configuredName` exato, se dado. 2) primeira fila com cara de térmica.
 * 3) primeira da lista. `null` = lista vazia.
 */
export function selectPrinterName(printers: string[], configuredName: string | null): string | null {
  if (configuredName) return configuredName;
  return printers.find((p) => THERMAL_HINT.test(p)) ?? printers[0] ?? null;
}

export class SystemPrinter implements Printer {
  private resolvedName: string | null = null;

  constructor(
    private readonly configuredName: string | null,
    private readonly codepage: Codepage,
    private readonly log: (message: string) => void = console.log,
  ) {}

  async print(ticketText: string, options: PrintOptions): Promise<void> {
    const bytes = renderEscPosTicket(ticketText, { cut: options.cut, codepage: this.codepage });
    const name = await this.resolveName();
    if (process.platform === 'win32') {
      await printWindowsRaw(name, bytes);
      return;
    }
    await runProcess(LP_BIN, ['-d', name, '-o', 'raw'], bytes);
  }

  private async resolveName(): Promise<string> {
    if (this.configuredName) return this.configuredName;
    if (this.resolvedName) return this.resolvedName;

    const printers = process.platform === 'win32' ? await listWindowsPrinters() : await listCupsQueues();
    if (printers.length === 0) {
      throw new Error(
        process.platform === 'win32'
          ? 'Nenhuma impressora no Windows. Instale o driver da impressora (Elgin/Bematech) e tente de novo, ou defina MOLHO_PRINTER_NAME.'
          : 'Nenhuma fila CUPS. Adicione a impressora (Ajustes → Impressoras, ou `lpadmin -p Molho -E -v usb://... -m raw`), ou defina MOLHO_PRINTER_NAME.',
      );
    }

    const match = selectPrinterName(printers, null)!;
    const guessed = !THERMAL_HINT.test(match);
    this.log(`impressora: "${match}"${guessed ? ' (primeira da lista; defina MOLHO_PRINTER_NAME se não for a térmica)' : ''}`);
    this.resolvedName = match;
    return match;
  }
}

/** `lpstat -e` — nomes de fila, um por linha. */
export async function listCupsQueues(): Promise<string[]> {
  const out = await capture(LPSTAT_BIN, ['-e']).catch(() => '');
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

export async function listWindowsPrinters(): Promise<string[]> {
  const out = await capture(POWERSHELL_BIN, [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '(Get-CimInstance Win32_Printer).Name',
  ]).catch(() => '');
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** WritePrinter via winspool, datatype RAW. Bytes chegam em base64 por env. */
async function printWindowsRaw(printerName: string, bytes: Buffer): Promise<void> {
  const script = `
$ErrorActionPreference='Stop'
Add-Type -Namespace Molho -Name Raw -MemberDefinition @'
[DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)] public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
[DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
[DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)] public static extern bool StartDocPrinter(IntPtr h, int level, string[] di);
[DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
[DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
[DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
[DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] buf, int len, out int written);
'@
$h=[IntPtr]::Zero
if(-not [Molho.Raw]::OpenPrinter($env:MOLHO_RAW_PRINTER,[ref]$h,[IntPtr]::Zero)){ throw "OpenPrinter falhou para '$($env:MOLHO_RAW_PRINTER)'" }
try {
  [void][Molho.Raw]::StartDocPrinter($h,1,@('Molho comanda',$null,'RAW'))
  [void][Molho.Raw]::StartPagePrinter($h)
  $bytes=[Convert]::FromBase64String($env:MOLHO_RAW_B64)
  $written=0
  [void][Molho.Raw]::WritePrinter($h,$bytes,$bytes.Length,[ref]$written)
  [void][Molho.Raw]::EndPagePrinter($h)
  [void][Molho.Raw]::EndDocPrinter($h)
} finally { [void][Molho.Raw]::ClosePrinter($h) }
`;
  await runProcessWithEnv(POWERSHELL_BIN, ['-NoProfile', '-NonInteractive', '-Command', script], {
    MOLHO_RAW_PRINTER: printerName,
    MOLHO_RAW_B64: bytes.toString('base64'),
  });
}

function capture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    const out: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => out.push(c));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(Buffer.concat(out).toString('utf8')) : reject(new Error(`${command} saiu ${code}`)),
    );
  });
}

function runProcessWithEnv(command: string, args: string[], extraEnv: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, ...extraEnv },
    });
    const stderr: Buffer[] = [];
    child.stderr.on('data', (c: Buffer) => stderr.push(c));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`impressão Windows falhou (${code}): ${Buffer.concat(stderr).toString('utf8').trim()}`)),
    );
  });
}
