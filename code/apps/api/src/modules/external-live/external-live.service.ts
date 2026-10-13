import {Injectable} from '@nestjs/common';import {randomUUID} from 'node:crypto';import type {PoolClient} from 'pg';
import {ErrorCode,ExternalLiveSchema,type ExternalLiveDTO,type ExternalLiveProvider,type SetExternalLiveRequest} from '@fg/contracts';
import {CallsService} from '../calls/calls.service.js';import {roomError} from '../rooms/rooms.service.js';import {normalizeExternalSource} from './external-source.js';
type SourceRow={id:string;call_group_id:string;provider:ExternalLiveProvider;url:string;video_id:string|null;channel_name:string|null;title:string|null;configured_by:string;created_iso:string};
@Injectable()
export class ExternalLiveService{
 constructor(private readonly calls:CallsService){}
 private async authorized<T>(user:string,session:string,call:string,run:(db:PoolClient)=>Promise<T>){return this.calls.withControlGroup(user,session,call,async db=>{await this.calls.requireAdmission(db,call,user,session);const result=await run(db);await this.calls.requireAdmission(db,call,user,session);return result;});}
 private async read(db:PoolClient,call:string):Promise<ExternalLiveDTO|null>{
  const row=(await db.query<SourceRow>(`SELECT *,to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM external_lives WHERE call_group_id=$1`,[call])).rows[0];if(!row)return null;
  const normalized=normalizeExternalSource(row.provider,row.url);
  if((row.video_id!==null&&(normalized.provider!=='youtube'||row.video_id!==normalized.videoId))||(row.channel_name!==null&&(normalized.provider!=='twitch'||row.channel_name!==normalized.channelName)))roomError(ErrorCode.INVALID_INPUT,'Stored external live identity is inconsistent');
  return ExternalLiveSchema.parse({id:row.id,callId:row.call_group_id,...normalized,title:row.title??undefined,configuredBy:row.configured_by,createdAt:row.created_iso,availability:'unknown'});
 }
 async get(user:string,session:string,call:string){return this.authorized(user,session,call,db=>this.read(db,call));}
 async set(user:string,session:string,call:string,input:SetExternalLiveRequest){const source=normalizeExternalSource(input.provider,input.url);return this.authorized(user,session,call,async db=>{
  await db.query(`INSERT INTO external_lives(id,call_group_id,provider,url,title,configured_by,video_id,channel_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
   ON CONFLICT(call_group_id) DO UPDATE SET provider=EXCLUDED.provider,url=EXCLUDED.url,title=EXCLUDED.title,configured_by=EXCLUDED.configured_by,video_id=EXCLUDED.video_id,channel_name=EXCLUDED.channel_name`,[randomUUID(),call,source.provider,source.url,input.title??null,user,source.provider==='youtube'?source.videoId:null,source.provider==='twitch'?source.channelName:null]);
  const result=await this.read(db,call);if(!result)roomError(ErrorCode.NOT_FOUND,'External live source unavailable');return result;
 });}
 async remove(user:string,session:string,call:string){return this.authorized(user,session,call,async db=>{await db.query('DELETE FROM external_lives WHERE call_group_id=$1',[call]);return {success:true};});}
}
