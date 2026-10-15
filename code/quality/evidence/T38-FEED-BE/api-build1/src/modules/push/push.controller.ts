import {Controller,Post,Delete,Get,Body,Param,Req,Header,UseGuards,UseFilters} from '@nestjs/common';import type {Request} from 'express';
import {SessionGuard} from '../../common/session.guard.js';import {CsrfGuard} from '../../common/csrf.guard.js';import {ChatExceptionFilter} from '../chat/chat.exception-filter.js';import {ChatService} from '../chat/chat.service.js';import {PushService} from './push.service.js';
@Controller('api/v1/push')@UseGuards(SessionGuard)@UseFilters(ChatExceptionFilter)
export class PushController {
 constructor(private readonly chat:ChatService,private readonly push:PushService){}
 @Get('config')@Header('Cache-Control','no-store')async config(@Req()req:Request){return this.push.config(await this.chat.actor(req.headers));}
 @Get('notifications/:id')@Header('Cache-Control','no-store')async target(@Req()req:Request,@Param('id')id:string){return this.push.target(await this.chat.actor(req.headers),id);}
 @Post('subscriptions')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')async register(@Req()req:Request,@Body()body:unknown){return this.push.register(await this.chat.actor(req.headers),body);}
 @Delete('subscriptions')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')async unregister(@Req()req:Request,@Body()body:unknown){return this.push.unregister(await this.chat.actor(req.headers),body);}
}
