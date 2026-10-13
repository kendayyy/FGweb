import {Controller,Get,Header,Query,Req,UseFilters,UseGuards} from '@nestjs/common';
import type {Request} from 'express';
import {SessionGuard} from '../../common/session.guard.js';
import {ChatExceptionFilter} from '../chat/chat.exception-filter.js';
import {ChatService} from '../chat/chat.service.js';
import {PrivateNotificationsService} from './private-notifications.service.js';
@Controller('api/v1/notifications')@UseGuards(SessionGuard)@UseFilters(ChatExceptionFilter)
export class PrivateNotificationsController{
 constructor(private readonly chat:ChatService,private readonly notices:PrivateNotificationsService){}
 @Get()@Header('Cache-Control','no-store')async list(@Req()req:Request,@Query()query:unknown){return this.notices.list(await this.chat.actor(req.headers),query);}
}
