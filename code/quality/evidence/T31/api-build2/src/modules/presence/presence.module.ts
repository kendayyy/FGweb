import { Module } from '@nestjs/common';
import { PresenceController } from './presence.controller.js';
import { PresenceGateway } from './presence.gateway.js';
import { PresenceService } from './presence.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';

@Module({
  imports: [AuthModule, ChatModule],
  controllers: [PresenceController],
  providers: [PresenceService, PresenceGateway],
  exports: [PresenceService],
})
export class PresenceModule {}
