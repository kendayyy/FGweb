import {Controller,Get,Post,Body,Param,Query,Req,Res,UseGuards,UseFilters,UseInterceptors,UploadedFile} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ErrorCode} from '@fg/contracts';
import type {Request,Response} from 'express';
import {SessionGuard} from '../../common/session.guard.js';
import {CsrfGuard} from '../../common/csrf.guard.js';
import {ChatExceptionFilter} from '../chat/chat.exception-filter.js';
import {ChatService,chatError} from '../chat/chat.service.js';
import {CryptoLegacyService} from './crypto-legacy.service.js';
import {CryptoRelayService} from './crypto-relay.service.js';
@Controller('api/v1/crypto/conversations/:id/legacy')@UseGuards(CsrfGuard,SessionGuard)@UseFilters(ChatExceptionFilter)
export class CryptoLegacyController{
 constructor(private readonly chat:ChatService,private readonly legacy:CryptoLegacyService,private readonly relay:CryptoRelayService){}
 @Post('uploads')@UseInterceptors(FileInterceptor('file',{limits:{fileSize:5*1024*1024,files:1,fields:1,parts:2,fieldSize:4096}}))
 async upload(@Req()req:Request,@Param('id')id:string,@Body()body:Record<string,unknown>,@Res({passthrough:true})res:Response,@UploadedFile()file?:{buffer:Buffer;size:number}){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  let metadata:unknown;try{if(Object.keys(body).length!==1||typeof body.metadata!=='string')throw new Error();metadata=JSON.parse(body.metadata);}catch{chatError(ErrorCode.INVALID_INPUT,'Invalid upload metadata');}
  return this.relay.uploadLegacyAttachment(await this.chat.actor(req.headers),id,metadata,file);
 }
 @Post('commit')async prepare(@Req()req:Request,@Param('id')id:string,@Body()body:unknown,@Res({passthrough:true})res:Response){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return this.legacy.prepare(await this.chat.actor(req.headers),id,body);}
 @Get('candidates/:candidateId/attachments/:attachmentId')async candidateContent(@Req()req:Request,@Param('id')id:string,@Param('candidateId')candidateId:string,@Param('attachmentId')attachmentId:string,@Query()query:unknown,@Res()res:Response){const bytes=await this.legacy.candidateContent(await this.chat.actor(req.headers),id,candidateId,attachmentId,query);res.setHeader('Content-Type','application/octet-stream');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.send(bytes);}
 @Get('candidates/:candidateId')async candidate(@Req()req:Request,@Param('id')id:string,@Param('candidateId')candidateId:string,@Query()query:unknown,@Res({passthrough:true})res:Response){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return this.legacy.candidate(await this.chat.actor(req.headers),id,candidateId,query);}
 @Post('attest')async attest(@Req()req:Request,@Param('id')id:string,@Body()body:unknown,@Res({passthrough:true})res:Response){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return this.legacy.attest(await this.chat.actor(req.headers),id,body);}
 @Get('batch')async batch(@Req()req:Request,@Param('id')id:string,@Query()query:unknown,@Res({passthrough:true})res:Response){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return this.legacy.batch(await this.chat.actor(req.headers),id,query);}
 @Get('attachments/:attachmentId')async content(@Req()req:Request,@Param('id')id:string,@Param('attachmentId')attachmentId:string,@Query()query:unknown,@Res()res:Response){const bytes=await this.legacy.content(await this.chat.actor(req.headers),id,attachmentId,query);res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.send(bytes);}
}
