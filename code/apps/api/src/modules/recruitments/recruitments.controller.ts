import { Controller, Get, Post, Patch, Param, Query, Body, Req, UseGuards, UseFilters } from '@nestjs/common';
import { CreateRecruitmentSchema, PublicRecruitmentQuerySchema, ErrorCode } from '@fg/contracts';
import { SessionGuard, AuthenticatedRequest } from '../../common/session.guard.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { RequireOnboardedGuard } from '../auth/onboarded.guard.js';
import { RoomsExceptionFilter } from '../rooms/rooms.exception-filter.js';
import { roomError } from '../rooms/rooms.service.js';
import { RecruitmentsService } from './recruitments.service.js';
@Controller('api/v1')
@UseFilters(RoomsExceptionFilter)
export class RecruitmentsController {
    constructor(private readonly service: RecruitmentsService) { }
    private query(raw: Record<string, unknown>) { const parsed = PublicRecruitmentQuerySchema.safeParse({ ...raw, ...(raw.limit !== undefined ? { limit: Number(raw.limit) } : {}) }); if (!parsed.success)
        roomError(ErrorCode.INVALID_INPUT, 'Invalid recruitment query'); return parsed.data; }
    @Get('recruitments')
    list(
    @Query()
    q: Record<string, unknown>) { return this.service.list(this.query(q)); }
    @Get('games/:id/recruitments/suggestions')
    suggestions(
    @Param('id')
    id: string, 
    @Query()
    q: Record<string, unknown>) { return this.service.list(this.query(q), true, id); }
    @Get('games/:id/recruitments')
    game(
    @Param('id')
    id: string, 
    @Query()
    q: Record<string, unknown>) { return this.service.list(this.query(q), false, id); }
    @Get('recruitments/:id')
    detail(
    @Param('id')
    id: string) { return this.service.publicDetail(id); }
    @Post('recruitments')
    @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
    create(
    @Req()
    req: AuthenticatedRequest, 
    @Body()
    body: unknown) { const parsed = CreateRecruitmentSchema().safeParse(body); if (!parsed.success)
        roomError(ErrorCode.INVALID_INPUT, 'Invalid recruitment input'); return this.service.create(req.user!.id, req.session!.id, parsed.data); }
    @Patch('recruitments/:id/close')
    @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
    close(
    @Req()
    req: AuthenticatedRequest, 
    @Param('id')
    id: string) { return this.service.setOpen(req.user!.id, req.session!.id, id, false); }
    @Patch('recruitments/:id/reopen')
    @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
    reopen(
    @Req()
    req: AuthenticatedRequest, 
    @Param('id')
    id: string) { return this.service.setOpen(req.user!.id, req.session!.id, id, true); }
}
