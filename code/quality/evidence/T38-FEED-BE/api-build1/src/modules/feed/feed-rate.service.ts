import {Injectable,HttpException,ServiceUnavailableException,type OnModuleDestroy} from '@nestjs/common';import {Redis} from 'ioredis';import {createHash} from 'node:crypto';import {ErrorCode} from '@fg/contracts';import {chatError} from '../chat/chat.service.js';
export type FeedWriteAction='post'|'postEdit'|'comment'|'commentEdit'|'like'|'delete'|'upload';
const limits:Record<FeedWriteAction,number>={post:10,postEdit:30,comment:60,commentEdit:60,like:120,delete:30,upload:40};
const increment="local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end;return n";
@Injectable()
export class FeedRateService implements OnModuleDestroy{
 private client?:Redis;private opening?:Promise<void>;private stopped=false;
 private readonly prefix=process.env.FG_FEED_REDIS_PREFIX??'fg:feed:'+createHash('sha256').update(process.env.DATABASE_URL??'').digest('hex').slice(0,24);
 private async ready(){if(this.stopped||!process.env.REDIS_URL)throw new ServiceUnavailableException('Feed quota unavailable');if(!this.opening){const client=new Redis(process.env.REDIS_URL,{lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:0,connectTimeout:3000,commandTimeout:3000,retryStrategy:()=>null});client.on('error',()=>undefined);this.client=client;this.opening=client.connect().then(()=>{if(this.stopped)throw new ServiceUnavailableException('Feed quota unavailable');}).catch(error=>{client.disconnect();if(this.client===client){this.client=undefined;this.opening=undefined;}throw error;});}await this.opening;}
 async take(userId:string,action:FeedWriteAction){try{await this.ready();const actor=createHash('sha256').update(JSON.stringify([userId])).digest('hex'),value=Number(await this.client!.eval(increment,1,this.prefix+':'+action+':'+actor,'60000'));if(!Number.isSafeInteger(value)||value<1)throw new ServiceUnavailableException('Feed quota unavailable');if(value>limits[action])chatError(ErrorCode.RATE_LIMITED,'Feed write limit');}catch(error){if(error instanceof HttpException)throw error;this.client?.disconnect();this.client=undefined;this.opening=undefined;throw new ServiceUnavailableException('Feed quota unavailable');}}
 async onModuleDestroy(){this.stopped=true;this.client?.disconnect();await this.opening?.catch(()=>undefined);this.client=undefined;this.opening=undefined;}
}
