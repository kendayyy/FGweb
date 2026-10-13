import {Controller,Post,Req,HttpCode,HttpException} from '@nestjs/common';
import type {Request} from 'express';
import {CallLifecycleService} from './call-lifecycle.service.js';
@Controller('api/media')
export class CallWebhookController {
 constructor(private readonly lifecycle:CallLifecycleService){}
 @Post('webhook')
 @HttpCode(200)
 receive(@Req() req:Request&{rawBody?:Buffer}){
  const raw=req.rawBody??(Buffer.isBuffer(req.body)?req.body:undefined);
  if(!raw||raw.length>65536)throw new HttpException({code:'INVALID_INPUT',message:'Raw webhook body required'},400);
  return this.lifecycle.receive(raw.toString('utf8'),req.headers.authorization);
 }
}
