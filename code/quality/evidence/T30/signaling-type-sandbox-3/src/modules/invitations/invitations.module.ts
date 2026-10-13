import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {TeamsModule} from '../teams/teams.module.js';
import {PermissionsModule} from '../permissions/permissions.module.js';
import {InvitationsService} from './invitations.service.js';
import {InvitationsController} from './invitations.controller.js';
@Module({imports:[AuthModule,TeamsModule,PermissionsModule],providers:[InvitationsService],controllers:[InvitationsController]})
export class InvitationsModule {}
