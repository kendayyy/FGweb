import { AuthenticatedRequest } from '../../common/session.guard.js';
import { AuthService } from './auth.service.js';
import { MeDTO } from '@fg/contracts';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    getMe(req: AuthenticatedRequest): Promise<MeDTO>;
}
