import { Catch, ExceptionFilter, ArgumentsHost, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '@fg/contracts';
@Catch()
export class ChatExceptionFilter implements ExceptionFilter {
    catch(error: unknown, host: ArgumentsHost) { const response = host.switchToHttp().getResponse<Response>(); if (error instanceof HttpException) {
        const status = error.getStatus();
        const body = error.getResponse();
        const code = status === 401 ? ErrorCode.LOGIN_REQUIRED : status === 404 ? ErrorCode.NOT_FOUND : status === 422 ? ErrorCode.INVALID_INPUT : ErrorCode.FORBIDDEN;
        response.status(status).json({ code, message: 'Request denied', requestId: randomUUID(), ...(typeof body === 'object' ? body : {}) });
    }
    else
        response.status(500).json({ message: 'Internal server error', requestId: randomUUID() }); }
}
