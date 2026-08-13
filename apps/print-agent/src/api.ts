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

export class PrintingApi {
  constructor(
    private readonly config: PrintAgentConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async claimNext(): Promise<PrintJob | null> {
    const res = await this.post('/v1/admin/printing/jobs/claim', {
      workerId: this.config.workerId,
      leaseSeconds: this.config.leaseSeconds,
      width: this.config.width,
    });
    if (!res.ok) throw new PrintingApiError(res.status, `claim falhou (${res.status})`);

    const body = (await res.json()) as Partial<PrintJob>;
    return body.id && body.status === 'printing' && body.ticketText ? (body as PrintJob) : null;
  }

  async markPrinted(job: Pick<PrintJob, 'id' | 'version'>): Promise<boolean> {
    const res = await this.post(`/v1/admin/printing/jobs/${encodeURIComponent(job.id)}/printed`, {
      workerId: this.config.workerId,
      version: job.version,
    });
    if (res.status === 409) return false;
    if (!res.ok) throw new PrintingApiError(res.status, `printed falhou (${res.status})`);
    return true;
  }

  async markFailed(job: Pick<PrintJob, 'id' | 'version'>, error: string): Promise<boolean> {
    const res = await this.post(`/v1/admin/printing/jobs/${encodeURIComponent(job.id)}/failed`, {
      workerId: this.config.workerId,
      version: job.version,
      error,
    });
    if (res.status === 409) return false;
    if (!res.ok) throw new PrintingApiError(res.status, `failed falhou (${res.status})`);
    return true;
  }

  private post(path: string, body: unknown): Promise<Response> {
    return this.fetchImpl(`${this.config.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.accessToken}`,
        'content-type': 'application/json',
        'x-tenant-id': this.config.tenantId,
      },
      body: JSON.stringify(body),
    });
  }
}
