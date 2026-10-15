import {Catch,type ArgumentsHost} from '@nestjs/common';import type {Response} from 'express';import {BackendExceptionFilter} from '../support/backend.exception-filter.js';
@Catch()export class FeedExceptionFilter extends BackendExceptionFilter{
 catch(error:unknown,host:ArgumentsHost){host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','private, no-store');super.catch(error,host);}
}
