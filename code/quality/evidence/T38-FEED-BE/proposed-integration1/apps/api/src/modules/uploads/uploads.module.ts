import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { UploadsService } from './uploads.service.js';
import { UploadsController } from './uploads.controller.js';
import {FeedInfrastructureModule} from '../feed/feed-infrastructure.module.js';
@Module({ imports: [AuthModule, ChatModule,FeedInfrastructureModule], providers: [UploadsService, { provide: 'FG_IMAGE_STORE', useExisting: UploadsService }], controllers: [UploadsController],exports:[UploadsService] })
export class UploadsModule {
}
