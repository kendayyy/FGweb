import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import {LobbyCipher} from '../chat-crypto/lobby-cipher.js';
@Module({ imports: [AuthModule], providers: [ChatService,LobbyCipher], controllers: [ChatController], exports: [ChatService,LobbyCipher] })
export class ChatModule {
}
