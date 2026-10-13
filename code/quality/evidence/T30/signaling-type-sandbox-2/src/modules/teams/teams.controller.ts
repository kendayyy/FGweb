import {Controller,Get,Post,Patch,Delete,Req,Param,Body,UseGuards,UseFilters} from '@nestjs/common';
import {z} from 'zod';
import {RespondJoinRequestSchema,CancelJoinRequestSchema,ErrorCode} from '@fg/contracts';
import {SessionGuard,AuthenticatedRequest} from '../../common/session.guard.js';
import {CsrfGuard} from '../../common/csrf.guard.js';
import {RequireOnboardedGuard} from '../auth/onboarded.guard.js';
import {RoomsExceptionFilter} from '../rooms/rooms.exception-filter.js';
import {roomError} from '../rooms/rooms.service.js';
import {TeamsService} from './teams.service.js';
const empty=z.object({}).strict();
function noOverride(body:unknown){if(!empty.safeParse(body??{}).success)roomError(ErrorCode.INVALID_INPUT,'Body must be empty; actor/action comes from session/path');}
@Controller('api/v1')
@UseGuards(SessionGuard,CsrfGuard,RequireOnboardedGuard)
@UseFilters(RoomsExceptionFilter)
export class TeamsController {
 constructor(private readonly service:TeamsService){}
 @Get('recruitments/me/joins')
 mine(@Req() req:AuthenticatedRequest){return this.service.mine(req.user!.id,req.session!.id);}
 @Post(['recruitments/:id/requests','recruitments/:id/join-requests'])
 apply(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){noOverride(body);return this.service.apply(req.user!.id,req.session!.id,id);}
 @Get('recruitments/:id/join-requests')
 list(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.service.requests(req.user!.id,req.session!.id,id);}
 @Post('join-requests/:id/approve')
 approve(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){noOverride(body);return this.service.respond(req.user!.id,req.session!.id,id,'ACCEPT');}
 @Post('join-requests/:id/reject')
 reject(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){noOverride(body);return this.service.respond(req.user!.id,req.session!.id,id,'REJECT');}
 @Patch('join-requests/:id/respond')
 respond(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){const parsed=RespondJoinRequestSchema.strict().safeParse(body);if(!parsed.success)roomError(ErrorCode.INVALID_INPUT,'Invalid response action');return this.service.respond(req.user!.id,req.session!.id,id,parsed.data.action);}
 @Delete('join-requests/:id/cancel')
 cancel(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){const parsed=CancelJoinRequestSchema.strict().safeParse(body);if(!parsed.success||parsed.data.requestId!==id)roomError(ErrorCode.INVALID_INPUT,'Request id must match path');return this.service.cancel(req.user!.id,req.session!.id,id);}
 @Get('play-sessions/:id')
 snapshot(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.service.snapshot(req.user!.id,req.session!.id,id);}
}
