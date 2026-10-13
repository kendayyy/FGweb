import {Controller,Get,Post,Req,Param,Body,Query,UseGuards,UseFilters} from '@nestjs/common';
import {CallActionRequestSchema,ListCallParticipantsQuerySchema,ToggleSelfMicRequestSchema,ErrorCode} from '@fg/contracts';
import {SessionGuard,AuthenticatedRequest} from '../../common/session.guard.js';
import {CsrfGuard} from '../../common/csrf.guard.js';
import {RequireOnboardedGuard} from '../auth/onboarded.guard.js';
import {RoomsExceptionFilter} from '../rooms/rooms.exception-filter.js';
import {roomError} from '../rooms/rooms.service.js';
import {CallsService} from './calls.service.js';
function empty(body:unknown){if(!CallActionRequestSchema.safeParse(body).success)roomError(ErrorCode.INVALID_INPUT,'Body must be empty');}
@Controller('api/v1')
@UseGuards(SessionGuard,CsrfGuard,RequireOnboardedGuard)
@UseFilters(RoomsExceptionFilter)
export class CallsController {
 constructor(private readonly calls:CallsService){}
 @Post('rooms/:roomId/calls')
 create(@Req() req:AuthenticatedRequest,@Param('roomId') id:string,@Body() body:unknown){empty(body);return this.calls.create(req.user!.id,req.session!.id,id);}
 @Get('rooms/:roomId/calls')
 list(@Req() req:AuthenticatedRequest,@Param('roomId') id:string){return this.calls.list(req.user!.id,req.session!.id,id);}
 @Post('calls/:id/join')
 join(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){empty(body);return this.calls.join(req.user!.id,req.session!.id,id);}
 @Post('calls/:id/leave')
 leave(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){empty(body);return this.calls.leave(req.user!.id,req.session!.id,id);}
 @Get('calls/:id/participants')
 participants(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Query() query:Record<string,unknown>){
  if(Object.keys(query).some(key=>key!=='callId')||(query.callId!==undefined&&query.callId!==id)||!ListCallParticipantsQuerySchema.safeParse({callId:id}).success)roomError(ErrorCode.INVALID_INPUT,'Invalid call participant query');
  return this.calls.participants(req.user!.id,req.session!.id,id);
 }
 @Post('calls/:id/self-mic')
 selfMic(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){const parsed=ToggleSelfMicRequestSchema.safeParse(body);if(!parsed.success)roomError(ErrorCode.INVALID_INPUT,'Invalid microphone action');return this.calls.selfMic(req.user!.id,req.session!.id,id,parsed.data.muted);}
}
