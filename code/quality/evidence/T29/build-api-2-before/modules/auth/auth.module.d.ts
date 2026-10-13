import { NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AuthService } from './auth.service.js';
export declare class AuthModule implements NestModule {
    private readonly authService;
    constructor(authService: AuthService);
    configure(consumer: MiddlewareConsumer): void;
}
