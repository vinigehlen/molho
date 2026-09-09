import { Prisma } from '@molho/db';
import type { PrintDeviceRepository, PrintDeviceSummary } from './print-device.repository';
import { generateDeviceSecret, parseDeviceSecret, verifyDeviceSecret } from './print-device-secret';

/** Não reescreve `last_seen_at` mais de uma vez por minuto (throttle no SQL). */
const HEARTBEAT_THROTTLE_SECONDS = 60;

export interface PrintDeviceActor {
  userId: string;
  role: string;
}

export interface PairedPrintDevice {
  device: PrintDeviceSummary;
  /** `molho_pd_...` — o chamador mostra UMA vez e nunca mais. */
  secret: string;
}

/** Identidade autenticada de um agente (o que o guard põe em `request.printDevice`). */
export interface AuthenticatedPrintDevice {
  id: string;
  tenantId: string;
}

export class PrintDeviceNotFoundError extends Error {
  constructor() {
    super('Dispositivo de impressão não encontrado.');
  }
}

export class PrintDeviceNameConflictError extends Error {
  constructor() {
    super('Já existe um dispositivo com esse nome nesta loja.');
  }
}

export class PrintDeviceService {
  constructor(private readonly repo: PrintDeviceRepository) {}

  list(): Promise<PrintDeviceSummary[]> {
    return this.repo.list();
  }

  async pair(name: string, actor: PrintDeviceActor): Promise<PairedPrintDevice> {
    const { secret, tokenPrefix, tokenHash } = generateDeviceSecret();
    let device: PrintDeviceSummary;
    try {
      device = await this.repo.create({ name, tokenPrefix, tokenHash, createdBy: actor.userId });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PrintDeviceNameConflictError();
      }
      throw error;
    }
    await this.repo.writeAudit({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'print_device.paired',
      deviceId: device.id,
      after: { id: device.id, name: device.name },
    });
    return { device, secret };
  }

  /** Gera um segredo novo e incrementa `version` — o token antigo para de valer. */
  async rotate(id: string, actor: PrintDeviceActor): Promise<PairedPrintDevice> {
    const { secret, tokenPrefix, tokenHash } = generateDeviceSecret();
    const device = await this.repo.rotate(id, tokenPrefix, tokenHash);
    if (!device) throw new PrintDeviceNotFoundError();
    await this.repo.writeAudit({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'print_device.rotated',
      deviceId: device.id,
      after: { id: device.id, version: device.version },
    });
    return { device, secret };
  }

  async revoke(id: string, actor: PrintDeviceActor): Promise<void> {
    const revoked = await this.repo.revoke(id, actor.userId);
    if (!revoked) throw new PrintDeviceNotFoundError();
    await this.repo.writeAudit({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'print_device.revoked',
      deviceId: id,
      after: { id, revokedAt: new Date().toISOString() },
    });
  }

  /**
   * Chamado pelo guard DENTRO de um contexto de plataforma. Retorna a
   * identidade do dispositivo ou `null` (segredo inválido / revogado). O
   * heartbeat é best-effort — nunca bloqueia a autenticação.
   */
  async authenticate(rawSecret: string): Promise<AuthenticatedPrintDevice | null> {
    const parsed = parseDeviceSecret(rawSecret);
    if (!parsed) return null;

    const row = await this.repo.findActiveByPrefix(parsed.tokenPrefix);
    if (!row || row.revokedAt) return null;
    if (!verifyDeviceSecret(rawSecret, row.tokenHash)) return null;

    await this.repo.touchLastSeen(row.id, HEARTBEAT_THROTTLE_SECONDS).catch(() => undefined);
    return { id: row.id, tenantId: row.tenantId };
  }
}
