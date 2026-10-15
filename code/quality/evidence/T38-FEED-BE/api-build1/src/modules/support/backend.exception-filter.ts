import {Catch,HttpException,type ExceptionFilter,type ArgumentsHost} from '@nestjs/common';import type {Response} from 'express';import {randomUUID} from 'node:crypto';import {ErrorCode,ErrorCodeToHttpStatus} from '@fg/contracts';
// New support/moderation boundaries only; legacy filters remain unchanged.
@Catch()
export class BackendExceptionFilter implements ExceptionFilter{
 catch(error:unknown,host:ArgumentsHost){const raw=error instanceof HttpException?error.getStatus():500,status=raw===400?422:raw,response=host.switchToHttp().getResponse<Response>();const fallback=status===401?ErrorCode.LOGIN_REQUIRED:status===403?ErrorCode.FORBIDDEN:status===404?ErrorCode.NOT_FOUND:status===409?ErrorCode.CONFLICT:status===413||status===422?ErrorCode.INVALID_INPUT:status===429?ErrorCode.RATE_LIMITED:status===503?ErrorCode.SERVICE_UNAVAILABLE:ErrorCode.INTERNAL_ERROR;let code=fallback;
  if(error instanceof HttpException){const body=error.getResponse(),candidate=typeof body==='object'&&body!==null&&'code'in body?body.code:undefined;if(typeof candidate==='string'&&Object.values(ErrorCode).includes(candidate as ErrorCode)&&(ErrorCodeToHttpStatus[candidate as ErrorCode]===status||(status===413&&candidate===ErrorCode.INVALID_INPUT)))code=candidate as ErrorCode;}
  response.status(status).json({code,message:status>=500?'Service could not process the request':'Request denied',requestId:randomUUID()});
 }
}
