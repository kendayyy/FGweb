import {Controller,Post,Get,Patch,Delete,Req,Body,Query,Param,Header,UseGuards,UseFilters} from '@nestjs/common';import {SessionGuard,type AuthenticatedRequest} from '../../common/session.guard.js';import {CsrfGuard} from '../../common/csrf.guard.js';import {RequireAdminGuard} from '../auth/admin.guard.js';import {BackendExceptionFilter} from '../support/backend.exception-filter.js';import {ModerationService} from './moderation.service.js';
const actor=(r:AuthenticatedRequest)=>({userId:r.user!.id,sessionId:r.session!.id}),query=(q:Record<string,unknown>)=>({...q,...(q.limit===undefined?{}:{limit:Number(q.limit)})});
@Controller('api/v1')@UseGuards(SessionGuard)@UseFilters(BackendExceptionFilter)
export class ModerationController{
 constructor(private readonly service:ModerationService){}
 @Post('reports')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')report(@Req()r:AuthenticatedRequest,@Body()b:unknown){return this.service.report(actor(r),b);}
 @Delete('conversations/:id/messages/:messageId')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')remove(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Param('messageId')message:string,@Body()b:unknown){return this.service.removeMessage(actor(r),id,message,b);}
 @Get('admin/reports')@UseGuards(RequireAdminGuard)@Header('Cache-Control','no-store')reports(@Req()r:AuthenticatedRequest,@Query()q:Record<string,unknown>){return this.service.reports(actor(r),query(q));}
 @Patch('admin/reports/:id')@UseGuards(RequireAdminGuard,CsrfGuard)@Header('Cache-Control','no-store')resolve(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Body()b:unknown){return this.service.resolve(actor(r),id,b);}
 @Get('admin/users')@UseGuards(RequireAdminGuard)@Header('Cache-Control','no-store')users(@Req()r:AuthenticatedRequest,@Query()q:Record<string,unknown>){return this.service.users(actor(r),query(q));}
 @Patch('admin/users/:id/ban')@UseGuards(RequireAdminGuard,CsrfGuard)@Header('Cache-Control','no-store')ban(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Body()b:unknown){return this.service.ban(actor(r),id,b);}
}
