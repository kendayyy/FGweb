import {Injectable,OnModuleInit,OnModuleDestroy,Logger} from '@nestjs/common';import {Redis} from 'ioredis';import {createHash} from 'node:crypto';import {ModerationService} from './moderation.service.js';import {CallsService} from '../calls/calls.service.js';
@Injectable()
export class ModerationJobsService implements OnModuleInit,OnModuleDestroy{
 private publisher?:Redis;private timer?:ReturnType<typeof setInterval>;private running?:Promise<void>;private closing=false;private readonly logger=new Logger(ModerationJobsService.name);
 constructor(private readonly service:ModerationService,private readonly calls:CallsService){}
 onModuleInit(){this.timer=setInterval(()=>{if(this.running||this.closing)return;this.running=this.service.dispatch(async id=>{if(!process.env.REDIS_URL)throw new Error('Redis required');if(!this.publisher){this.publisher=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:1,connectTimeout:3000});this.publisher.on('error',()=>this.logger.warn('Moderation event bus unavailable'));}await this.publisher.publish('fg:chat:'+createHash('sha256').update(process.env.DATABASE_URL??'').digest('hex').slice(0,24),'M:'+id);},id=>this.calls.finishModeration(id)).catch(()=>this.logger.warn('Moderation delivery retry pending')).finally(()=>{this.running=undefined;});},200);this.timer.unref();}
 async onModuleDestroy(){this.closing=true;clearInterval(this.timer);await this.running;this.publisher?.disconnect();}
}
