import {Module} from '@nestjs/common';import {AuthModule} from '../auth/auth.module.js';import {ChatModule} from '../chat/chat.module.js';import {PushController} from './push.controller.js';import {PushService} from './push.service.js';
@Module({imports:[AuthModule,ChatModule],providers:[PushService],controllers:[PushController]})
export class PushModule{}
