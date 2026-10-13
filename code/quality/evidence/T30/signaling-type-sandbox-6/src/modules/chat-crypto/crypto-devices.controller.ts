import {Body,Controller,Delete,Get,Param,Post,Put,Req,UseFilters,UseGuards} from '@nestjs/common';
import type {Request} from 'express';
import {UploadOneTimeKeysSchema,ErrorCode} from '@fg/contracts';
import {SessionGuard} from '../../common/session.guard.js';
import {CsrfGuard} from '../../common/csrf.guard.js';
import {ChatService,chatError} from '../chat/chat.service.js';
import {ChatExceptionFilter} from '../chat/chat.exception-filter.js';
import {CryptoDevicesService} from './crypto-devices.service.js';
@Controller('api/v1/crypto')
@UseGuards(CsrfGuard,SessionGuard)
@UseFilters(ChatExceptionFilter)
export class CryptoDevicesController{
 constructor(private readonly chat:ChatService,private readonly devices:CryptoDevicesService){}
 @Post('devices')async register(@Req()req:Request,@Body()body:unknown){return this.devices.register(await this.chat.actor(req.headers),body);}
 @Get('devices')async list(@Req()req:Request){return this.devices.list(await this.chat.actor(req.headers));}
 @Delete('devices/:deviceId')async revoke(@Req()req:Request,@Param('deviceId')deviceId:string){return this.devices.revoke(await this.chat.actor(req.headers),deviceId);}
 @Post('devices/:deviceId/one-time-keys')async prekeys(@Req()req:Request,@Param('deviceId')deviceId:string,@Body()body:unknown){
  const parsed=UploadOneTimeKeysSchema.safeParse(body);if(!parsed.success)chatError(ErrorCode.INVALID_INPUT,'Invalid prekeys');
  return this.devices.uploadPrekeys(await this.chat.actor(req.headers),deviceId,parsed.data.oneTimeKeys);
 }
 @Put('recovery')async putRecovery(@Req()req:Request,@Body()body:unknown){return this.devices.putRecovery(await this.chat.actor(req.headers),body);}
 @Get('recovery')async getRecovery(@Req()req:Request){return this.devices.getRecovery(await this.chat.actor(req.headers));}
 @Delete('recovery')async deleteRecovery(@Req()req:Request){return this.devices.deleteRecovery(await this.chat.actor(req.headers));}
 @Put('identity')async identity(@Req()req:Request,@Body()body:unknown){return this.devices.putIdentity(await this.chat.actor(req.headers),body);}
 @Post('signatures')async signatures(@Req()req:Request,@Body()body:unknown){return this.devices.uploadSignatures(await this.chat.actor(req.headers),body);}
}
