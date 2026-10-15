import {ModerationModule} from './modules/moderation/moderation.module.js';
import {SupportModule} from './modules/support/support.module.js';
import {PushModule} from './modules/push/push.module.js';
import { ExternalLiveModule } from './modules/external-live/external-live.module.js';
import {PrivateNotificationsModule} from './modules/notifications/private-notifications.module.js';
import {CryptoCustodyModule} from './modules/chat-crypto/crypto-custody.module.js';
import {ChatCryptoModule} from './modules/chat-crypto/chat-crypto.module.js';
import {UploadsModule} from './modules/uploads/uploads.module.js';
import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { PresenceModule } from './modules/presence/presence.module.js';
import { SocialModule } from './modules/social/social.module.js';
import { RoomsModule } from './modules/rooms/rooms.module.js';
import { RecruitmentsModule } from './modules/recruitments/recruitments.module.js';
import { TeamsModule } from './modules/teams/teams.module.js';
import { InvitationsModule } from './modules/invitations/invitations.module.js';
import { PlaySessionsModule } from './modules/play-sessions/play-sessions.module.js';
import { CallsModule } from './modules/calls/calls.module.js';

@Module({
  imports: [ModerationModule,SupportModule,PushModule,PrivateNotificationsModule,CryptoCustodyModule, ChatCryptoModule, AuthModule, ProfilesModule, ChatModule, RealtimeModule, UploadsModule, PresenceModule, SocialModule, RoomsModule, RecruitmentsModule, TeamsModule, InvitationsModule, PlaySessionsModule, CallsModule, ExternalLiveModule],
})
export class AppModule {}
