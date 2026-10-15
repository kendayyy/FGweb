import {Controller,Get,Post,Patch,Param,Body,Req,UseGuards,UseFilters} from '@nestjs/common';
import {CreateInvitationRequestSchema,RespondInvitationSchema,ApproveInvitationSchema,ErrorCode} from '@fg/contracts';
import {SessionGuard,AuthenticatedRequest} from '../../common/session.guard.js';
import {CsrfGuard} from '../../common/csrf.guard.js';
import {RequireOnboardedGuard} from '../auth/onboarded.guard.js';
import {RoomsExceptionFilter} from '../rooms/rooms.exception-filter.js';
import {roomError} from '../rooms/rooms.service.js';
import {InvitationsService} from './invitations.service.js';
@Controller('api/v1/invitations')
@UseGuards(SessionGuard,CsrfGuard,RequireOnboardedGuard)
@UseFilters(RoomsExceptionFilter)
export class InvitationsController {
 constructor(private readonly service:InvitationsService){}
 @Get('me')
 mine(@Req() req:AuthenticatedRequest){return this.service.mine(req.user!.id,req.session!.id);}
 @Post()
 create(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  const parsed=CreateInvitationRequestSchema.safeParse(body);if(!parsed.success)roomError(ErrorCode.INVALID_INPUT,'Invalid invitation payload');
  return this.service.create(req.user!.id,req.session!.id,parsed.data);
 }
 @Patch(':id/respond')
 respond(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){
  const parsed=RespondInvitationSchema.safeParse(body);if(!parsed.success)roomError(ErrorCode.INVALID_INPUT,'Invalid invitation response');
  return this.service.respond(req.user!.id,req.session!.id,id,parsed.data.action);
 }
 @Post(':id/approve')
 approve(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){
  const parsed=ApproveInvitationSchema.safeParse(body);if(!parsed.success||parsed.data.invitationId!==id)roomError(ErrorCode.INVALID_INPUT,'Invalid approval identity/action');
  return this.service.approve(req.user!.id,req.session!.id,id,parsed.data.action);
 }
}
