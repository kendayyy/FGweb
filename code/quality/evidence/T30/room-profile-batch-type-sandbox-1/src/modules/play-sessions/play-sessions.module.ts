import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {TeamsModule} from '../teams/teams.module.js';
import {PlaySessionsController} from './play-sessions.controller.js';
import {PlaySessionsService} from './play-sessions.service.js';
@Module({imports:[AuthModule,TeamsModule],controllers:[PlaySessionsController],providers:[PlaySessionsService]})
export class PlaySessionsModule {}
