import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { TeamController } from './team.controller';
import { TeamRepository } from './team.repository';
import { TeamService } from './team.service';
import { TEAM_REPOSITORY, TEAM_SERVICE } from './team.tokens';

@Module({
  imports: [AuthModule, ContextModule],
  controllers: [TeamController],
  providers: [
    {
      provide: TEAM_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new TeamRepository(requestContext),
    },
    {
      provide: TEAM_SERVICE,
      inject: [TEAM_REPOSITORY],
      useFactory: (repo: TeamRepository) => new TeamService(repo),
    },
  ],
})
export class TeamModule {}
