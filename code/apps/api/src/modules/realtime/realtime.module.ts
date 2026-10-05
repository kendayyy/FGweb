import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
@Module({ imports: [ChatModule], providers: [RealtimeGateway] })
export class RealtimeModule {
}
