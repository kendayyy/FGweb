import {UploadsModule} from './modules/uploads/uploads.module.js';
import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { PresenceModule } from './modules/presence/presence.module.js';

@Module({
  imports: [AuthModule, ProfilesModule, ChatModule, RealtimeModule, UploadsModule, PresenceModule],
})
export class AppModule {}
