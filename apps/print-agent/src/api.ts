import type { PrintAgentConfig } from './config.js';

export interface PrintJob {
  id: string;
  orderId: string;
  status: 'printing';
  ticketText: string;
  width: number;
  cut: boolean;
  version: number;
  leasedBy: string;
  leaseUntil: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class PrintingApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 401/403 = credencial revogada ou inválida. O loop para de reivindicar. */
export class PrintDeviceRevokedError extends Error {
  constructor(readonly status: number) {
    super('Credencial de impressão rejeitada (401/403) — dispositivo revogado ou token inválido. Pareie de novo.');
  }
}

const AGENT_BASE = '/v1/printing/agent';

export class PrintingApi {
  constructor(
    private readonly config: PrintAgentConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async claimNext(): Promise<PrintJob | null> {
    const res = await this.post(`${AGENT_BASE}/jobs/claim`, {
      workerId: this.config.workerId,
      leaseSeconds: this.config.leaseSeconds,
      width: this.config.width,
    });
    this.assertAuthorized(res);
    if (!res.ok) throw new PrintingApiError(res.status, `claim falhou (${res.status})`);

    // Fila vazia → a API responde 200 com corpo vazio (Nest serializa `null`
    // assim). `res.json()` num corpo vazio lança "Unexpected end of JSON input"
    // — por isso lê como texto e trata vazio/`null` como "sem job".
    const text = (await res.text()).trim();
    if (!text || text === 'null') return null;
    const body = JSON.parse(text) as Partial<PrintJob>;
    return body.id && body.status === 'printing' && body.ticketText ? (body as PrintJob) : null;
  }

  async markPrinted(job: Pick<PrintJob, 'id' | 'version'>): Promise<boolean> {
    const res = await this.post(`${AGENT_BASE}/jobs/${encodeURIComponent(job.id)}/printed`, {
      workerId: this.config.workerId,
      version: job.version,
    });
    if (res.status === 409) return false;
    this.assertAuthorized(res);
    if (!res.ok) throw new PrintingApiError(res.status, `printed falhou (${res.status})`);
    return true;
  }

  async markFailed(job: Pick<PrintJob, 'id' | 'version'>, error: string): Promise<boolean> {
    const res = await this.post(`${AGENT_BASE}/jobs/${encodeURIComponent(job.id)}/failed`, {
      workerId: this.config.workerId,
      version: job.version,
      error,
    });
    if (res.status === 409) return false;
    this.assertAuthorized(res);
    if (!res.ok) throw new PrintingApiError(res.status, `failed falhou (${res.status})`);
    return true;
  }

  private assertAuthorized(res: Response): void {
    if (res.status === 401 || res.status === 403) {
      throw new PrintDeviceRevokedError(res.status);
    }
  }

  private post(path: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.deviceToken}`,
      'content-type': 'application/json',
    };
    if (this.config.tenantId) headers['x-tenant-id'] = this.config.tenantId;

    return this.fetchImpl(`${this.config.apiUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }
}
