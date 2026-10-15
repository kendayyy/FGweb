import {Catch,type ExceptionFilter,type ArgumentsHost} from '@nestjs/common';import type {Request,Response} from 'express';import {BackendExceptionFilter} from '../support/backend.exception-filter.js';import {ChatExceptionFilter} from '../chat/chat.exception-filter.js';
@Catch()export class UploadPurposeExceptionFilter implements ExceptionFilter{
 private readonly feed=new BackendExceptionFilter();private readonly legacy=new ChatExceptionFilter();
 catch(error:unknown,host:ArgumentsHost){const http=host.switchToHttp(),request=http.getRequest<Request>();http.getResponse<Response>().setHeader('Cache-Control','private, no-store');if(request.body&&typeof request.body==='object'&&request.body.purpose==='FEED_POST')this.feed.catch(error,host);else this.legacy.catch(error,host);}
}
