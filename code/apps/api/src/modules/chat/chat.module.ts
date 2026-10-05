import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
@Module({ imports: [AuthModule], providers: [ChatService], controllers: [ChatController], exports: [ChatService] })
export class ChatModule {
}
