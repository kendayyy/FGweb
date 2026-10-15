import {Body,Controller,Get,Param,Post,Query,Req,Res,UploadedFile,UseInterceptors,UseGuards,UseFilters} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import type {Request,Response} from 'express';
import {ErrorCode} from '@fg/contracts';
import {SessionGuard} from '../../common/session.guard.js';
import {CsrfGuard} from '../../common/csrf.guard.js';
import {ChatService,chatError} from '../chat/chat.service.js';
import {ChatExceptionFilter} from '../chat/chat.exception-filter.js';
import {CryptoRelayService} from './crypto-relay.service.js';
@Controller('api/v1/crypto')@UseGuards(CsrfGuard,SessionGuard)@UseFilters(ChatExceptionFilter)
export class CryptoRelayController{
 constructor(private readonly chat:ChatService,private readonly relay:CryptoRelayService){}
 @Get('conversations/:id/state')async state(@Req()req:Request,@Param('id')id:string){return this.relay.state(await this.chat.actor(req.headers),id);}
 @Post('keys/query')async keys(@Req()req:Request,@Body()body:unknown){return this.relay.queryKeys(await this.chat.actor(req.headers),body);}
 @Post('keys/claim')async claim(@Req()req:Request,@Body()body:unknown){return this.relay.claimKeys(await this.chat.actor(req.headers),body);}
 @Post('verification')async verification(@Req()req:Request,@Body()body:unknown){return this.relay.verification(await this.chat.actor(req.headers),body);}
 @Post('to-device')async toDevice(@Req()req:Request,@Body()body:unknown){return this.relay.toDevice(await this.chat.actor(req.headers),body);}
 @Get('sync')async sync(@Req()req:Request,@Query()query:unknown){return this.relay.sync(await this.chat.actor(req.headers),query);}
 @Post('sync/ack')async ack(@Req()req:Request,@Body()body:unknown){return this.relay.acknowledge(await this.chat.actor(req.headers),body);}
 @Post('conversations/:id/messages')async message(@Req()req:Request,@Param('id')id:string,@Body()body:unknown){return this.relay.sendMessage(await this.chat.actor(req.headers),id,body);}
 @Get('conversations/:id/messages')async history(@Req()req:Request,@Param('id')id:string,@Query()query:unknown){return this.relay.messageHistory(await this.chat.actor(req.headers),id,query);}
 @Post('conversations/:id/attachments')@UseInterceptors(FileInterceptor('file',{limits:{fileSize:5*1024*1024,files:1,fields:1,parts:2,fieldSize:4096}}))
 async upload(@Req()req:Request,@Param('id')id:string,@Body()body:Record<string,unknown>,@UploadedFile()file?:{buffer:Buffer;size:number}){
  let metadata:unknown;try{if(Object.keys(body).length!==1||typeof body.metadata!=='string')throw new Error();metadata=JSON.parse(body.metadata);}catch{chatError(ErrorCode.INVALID_INPUT,'Invalid upload metadata');}
  return this.relay.uploadAttachment(await this.chat.actor(req.headers),id,metadata,file);
 }
 @Get('conversations/:id/attachments/:attachmentId')async object(@Req()req:Request,@Param('id')id:string,@Param('attachmentId')attachmentId:string,@Res()res:Response){const bytes=await this.relay.readAttachment(await this.chat.actor(req.headers),id,attachmentId);res.setHeader('Content-Type','application/octet-stream');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.send(bytes);}
}
