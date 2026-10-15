import {Controller,Get,Patch,Body,Param,Req,Header,UseGuards,UseFilters} from '@nestjs/common';import {z} from 'zod';import type {Request} from 'express';
import {SessionGuard} from '../../common/session.guard.js';import {CsrfGuard} from '../../common/csrf.guard.js';import {ChatExceptionFilter} from '../chat/chat.exception-filter.js';import {ChatService,chatError} from '../chat/chat.service.js';import {ErrorCode} from '@fg/contracts';import {NotificationsService} from './notifications.service.js';
@Controller('api/v1/notifications')@UseGuards(SessionGuard)@UseFilters(ChatExceptionFilter)
export class NotificationsController {
 constructor(private readonly chat:ChatService,private readonly notices:NotificationsService){}
 @Get('unread-count')@Header('Cache-Control','no-store')async unread(@Req()req:Request){return this.notices.unread(await this.chat.actor(req.headers));}
 @Get('preferences')@Header('Cache-Control','no-store')async preferences(@Req()req:Request){return this.notices.preferences(await this.chat.actor(req.headers));}
 @Patch('preferences')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')async patchPreferences(@Req()req:Request,@Body()body:unknown){return this.notices.patchPreferences(await this.chat.actor(req.headers),body);}
 @Patch('read-all')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')async readAll(@Req()req:Request,@Body()body:unknown){if(!z.object({}).strict().safeParse(body??{}).success)chatError(ErrorCode.INVALID_INPUT,'Invalid read request');return this.notices.markRead(await this.chat.actor(req.headers));}
 @Patch(':id/read')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')async read(@Req()req:Request,@Param('id')id:string,@Body()body:unknown){if(!z.object({}).strict().safeParse(body??{}).success)chatError(ErrorCode.INVALID_INPUT,'Invalid read request');return this.notices.markRead(await this.chat.actor(req.headers),id);}
}
