import {Module} from '@nestjs/common';import {AuthModule} from '../auth/auth.module.js';import {CallsModule} from '../calls/calls.module.js';import {ExternalLiveController} from './external-live.controller.js';import {ExternalLiveService} from './external-live.service.js';
@Module({imports:[AuthModule,CallsModule],controllers:[ExternalLiveController],providers:[ExternalLiveService],exports:[ExternalLiveService]})
export class ExternalLiveModule{}
