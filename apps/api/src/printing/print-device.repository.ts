import type { Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

export interface PrintDeviceSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  version: number;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** O mínimo que o guard precisa pra autenticar — nunca sai da API. */
export interface PrintDeviceAuthRow {
  id: string;
  tenantId: string;
  tokenHash: string;
  version: number;
  revokedAt: Date | null;
}

export interface CreatePrintDeviceParams {
  name: string;
  tokenPrefix: string;
  tokenHash: string;
  createdBy: string;
}

export interface PrintDeviceAudit {
  actorId: string;
  actorRole: string;
  action: 'print_device.paired' | 'print_device.rotated' | 'print_device.revoked';
  deviceId: string;
  after: Prisma.InputJsonValue;
}

export interface PrintDeviceRepository {
  create(params: CreatePrintDeviceParams): Promise<PrintDeviceSummary>;
  list(): Promise<PrintDeviceSummary[]>;
  findById(id: string): Promise<PrintDeviceSummary | null>;
  findActiveByPrefix(tokenPrefix: string): Promise<PrintDeviceAuthRow | null>;
  rotate(id: string, tokenPrefix: string, tokenHash: string): Promise<PrintDeviceSummary | null>;
  revoke(id: string, revokedBy: string): Promise<boolean>;
  touchLastSeen(id: string, throttleSeconds: number): Promise<void>;
  writeAudit(audit: PrintDeviceAudit): Promise<void>;
}

const SUMMARY_SELECT = {
  id: true,
  name: true,
  tokenPrefix: true,
  version: true,
  lastSeenAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

export class PrismaPrintDeviceRepository implements PrintDeviceRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  create(params: CreatePrintDeviceParams): Promise<PrintDeviceSummary> {
    return this.requestContext.getClient().printDevice.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        name: params.name,
        tokenPrefix: params.tokenPrefix,
        tokenHash: params.tokenHash,
        createdBy: params.createdBy,
      },
      select: SUMMARY_SELECT,
    });
  }

  list(): Promise<PrintDeviceSummary[]> {
    return this.requestContext.getClient().printDevice.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: SUMMARY_SELECT,
    });
  }

  findById(id: string): Promise<PrintDeviceSummary | null> {
    return this.requestContext.getClient().printDevice.findFirst({
      where: { id, deletedAt: null },
      select: SUMMARY_SELECT,
    });
  }

  /**
   * Roda em contexto de PLATAFORMA (o guard não sabe o tenant ainda). O prefixo
   * vem de 72 bits aleatórios — colisão entre tenants é astronômica; a
   * comparação de hash no service confirma a identidade de qualquer forma.
   */
  findActiveByPrefix(tokenPrefix: string): Promise<PrintDeviceAuthRow | null> {
    return this.requestContext.getClient().printDevice.findFirst({
      where: { tokenPrefix, revokedAt: null, deletedAt: null },
      select: { id: true, tenantId: true, tokenHash: true, version: true, revokedAt: true },
    });
  }

  async rotate(id: string, tokenPrefix: string, tokenHash: string): Promise<PrintDeviceSummary | null> {
    const { count } = await this.requestContext.getClient().printDevice.updateMany({
      where: { id, revokedAt: null, deletedAt: null },
      data: { tokenPrefix, tokenHash, version: { increment: 1 } },
    });
    return count > 0 ? this.findById(id) : null;
  }

  async revoke(id: string, revokedBy: string): Promise<boolean> {
    const { count } = await this.requestContext.getClient().printDevice.updateMany({
      where: { id, revokedAt: null, deletedAt: null },
      data: { revokedAt: new Date(), revokedBy },
    });
    return count > 0;
  }

  /** Throttle no SQL: só escreve se o último heartbeat é mais velho que N s. */
  async touchLastSeen(id: string, throttleSeconds: number): Promise<void> {
    await this.requestContext.getClient().$executeRaw`
      UPDATE print_devices
      SET last_seen_at = now()
      WHERE id = ${id}::uuid
        AND (last_seen_at IS NULL OR last_seen_at < now() - make_interval(secs => ${throttleSeconds}))
    `;
  }

  async writeAudit(audit: PrintDeviceAudit): Promise<void> {
    await this.requestContext.getClient().auditLog.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        actorId: audit.actorId,
        actorRole: audit.actorRole,
        action: audit.action,
        entity: 'print_device',
        afterJson: audit.after,
      },
    });
  }
}
