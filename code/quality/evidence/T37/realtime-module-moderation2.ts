import {ModerationModule} from '../moderation/moderation.module.js';
import {PrivateNotificationsModule} from '../notifications/private-notifications.module.js';
import {ChatCryptoModule} from '../chat-crypto/chat-crypto.module.js';
import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
@Module({ imports: [ModerationModule,PrivateNotificationsModule,ChatModule,ChatCryptoModule], providers: [RealtimeGateway] })
export class RealtimeModule {
}
