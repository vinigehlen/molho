import type { RequestContextService } from '../../context/request-context.service';
import type { TokenScope } from './token-payload';
import type { UserAuthRepository } from './user-version-repository';

/**
 * TokenService é agnóstico a QUEM está autenticando — só precisa de algo
 * com token_version. Esta implementação lê/escreve customers.token_version
 * em vez de users.token_version. getRoleAssignments sempre vazio: customer
 * não tem user_roles/can() (CLAUDE.md "Duas semânticas de identidade").
 * É por isso que existem DUAS instâncias de TokenService (TOKEN_SERVICE
 * pra staff, CUSTOMER_TOKEN_SERVICE pra customer) na mesma classe — troca
 * só o repositório injetado, TokenService em si não muda.
 */
export class PrismaCustomerAuthRepository implements UserAuthRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async getTokenVersion(customerId: string): Promise<number> {
    const customer = await this.requestContext
      .getClient()
      .customer.findUniqueOrThrow({ where: { id: customerId }, select: { tokenVersion: true } });
    return customer.tokenVersion;
  }

  async incrementTokenVersion(customerId: string): Promise<number> {
    const customer = await this.requestContext.getClient().customer.update({
      where: { id: customerId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    return customer.tokenVersion;
  }

  async getRoleAssignments(): Promise<TokenScope[]> {
    return [];
  }
}
