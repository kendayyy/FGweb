import {Controller,Get,Post,Req,Param,Body,UseGuards,UseFilters} from '@nestjs/common';
import {PlaySessionActionRequestSchema,PlaySessionRequestDecisionSchema,ErrorCode} from '@fg/contracts';
import {SessionGuard,AuthenticatedRequest} from '../../common/session.guard.js';
import {CsrfGuard} from '../../common/csrf.guard.js';
import {RequireOnboardedGuard} from '../auth/onboarded.guard.js';
import {RoomsExceptionFilter} from '../rooms/rooms.exception-filter.js';
import {roomError} from '../rooms/rooms.service.js';
import {PlaySessionsService} from './play-sessions.service.js';
function empty(body:unknown){if(!PlaySessionActionRequestSchema.safeParse(body).success)roomError(ErrorCode.INVALID_INPUT,'Body must be empty');}
@Controller('api/v1/play-sessions')
@UseGuards(SessionGuard,CsrfGuard,RequireOnboardedGuard)
@UseFilters(RoomsExceptionFilter)
export class PlaySessionsController {
 constructor(private readonly service:PlaySessionsService){}
 @Post(':id/join')
 join(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){empty(body);return this.service.join(req.user!.id,req.session!.id,id);}
 @Get(':id/requests')
 requests(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.service.requests(req.user!.id,req.session!.id,id);}
 @Post(':id/requests/:requestId/respond')
 respond(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Param('requestId') requestId:string,@Body() body:unknown){const parsed=PlaySessionRequestDecisionSchema.safeParse(body);if(!parsed.success)roomError(ErrorCode.INVALID_INPUT,'Invalid decision body');return this.service.respond(req.user!.id,req.session!.id,id,requestId,parsed.data.action);}
 @Post(':id/start')
 start(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){empty(body);return this.service.start(req.user!.id,req.session!.id,id);}
 @Post(':id/leave')
 leave(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){empty(body);return this.service.leave(req.user!.id,req.session!.id,id);}
 @Post(':id/end')
 end(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){empty(body);return this.service.end(req.user!.id,req.session!.id,id);}
}
