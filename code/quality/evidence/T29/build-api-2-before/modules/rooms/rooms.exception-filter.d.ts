import { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
export declare class RoomsExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void;
    private getErrorCodeForStatus;
}
