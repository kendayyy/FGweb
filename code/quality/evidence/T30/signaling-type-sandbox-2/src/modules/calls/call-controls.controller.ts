import {Controller,Post,Patch,Req,Param,Body,UseGuards,UseFilters} from '@nestjs/common';
import {CallActionRequestSchema,CallModerationRequestSchema,MuteParticipantRequestSchema,KickCallParticipantSchema,RefreshPublishTokenSchema,ErrorCode} from '@fg/contracts';
import {SessionGuard,type AuthenticatedRequest} from '../../common/session.guard.js';
import {CsrfGuard} from '../../common/csrf.guard.js';
import {RequireOnboardedGuard} from '../auth/onboarded.guard.js';
import {RoomsExceptionFilter} from '../rooms/rooms.exception-filter.js';
import {roomError} from '../rooms/rooms.service.js';
import {CallsService} from './calls.service.js';
import {PublishingService} from './publishing.service.js';
import {CallModerationService} from './call-moderation.service.js';
function empty(body:unknown){if(!CallActionRequestSchema.safeParse(body??{}).success)roomError(ErrorCode.INVALID_INPUT,'Body must be empty');}
@Controller('api/v1')
@UseGuards(SessionGuard,CsrfGuard,RequireOnboardedGuard)
@UseFilters(RoomsExceptionFilter)
export class CallControlsController {
  constructor(private readonly publishing:PublishingService,private readonly moderation:CallModerationService,private readonly calls:CallsService){}
  @Post('calls/:id/screen-share/claim')
  claim(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){empty(body);return this.publishing.claim(req.user!.id,req.session!.id,id);}
  @Post('calls/:id/screen-share/release')
  release(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){empty(body);return this.publishing.release(req.user!.id,req.session!.id,id);}
  @Post('calls/:id/moderation')
  moderate(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){const parsed=CallModerationRequestSchema.safeParse(body);if(!parsed.success)roomError(ErrorCode.INVALID_INPUT,'Invalid moderation action');return this.moderation.moderate(req.user!.id,req.session!.id,id,parsed.data);}
  @Post('calls/:id/publish-token')
  publishToken(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){const parsed=RefreshPublishTokenSchema.safeParse(body);if(!parsed.success||parsed.data.callId!==id)roomError(ErrorCode.INVALID_INPUT,'Call path/body mismatch');return this.publishing.claim(req.user!.id,req.session!.id,id);}
  private async participant(req:AuthenticatedRequest,id:string,target:string){const people=await this.calls.participants(req.user!.id,req.session!.id,id);const person=people.find(p=>p.userId===target);if(!person)roomError(ErrorCode.FORBIDDEN,'Current call target required');return person;}
  @Patch('calls/:id/participants/:userId/mute')
  async mute(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Param('userId') target:string,@Body() body:unknown){const parsed=MuteParticipantRequestSchema.safeParse(body);if(!parsed.success)roomError(ErrorCode.INVALID_INPUT,'Invalid microphone action');await this.moderation.moderate(req.user!.id,req.session!.id,id,{action:parsed.data.muted?'MUTE_MIC':'ALLOW_MIC',targetUserId:target});return this.participant(req,id,target);}
  @Post('calls/:id/participants/:userId/kick')
  kick(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Param('userId') target:string,@Body() body:unknown){const parsed=KickCallParticipantSchema.safeParse(body);if(!parsed.success||parsed.data.targetUserId!==target)roomError(ErrorCode.INVALID_INPUT,'Target path/body mismatch');return this.moderation.moderate(req.user!.id,req.session!.id,id,{action:'KICK',targetUserId:target});}
  @Post('calls/:id/participants/:userId/stop-publish')
  async stop(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Param('userId') target:string,@Body() body:unknown){empty(body);await this.moderation.moderate(req.user!.id,req.session!.id,id,{action:'STOP_SCREEN_SHARE',targetUserId:target});return this.participant(req,id,target);}
}
