import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  type Actor,
  type InviteTeamMemberInput,
  type Role,
  type TeamMember,
  can,
  inviteTeamMemberSchema,
  isRole,
  updateTeamMemberRoleSchema,
} from '@molho/contracts';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { RequestContextService } from '../context/request-context.service';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import {
  AlreadyMemberError,
  CannotManageOwnRoleError,
  LastOwnerError,
  RoleNotManageableError,
  TeamMemberNotFoundError,
} from './team.errors';
import { TEAM_SERVICE } from './team.tokens';
import type { TeamActor, TeamService } from './team.service';

/**
 * Painel de equipe V1 (escopo tenant, dono/manager gerencia o próprio
 * staff) — ver packages/contracts/src/team.ts pro racional de escopo.
 */
@Controller('v1/team')
@UseGuards(JwtAuthGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequirePermission('team.manage')
export class TeamController {
  constructor(
    @Inject(TEAM_SERVICE) private readonly team: TeamService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  list(): Promise<TeamMember[]> {
    return this.team.list(this.requestContext.getTenantId());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async invite(
    @Body(new ZodValidationPipe(inviteTeamMemberSchema)) dto: InviteTeamMemberInput,
    @Req() req: RequestWithUser,
  ): Promise<TeamMember> {
    return this.run(() => this.team.invite(dto, this.requestContext.getTenantId(), this.actor(req)));
  }

  @Patch(':userId/role')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateRole(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateTeamMemberRoleSchema)) dto: { role: TeamMember['role'] },
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.run(() => this.team.updateRole(userId, dto.role, this.requestContext.getTenantId(), this.actor(req)));
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('userId') userId: string, @Req() req: RequestWithUser): Promise<void> {
    await this.run(() => this.team.revoke(userId, this.requestContext.getTenantId(), this.actor(req)));
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof TeamMemberNotFoundError) throw new NotFoundException(error.message);
      if (
        error instanceof RoleNotManageableError ||
        error instanceof CannotManageOwnRoleError ||
        error instanceof LastOwnerError ||
        error instanceof AlreadyMemberError
      ) {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }

  /** subordinatesOnly vem do `can()` puro — mesma fonte da RequirePermissionGuard, recalculado aqui pro service não depender de RBAC. */
  private actor(req: RequestWithUser): TeamActor {
    const tenantId = this.requestContext.getTenantId();
    const actor: Actor = {
      id: req.user.sub,
      assignments: req.user.scopes
        .filter((s): s is (typeof req.user.scopes)[number] & { role: Role } => isRole(s.role))
        .map((s) => ({ role: s.role, scopeType: s.scopeType, scopeId: s.scopeId })),
    };
    const scope = req.user.scopes.find(
      (s) => s.scopeType === 'platform' || (s.scopeType === 'tenant' && s.scopeId === tenantId),
    );
    if (!scope) throw new ForbiddenException('Sem papel atribuído para este tenant.');
    const result = can(actor, 'team.manage', { tenantId });
    return { id: req.user.sub, role: scope.role, subordinatesOnly: result.subordinatesOnly };
  }
}
