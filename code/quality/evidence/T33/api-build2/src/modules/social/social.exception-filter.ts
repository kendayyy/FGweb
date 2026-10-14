import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode } from '@fg/contracts';

@Catch()
export class SocialExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      `req_${Math.random().toString(36).substring(2, 10)}`;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
    }

    if (status >= 500) {
      response.status(500).json({
        statusCode: 500,
        message: 'Internal server error',
        requestId,
      });
      return;
    }

    let code: ErrorCode = this.getErrorCodeForStatus(status);
    let message = 'Request failed';
    let details: Record<string, unknown> | undefined = undefined;

    if (exception instanceof HttpException) {
      const resBody = exception.getResponse();

      if (typeof resBody === 'object' && resBody !== null) {
        const bodyObj = resBody as Record<string, unknown>;
        if (
          bodyObj.code &&
          typeof bodyObj.code === 'string' &&
          Object.values(ErrorCode).includes(bodyObj.code as ErrorCode)
        ) {
          code = bodyObj.code as ErrorCode;
        }
        if (bodyObj.message) {
          message = Array.isArray(bodyObj.message)
            ? bodyObj.message.join('; ')
            : String(bodyObj.message);
        } else {
          message = exception.message;
        }
        if (bodyObj.details && typeof bodyObj.details === 'object') {
          details = bodyObj.details as Record<string, unknown>;
        }
      } else if (typeof resBody === 'string') {
        message = resBody;
      } else {
        message = exception.message;
      }
    }

    response.status(status).json({
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    });
  }

  private getErrorCodeForStatus(status: number): ErrorCode {
    switch (status) {
      case 401:
        return ErrorCode.LOGIN_REQUIRED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 422:
        return ErrorCode.INVALID_INPUT;
      case 409:
        return ErrorCode.ACTIVE_PLAY_CONFLICT;
      case 429:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INVALID_INPUT;
    }
  }
}
