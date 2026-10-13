import { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
export declare class ChatExceptionFilter implements ExceptionFilter {
    catch(error: unknown, host: ArgumentsHost): void;
}
