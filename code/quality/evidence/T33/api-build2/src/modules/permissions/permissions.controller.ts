import {Controller,Get,Put,Param,Body,Req,UseGuards,UseFilters} from '@nestjs/common';
import {UpdateHelperPermissionsRequestSchema,ErrorCode} from '@fg/contracts';
import {SessionGuard,AuthenticatedRequest} from '../../common/session.guard.js';
import {CsrfGuard} from '../../common/csrf.guard.js';
import {RequireOnboardedGuard} from '../auth/onboarded.guard.js';
import {RoomsExceptionFilter} from '../rooms/rooms.exception-filter.js';
import {RoomsService,roomError} from '../rooms/rooms.service.js';
@Controller('api/v1/rooms')
@UseGuards(SessionGuard,CsrfGuard,RequireOnboardedGuard)
@UseFilters(RoomsExceptionFilter)
export class PermissionsController {
 constructor(private readonly rooms:RoomsService){}
 @Get(':id/settings')
 async settings(@Req() req:AuthenticatedRequest,@Param('id') id:string){return (await this.rooms.getRoomDetail(req.user!.id,req.session!.id,id)).settings;}
 @Put(':id/helpers/:userId')
 grants(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Param('userId') userId:string,@Body() body:unknown){
  const parsed=UpdateHelperPermissionsRequestSchema.safeParse(body);if(!parsed.success)roomError(ErrorCode.INVALID_INPUT,'Invalid delegated permissions');
  return this.rooms.updateHelperPermissions(req.user!.id,req.session!.id,id,userId,parsed.data);
 }
}
