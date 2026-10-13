import { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
export declare class ProfilesExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void;
    private getErrorCodeForStatus;
}
