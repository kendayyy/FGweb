import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {ChatModule} from '../chat/chat.module.js';
import {PrivateNotificationsService} from './private-notifications.service.js';
import {PrivateNotificationsController} from './private-notifications.controller.js';
@Module({imports:[AuthModule,ChatModule],providers:[PrivateNotificationsService],controllers:[PrivateNotificationsController],exports:[PrivateNotificationsService]})
export class PrivateNotificationsModule{}
