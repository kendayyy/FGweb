import {Controller,Get,Put,Post,Delete,Req,Res,Param,Body,HttpCode,UseGuards,UseFilters} from '@nestjs/common';import type {Response} from 'express';
import {SetExternalLiveRequestSchema,CallActionRequestSchema,ErrorCode} from '@fg/contracts';import {SessionGuard,type AuthenticatedRequest} from '../../common/session.guard.js';import {CsrfGuard} from '../../common/csrf.guard.js';import {RequireOnboardedGuard} from '../auth/onboarded.guard.js';import {RoomsExceptionFilter} from '../rooms/rooms.exception-filter.js';import {roomError} from '../rooms/rooms.service.js';import {ExternalLiveService} from './external-live.service.js';
@Controller('api/v1/calls/:id/external-live')
@UseGuards(SessionGuard,CsrfGuard,RequireOnboardedGuard)
@UseFilters(RoomsExceptionFilter)
export class ExternalLiveController{
 constructor(private readonly sources:ExternalLiveService){}
 @Get()
 async get(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Res() res:Response){res.status(200).json(await this.sources.get(req.user!.id,req.session!.id,id));}
 @Put()
 @HttpCode(200)
 put(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){return this.set(req,id,body);}
 @Post()
 @HttpCode(200)
 post(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){return this.set(req,id,body);}
 private set(req:AuthenticatedRequest,id:string,body:unknown){const parsed=SetExternalLiveRequestSchema.safeParse(body);if(!parsed.success)roomError(ErrorCode.INVALID_INPUT,'Invalid external live input');return this.sources.set(req.user!.id,req.session!.id,id,parsed.data);}
 @Delete()
 @HttpCode(200)
 remove(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){if(!CallActionRequestSchema.safeParse(body===undefined?{}:body).success)roomError(ErrorCode.INVALID_INPUT,'Body must be empty');return this.sources.remove(req.user!.id,req.session!.id,id);}
}
