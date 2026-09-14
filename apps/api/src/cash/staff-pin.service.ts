import { hashSecret, verifySecret } from '../security/scrypt-secret';
import type { StaffPinRepository } from './staff-pin.repository';

/**
 * PIN de aprovação (Épico 20) — hoje só sangria consome, mas o endpoint é
 * genérico de propósito (docs/HANDOFF-epico-20-pdv-caixa.md): desconto
 * manual e cancelamento de pedido pago (`approval:true` na matriz) reusam
 * quando saírem do backlog.
 */
export class StaffPinService {
  constructor(private readonly repo: StaffPinRepository) {}

  /** Sempre a PRÓPRIA credencial — nunca seta PIN de outro usuário (self-only por construção: o userId vem do JWT no controller, não do body). */
  async setOwnPin(userId: string, pin: string): Promise<void> {
    await this.repo.setPinHash(userId, hashSecret(pin));
  }

  async verifyPin(userId: string, pin: string): Promise<boolean> {
    const stored = await this.repo.getPinHash(userId);
    if (!stored) return false;
    return verifySecret(pin, stored);
  }
}
