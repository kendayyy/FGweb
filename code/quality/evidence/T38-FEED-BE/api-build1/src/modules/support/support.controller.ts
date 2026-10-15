import {Controller,Get,Post,Patch,Body,Param,Query,Req,Header,UseGuards,UseFilters} from '@nestjs/common';import {SessionGuard,type AuthenticatedRequest} from '../../common/session.guard.js';import {CsrfGuard} from '../../common/csrf.guard.js';import {RequireAdminGuard} from '../auth/admin.guard.js';import {BackendExceptionFilter} from './backend.exception-filter.js';import {SupportService} from './support.service.js';
const actor=(r:AuthenticatedRequest)=>({userId:r.user!.id,sessionId:r.session!.id});
@Controller('api/v1/support/requests')@UseGuards(SessionGuard)@UseFilters(BackendExceptionFilter)
export class SupportController{
 constructor(private readonly service:SupportService){}
 @Post()@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')create(@Req()r:AuthenticatedRequest,@Body()b:unknown){return this.service.create(actor(r),b);}
 @Get()@Header('Cache-Control','no-store')list(@Req()r:AuthenticatedRequest,@Query()q:unknown){return this.service.list(actor(r),q);}
 @Get(':id')@Header('Cache-Control','no-store')detail(@Req()r:AuthenticatedRequest,@Param('id')id:string){return this.service.detail(actor(r),id);}
 @Get(':id/messages')@Header('Cache-Control','no-store')messages(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Query()q:unknown){return this.service.messages(actor(r),id,q);}
 @Post(':id/messages')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')send(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Body()b:unknown){return this.service.send(actor(r),id,b);}
 @Post(':id/read')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')read(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Body()b:unknown){return this.service.read(actor(r),id,b);}
}
@Controller('api/v1/admin/support/requests')@UseGuards(SessionGuard,RequireAdminGuard)@UseFilters(BackendExceptionFilter)
export class AdminSupportController{
 constructor(private readonly service:SupportService){}
 @Get()@Header('Cache-Control','no-store')list(@Req()r:AuthenticatedRequest,@Query()q:unknown){return this.service.list(actor(r),q,true);}
 @Get(':id')@Header('Cache-Control','no-store')detail(@Req()r:AuthenticatedRequest,@Param('id')id:string){return this.service.detail(actor(r),id,true);}
 @Get(':id/messages')@Header('Cache-Control','no-store')messages(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Query()q:unknown){return this.service.messages(actor(r),id,q,true);}
 @Post(':id/messages')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')send(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Body()b:unknown){return this.service.send(actor(r),id,b,true);}
 @Post(':id/read')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')read(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Body()b:unknown){return this.service.read(actor(r),id,b,true);}
 @Patch(':id/status')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')status(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Body()b:unknown){return this.service.status(actor(r),id,b);}
 @Get(':id/notes')@Header('Cache-Control','no-store')notes(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Query()q:unknown){return this.service.internal(actor(r),id,'notes',q);}
 @Post(':id/notes')@UseGuards(CsrfGuard)@Header('Cache-Control','no-store')note(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Body()b:unknown){return this.service.note(actor(r),id,b);}
 @Get(':id/audit')@Header('Cache-Control','no-store')audit(@Req()r:AuthenticatedRequest,@Param('id')id:string,@Query()q:unknown){return this.service.internal(actor(r),id,'audit',q);}
}
