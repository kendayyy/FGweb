import {Body,Controller,Post,Get,Param,Header,Res,Req,UseGuards,UseFilters,UseInterceptors,UploadedFile} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ErrorCode} from '@fg/contracts';
import type {Request,Response} from 'express';
import {SessionGuard} from '../../common/session.guard.js';
import {CsrfGuard} from '../../common/csrf.guard.js';
import {ChatService,chatError} from '../chat/chat.service.js';
import {ChatExceptionFilter} from '../chat/chat.exception-filter.js';
import {CryptoReportsService} from './crypto-reports.service.js';

@Controller('api/v1/crypto/reports')@UseGuards(CsrfGuard,SessionGuard)@UseFilters(ChatExceptionFilter)
export class CryptoReportsController{
 constructor(private readonly chat:ChatService,private readonly reports:CryptoReportsService){}
 @Post()async disclose(@Req()req:Request,@Body()body:unknown){return this.reports.disclose(await this.chat.actor(req.headers),body);}
 @Post(':reportId/read')@Header('Cache-Control','no-store')async read(@Req()req:Request,@Param('reportId')id:string,@Body()body:unknown){return this.reports.readReport(await this.chat.actor(req.headers),id,body);}
 @Get(':reportId/attachments/:attachmentId')async readImage(@Req()req:Request,@Param('reportId')id:string,@Param('attachmentId')attachmentId:string,@Res()res:Response){const bytes=await this.reports.readImage(await this.chat.actor(req.headers),id,attachmentId);res.set({'Cache-Control':'no-store','Content-Type':'image/webp','X-Content-Type-Options':'nosniff'});res.send(bytes);}
 @Post('attachments')@UseInterceptors(FileInterceptor('file',{limits:{fileSize:5*1024*1024,files:1,fields:1,parts:2,fieldSize:4096}}))
 async image(@Req()req:Request,@Body()body:Record<string,unknown>,@UploadedFile()file?:{buffer:Buffer;size:number;mimetype:string}){
  let metadata:unknown;try{if(Object.keys(body).length!==1||typeof body.metadata!=='string')throw new Error();metadata=JSON.parse(body.metadata);}catch{chatError(ErrorCode.INVALID_INPUT,'Invalid disclosure metadata');}
  return this.reports.uploadImage(await this.chat.actor(req.headers),metadata,file);
 }
}
