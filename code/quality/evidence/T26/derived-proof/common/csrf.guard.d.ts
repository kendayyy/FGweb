import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
export declare class CsrfGuard implements CanActivate {
    static validateRequestOrigin(request: Request): void;
    canActivate(context: ExecutionContext): boolean;
}
