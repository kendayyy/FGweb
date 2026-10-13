import {Injectable,OnModuleInit,OnModuleDestroy,HttpException} from '@nestjs/common';
import {Pool,PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {AccessToken,RoomServiceClient} from 'livekit-server-sdk';
import {ErrorCode,CallGroupSchema,CallJoinSchema,CallGroupDTO,CallParticipantSchema,CallParticipantDTO} from '@fg/contracts';
import {RoomsService,roomError} from '../rooms/rooms.service.js';
import {AuthService} from '../auth/auth.service.js';
import {liveLease,publicationSources,publicationPermission,type LiveLease} from './lease-store.js';
import type {ParticipantInfo} from '@livekit/protocol';
type Group={id:string;room_id:string;state:string;created_at:Date};
type LockMode='FOR UPDATE'|'FOR SHARE';
const alreadyGone=(error:unknown)=>Boolean(error&&typeof error==='object'&&'code'in error&&error.code==='not_found');
@Injectable()
export class CallsService implements OnModuleInit,OnModuleDestroy {
 private pool!:Pool;
 private readonly issuedRooms=new Set<string>();
 private afterLeave?: (id:string)=>Promise<void>;
 setAfterLeave(callback?: (id:string)=>Promise<void>){this.afterLeave=callback;}
 constructor(private readonly auth:AuthService,private readonly rooms:RoomsService){}
 onModuleInit(){if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:16,connectionTimeoutMillis:5000,statement_timeout:15000});
  if(process.env.LIVEKIT_SERVER_URL&&process.env.LIVEKIT_ADMISSION_URL){this.auth.setCallHooks({before:id=>this.revokeSession(id),after:user=>this.sessionDeleted(user)});this.rooms.setCallRevoker(()=>this.reconcile());}
 }
 async onModuleDestroy(){this.auth.setCallHooks(undefined);this.rooms.setCallRevoker(undefined);await this.pool?.end();}
 private config(){
  const {LIVEKIT_SERVER_URL:server,LIVEKIT_ADMISSION_URL:admission,LIVEKIT_API_KEY:key,LIVEKIT_API_SECRET:secret}=process.env;
  if(!server||!admission||!key||!secret)throw Error('Private media gateway configuration required');
  const url=new URL(admission);if(!['ws:','wss:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Invalid admission URL');
  if(process.env.PUBLIC_ORIGIN?.startsWith('https:')&&url.protocol!=='wss:')throw Error('Secure media gateway required');
  return {client:new RoomServiceClient(server,key,secret,{requestTimeout:10}),admission,key,secret};
 }
 private async transaction<T>(run:(db:PoolClient)=>Promise<T>):Promise<T>{
  const db=await this.pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL TIME ZONE 'UTC'");const result=await run(db);await db.query('COMMIT');return result;}
  catch(error){await db.query('ROLLBACK');if(error instanceof HttpException)throw error;if(error&&typeof error==='object'&&'code'in error&&['23505','40001','40P01'].includes(String(error.code)))roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Concurrent call admission conflict');throw error;}finally{db.release();}
 }
 private async actor(db:PoolClient,user:string,session:string){
  if(!(await db.query('SELECT id FROM session WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE',[session,user])).rowCount)roomError(ErrorCode.LOGIN_REQUIRED,'Session expired or revoked');
  const ban=(await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1",[user])).rows[0];
  if(ban?.action==='BAN')roomError(ErrorCode.FORBIDDEN,'Account is banned');
  if(!(await db.query('SELECT user_id FROM profiles p WHERE p.user_id=$1 AND EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=p.user_id) FOR SHARE',[user])).rowCount)roomError(ErrorCode.FORBIDDEN,'Onboarding required');
 }
 private async room(db:PoolClient,id:string,user:string,session:string,extra:string[]=[],mode:LockMode='FOR UPDATE'){
  const lockClause=mode==='FOR SHARE'?'FOR SHARE':'FOR UPDATE';
  const rooms=await db.query(`SELECT id FROM rooms WHERE id=ANY($1::text[]) ORDER BY id ${lockClause}`,[[...new Set([id,...extra])].sort()]);
  if(!rooms.rows.some(r=>r.id===id))roomError(ErrorCode.NOT_FOUND,'Room not found');
  await db.query(`SELECT id FROM "user" WHERE id=$1 ${lockClause}`,[user]);await this.actor(db,user,session);
  if(!(await db.query('SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE',[id,user])).rowCount)roomError(ErrorCode.FORBIDDEN,'Current room membership required');
 }
 private async dto(db:Pool|PoolClient,id:string):Promise<CallGroupDTO>{
  const row=(await db.query(`SELECT c.*,to_char(c.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,
   (SELECT count(*)::int FROM call_members m WHERE m.call_group_id=c.id AND m.left_at IS NULL) AS participants,
   (SELECT count(*)::int FROM call_publish_slots p WHERE p.call_group_id=c.id) AS publishers FROM call_groups c WHERE c.id=$1`,[id])).rows[0];
  if(!row)roomError(ErrorCode.NOT_FOUND,'Call not found');
  return CallGroupSchema.parse({id:row.id,roomId:row.room_id,state:row.state,participantCount:row.participants,publisherCount:row.publishers,hasExternalLive:false,createdAt:row.created_iso});
 }
 async create(user:string,session:string,roomId:string){
  const id=randomUUID(),config=this.config();let nativeCreated=false;
  try{return await this.transaction(async db=>{
   await this.room(db,roomId,user,session);
   await db.query('INSERT INTO call_groups(id,room_id) VALUES($1,$2)',[id,roomId]);
   await config.client.createRoom({name:`fg-call_${id}`,maxParticipants:10,emptyTimeout:300,departureTimeout:30});nativeCreated=true;this.issuedRooms.add(`fg-call_${id}`);
   await this.actor(db,user,session);return this.dto(db,id);
  });}catch(error){if(nativeCreated)await config.client.deleteRoom(`fg-call_${id}`);throw error;}
 }
 async list(user:string,session:string,roomId:string){return this.transaction(async db=>{
  await this.room(db,roomId,user,session,[],'FOR SHARE');const groups=(await db.query('SELECT id FROM call_groups WHERE room_id=$1 AND state=\'OPEN\' ORDER BY created_at,id',[roomId])).rows;
  const result=[];for(const g of groups)result.push(await this.dto(db,g.id));return result;
 });}
 private async controlsGroup(db:PoolClient,id:string,user:string,session:string,mode:LockMode='FOR UPDATE'){
  const group=(await db.query<Group>('SELECT * FROM call_groups WHERE id=$1',[id])).rows[0];if(!group)roomError(ErrorCode.NOT_FOUND,'Call not found');
  await this.room(db,group.room_id,user,session,[],mode);
  const lockClause=mode==='FOR SHARE'?'FOR SHARE':'FOR UPDATE';
  const current=(await db.query<Group>(`SELECT * FROM call_groups WHERE id=$1 ${lockClause}`,[id])).rows[0];if(!current||current.state!=='OPEN')roomError(ErrorCode.CALL_CLOSED,'Call is closed');
 }
 private async participantDtos(db:PoolClient,id:string):Promise<CallParticipantDTO[]>{
  const rows=(await db.query(`SELECT m.user_id,m.is_muted,p.display_name,p.avatar_url,p.custom_status,a.id AS media_identity,
   to_char(m.joined_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS joined_iso,
   EXISTS(SELECT 1 FROM call_publish_slots ps WHERE ps.call_group_id=m.call_group_id AND ps.user_id=m.user_id) AS publishing,
   EXISTS(SELECT 1 FROM call_restrictions r WHERE r.call_group_id=m.call_group_id AND r.target_user_id=m.user_id AND r.restriction_type='MIC_MUTED') AS restricted
   FROM call_members m JOIN profiles p ON p.user_id=m.user_id
   LEFT JOIN call_admissions a ON a.call_member_id=m.id AND a.revoked_at IS NULL
   WHERE m.call_group_id=$1 AND m.left_at IS NULL ORDER BY m.seat_index,m.user_id`,[id])).rows;
  const result:CallParticipantDTO[]=[];
  for(const row of rows)if(row.media_identity&&await liveLease(db,row.media_identity))result.push(CallParticipantSchema.parse({callId:id,userId:row.user_id,user:{id:row.user_id,displayName:row.display_name,avatarUrl:row.avatar_url,customStatus:row.custom_status},mediaIdentity:row.media_identity,micRestricted:row.restricted,isPublishing:row.publishing,isMuted:row.is_muted,joinedAt:row.joined_iso}));
  return result;
 }
 async participants(user:string,session:string,id:string){return this.transaction(async db=>{await this.controlsGroup(db,id,user,session,'FOR SHARE');return this.participantDtos(db,id);});}
 async selfMic(user:string,session:string,id:string,muted:boolean){return this.transaction(async db=>{
  await this.controlsGroup(db,id,user,session);
  const member=(await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE',[id,user])).rows[0];if(!member)roomError(ErrorCode.FORBIDDEN,'Current call participant required');
  const lease=(await db.query('SELECT id,session_id FROM call_admissions WHERE call_member_id=$1 AND revoked_at IS NULL FOR UPDATE',[member.id])).rows[0];
  if(!lease||lease.session_id!==session||!await liveLease(db,lease.id))roomError(ErrorCode.FORBIDDEN,'Current session-bound call admission required');
  if(!muted&&(await db.query("SELECT id FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2 AND restriction_type='MIC_MUTED'",[id,user])).rowCount)roomError(ErrorCode.FORBIDDEN,'Moderator microphone restriction');
  await db.query('UPDATE call_members SET is_muted=$2 WHERE id=$1',[member.id,muted]);
  const dto=(await this.participantDtos(db,id)).find(p=>p.userId===user);if(!dto)roomError(ErrorCode.FORBIDDEN,'Call admission no longer valid');return dto;
 });}
 private async release(db:PoolClient,memberIds:string[]){if(!memberIds.length)return;
  await db.query('UPDATE call_admissions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE call_member_id=ANY($1::text[])',[memberIds]);
  await db.query('DELETE FROM call_publish_slots WHERE (call_group_id,user_id) IN(SELECT call_group_id,user_id FROM call_members WHERE id=ANY($1::text[]))',[memberIds]);
  await db.query('UPDATE call_members SET left_at=COALESCE(left_at,now()) WHERE id=ANY($1::text[])',[memberIds]);
 }
 async join(user:string,session:string,id:string){const config=this.config();return this.transaction(async db=>{
  const group=(await db.query<Group>('SELECT * FROM call_groups WHERE id=$1',[id])).rows[0];if(!group)roomError(ErrorCode.NOT_FOUND,'Call not found');
  const prior=(await db.query('SELECT room_id FROM call_members WHERE user_id=$1 AND left_at IS NULL',[user])).rows[0];
  await this.room(db,group.room_id,user,session,prior?[prior.room_id]:[]);
  const current=(await db.query<Group>('SELECT * FROM call_groups WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!current||current.state!=='OPEN')roomError(ErrorCode.CALL_CLOSED,'Call is closed');
  const stale=(await db.query(`SELECT m.id,m.room_id FROM call_members m WHERE m.left_at IS NULL AND (m.call_group_id=$1 OR m.user_id=$2)
   AND NOT EXISTS(SELECT 1 FROM call_admissions a JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id
    WHERE a.call_member_id=m.id AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp())`,[id,user])).rows;
  if(stale.some(m=>m.room_id!==group.room_id&&m.room_id!==prior?.room_id))roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Call changed while waiting');
  await this.release(db,stale.map(m=>m.id));
  const active=(await db.query('SELECT * FROM call_members WHERE user_id=$1 AND left_at IS NULL FOR UPDATE',[user])).rows[0];
  if(active&&active.call_group_id!==id)roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Leave the current call first');
  let memberId:string,identity:string;
  if(active){
   const lease=(await db.query('SELECT id,session_id FROM call_admissions WHERE call_member_id=$1 AND revoked_at IS NULL FOR UPDATE',[active.id])).rows[0];
   if(!lease||lease.session_id!==session||!await liveLease(db,lease.id))roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Call belongs to another session; leave it first');
   identity=lease.id;
  }else{
   const occupied=(await db.query('SELECT seat_index FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[id])).rows.map(m=>Number(m.seat_index));
   const seat=Array.from({length:10},(_,i)=>i+1).find(i=>!occupied.includes(i));if(!seat)roomError(ErrorCode.CAPACITY_FULL,'Call limit is ten including viewers');
   const old=(await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND user_id=$2 FOR UPDATE',[id,user])).rows[0];memberId=old?.id??randomUUID();
   if(old)await db.query('UPDATE call_members SET seat_index=$2,left_at=NULL,joined_at=now(),is_muted=true WHERE id=$1',[memberId,seat]);
   else await db.query('INSERT INTO call_members(id,call_group_id,room_id,user_id,seat_index) VALUES($1,$2,$3,$4,$5)',[memberId,id,group.room_id,user,seat]);
   identity=`admission_${randomUUID()}`;
   await db.query("INSERT INTO call_admissions(id,call_member_id,session_id,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '60 seconds')",[identity,memberId,session]);
  }
  await config.client.createRoom({name:`fg-call_${id}`,maxParticipants:10,emptyTimeout:300,departureTimeout:30});
  const token=new AccessToken(config.key,config.secret,{identity,ttl:60});
  const sources=await publicationSources(db,{call_group_id:id,user_id:user});token.addGrant({roomJoin:true,room:`fg-call_${id}`,canSubscribe:true,canPublish:sources.length>0,canPublishSources:sources,canPublishData:false,canUpdateOwnMetadata:false});
  await this.actor(db,user,session);
  return CallJoinSchema.parse({callId:id,token:await token.toJwt(),sfuUrl:config.admission,roomName:`fg-call_${id}`});
 });}
 async leave(user:string,session:string,id:string){
  await this.transaction(async db=>{const group=(await db.query<Group>('SELECT * FROM call_groups WHERE id=$1',[id])).rows[0];if(!group)roomError(ErrorCode.NOT_FOUND,'Call not found');
   await this.room(db,group.room_id,user,session);await db.query('SELECT id FROM call_groups WHERE id=$1 FOR UPDATE',[id]);
   const member=(await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE',[id,user])).rows[0];if(!member)roomError(ErrorCode.FORBIDDEN,'Current call participant required');await this.release(db,[member.id]);
  });await this.reconcile();await this.afterLeave?.(id);return {success:true};
 }
 async revokeSession(sessionId:string){
  await this.transaction(async db=>{await db.query('UPDATE call_admissions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE session_id=$1',[sessionId]);});
  await this.reconcile();
 }
 private async sessionDeleted(user:string){
  await this.transaction(async db=>{
   const active=(await db.query('SELECT room_id FROM call_members WHERE user_id=$1 AND left_at IS NULL',[user])).rows;
   await db.query('SELECT id FROM rooms WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[active.map(m=>m.room_id)]);await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[user]);
   const stale=(await db.query(`SELECT m.id FROM call_members m WHERE m.user_id=$1 AND m.left_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM call_admissions a JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id WHERE a.call_member_id=m.id AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp())`,[user])).rows;
   await this.release(db,stale.map(m=>m.id));
  });await this.reconcile();
 }
 /** Native participant removal also covers bindings deleted by FK cascades. */
 async reconcile(){const config=this.config(),owned=new Set([...this.issuedRooms,...(await this.pool.query('SELECT id FROM call_groups')).rows.map(c=>`fg-call_${c.id}`)]);for(const room of await config.client.listRooms([...owned]))if(owned.has(room.name)){
  let participants;try{participants=await config.client.listParticipants(room.name);}catch(error){if(alreadyGone(error))continue;throw error;}
  for(const p of participants)if(!await liveLease(this.pool,p.identity)){try{await config.client.removeParticipant(room.name,p.identity);}catch(error){if(!alreadyGone(error))throw error;}await this.afterLeave?.(room.name.slice('fg-call_'.length));}
 }}

 /** Shared lock order for publishing/moderation and existing room/call controls. */
 async withControlGroup<T>(user:string,session:string,id:string,run:(db:PoolClient,group:Group)=>Promise<T>):Promise<T>{return this.transaction(async db=>{await this.controlsGroup(db,id,user,session);const group=(await db.query<Group>('SELECT * FROM call_groups WHERE id=$1',[id])).rows[0];const result=await run(db,group);await this.actor(db,user,session);return result;});}
 async requireAdmission(db:PoolClient,id:string,user:string,session:string):Promise<LiveLease>{
  const member=(await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE',[id,user])).rows[0];if(!member)roomError(ErrorCode.FORBIDDEN,'Current call participant required');
  const admission=(await db.query('SELECT id,session_id FROM call_admissions WHERE call_member_id=$1 AND revoked_at IS NULL FOR UPDATE',[member.id])).rows[0];const lease=admission?await liveLease(db,admission.id):undefined;if(!lease||lease.session_id!==session)roomError(ErrorCode.FORBIDDEN,'Current session-bound call admission required');return lease;
 }
 async grantForAdmission(db:PoolClient,lease:LiveLease){const current=await liveLease(db,lease.id);if(!current)roomError(ErrorCode.FORBIDDEN,'Call admission expired');const config=this.config(),sources=await publicationSources(db,current),token=new AccessToken(config.key,config.secret,{identity:current.id,ttl:60});token.addGrant({roomJoin:true,room:current.room_name,canSubscribe:true,canPublish:sources.length>0,canPublishSources:sources,canPublishData:false,canUpdateOwnMetadata:false});return CallJoinSchema.parse({callId:current.call_group_id,token:await token.toJwt(),sfuUrl:config.admission,roomName:current.room_name});}
 async syncNativePermissions(db:PoolClient,lease:LiveLease,known?:ParticipantInfo):Promise<ParticipantInfo|undefined>{const native=this.config().client;let peer=known;
  if(!peer)try{peer=await native.getParticipant(lease.room_name,lease.id);}catch(error){if(alreadyGone(error))return undefined;throw error;}
  const permission=await publicationPermission(db,lease),old=peer.permission;
  if(!old||old.canPublish!==permission.canPublish||old.canPublishData||!old.canSubscribe||old.canUpdateMetadata||JSON.stringify([...old.canPublishSources].sort())!==JSON.stringify([...permission.canPublishSources].sort()))await native.updateParticipant(lease.room_name,lease.id,{permission});return peer;
 }
 async muteNativeTrack(lease:LiveLease,sid:string){try{await this.config().client.mutePublishedTrack(lease.room_name,lease.id,sid,true);}catch(error){if(!alreadyGone(error))throw error;}}
 async revokeMemberWithin(db:PoolClient,memberId:string,lease:LiveLease){await this.release(db,[memberId]);try{await this.config().client.removeParticipant(lease.room_name,lease.id);}catch(error){if(!alreadyGone(error))throw error;}}
 async finishModeration(id:string){await this.reconcile();await this.afterLeave?.(id);}

}
