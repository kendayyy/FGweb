import { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
export declare class SocialExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void;
    private getErrorCodeForStatus;
}
