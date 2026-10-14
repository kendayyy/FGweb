import {NotificationsService} from './notifications.service.js';
import {NotificationsController} from './notifications.controller.js';
import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {ChatModule} from '../chat/chat.module.js';
import {PrivateNotificationsService} from './private-notifications.service.js';
import {PrivateNotificationsController} from './private-notifications.controller.js';
@Module({imports:[AuthModule,ChatModule],providers:[PrivateNotificationsService,NotificationsService],controllers:[PrivateNotificationsController,NotificationsController],exports:[PrivateNotificationsService,NotificationsService]})
export class PrivateNotificationsModule{}
