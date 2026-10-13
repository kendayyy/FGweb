import {Injectable,OnModuleInit,OnModuleDestroy,HttpException} from '@nestjs/common';
import {Pool,PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {ErrorCode,JoinRequestDTO,JoinRequestSchema,TeamSnapshotSchema,TeamSnapshotDTO,JoinRequestNotificationDataSchema,JoinRequestResultNotificationDataSchema} from '@fg/contracts';
import {roomError} from '../rooms/rooms.service.js';
import {cryptoMemberJoined} from '../chat-crypto/crypto-membership.js';
type Room={id:string;owner_id:string;visibility:string;conversation_id:string};
type Card={id:string;room_id:string;play_session_id:string;state:string;timing_type:string};
type Join={id:string;recruitment_id:string;applicant_id:string;status:string;created_iso:string};
type Play={id:string;room_id:string;host_user_id:string;player_capacity:number;state:string;timing_type:string;scheduled_at:Date|null;created_iso:string;updated_iso:string};
type LockMode='FOR UPDATE'|'FOR SHARE';
const joinSelect=`SELECT j.*,to_char(j.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM join_requests j`;
const playSelect=`SELECT p.*,to_char(p.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,to_char(p.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso FROM play_sessions p`;
@Injectable()
export class TeamsService implements OnModuleInit,OnModuleDestroy {
 private pool!:Pool;
 onModuleInit(){if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:16,connectionTimeoutMillis:5000,statement_timeout:10000});}
 async onModuleDestroy(){await this.pool?.end();}
 async transaction<T>(run:(db:PoolClient)=>Promise<T>):Promise<T>{
  const db=await this.pool.connect();try{await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');await db.query("SET LOCAL TIME ZONE 'UTC'");const result=await run(db);await db.query('COMMIT');return result;}
  catch(error){await db.query('ROLLBACK');if(error instanceof HttpException)throw error;const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';if(['23505','40001','40P01'].includes(code))roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Concurrent team operation conflicted');throw error;}
  finally{db.release();}
 }
 private dto(j:Join):JoinRequestDTO{return JoinRequestSchema.parse({id:j.id,recruitmentId:j.recruitment_id,applicantId:j.applicant_id,status:j.status,createdAt:j.created_iso});}
 // Serialize admissions without blocking unrelated foreign-key references to
 // the immutable user ID (crypto activation/message inserts hold KEY SHARE).
 private async lockUsers(db:PoolClient,ids:string[]){await db.query('SELECT id FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR NO KEY UPDATE',[[...new Set(ids)].sort()]);}
 private async eligible(db:PoolClient,userId:string){
  const ban=(await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1",[userId])).rows[0];
  if(ban?.action==='BAN')roomError(ErrorCode.FORBIDDEN,'Account is banned');
  const profile=await db.query('SELECT p.user_id FROM profiles p WHERE p.user_id=$1 AND EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=p.user_id) FOR SHARE',[userId]);
  if(!profile.rowCount)roomError(ErrorCode.FORBIDDEN,'Onboarding required');
 }
 private async actor(db:PoolClient,userId:string,sessionId:string){
  const session=await db.query('SELECT id FROM session WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE',[sessionId,userId]);
  if(!session.rowCount)roomError(ErrorCode.LOGIN_REQUIRED,'Session expired or revoked');await this.eligible(db,userId);
 }
 private async room(db:PoolClient,id:string,mode:LockMode='FOR UPDATE'):Promise<Room>{const lockClause=mode==='FOR SHARE'?'FOR SHARE':'FOR UPDATE';const r=(await db.query<Room>(`SELECT id,owner_id,visibility,conversation_id FROM rooms WHERE id=$1 ${lockClause}`,[id])).rows[0];if(!r)roomError(ErrorCode.NOT_FOUND,'Room not found');return r;}
 private async member(db:PoolClient,room:Room,userId:string,manage=false){
  const member=(await db.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE',[room.id,userId])).rows[0];
  if(!member)roomError(ErrorCode.FORBIDDEN,'Room membership required');
  if(manage&&room.owner_id!==userId){const grant=await db.query("SELECT id FROM permission_grants WHERE room_id=$1 AND user_id=$2 AND permission='MANAGE_RECRUITMENT' FOR SHARE",[room.id,userId]);if(member.role!=='HELPER'||!grant.rowCount)roomError(ErrorCode.FORBIDDEN,'Recruitment management permission required');}
 }
 private async card(db:PoolClient,id:string):Promise<Card>{const c=(await db.query<Card>('SELECT id,room_id,play_session_id,state,timing_type FROM recruitments WHERE id=$1',[id])).rows[0];if(!c)roomError(ErrorCode.NOT_FOUND,'Recruitment not found');return c;}
 private async play(db:PoolClient,id:string,mode:LockMode='FOR UPDATE'):Promise<Play>{const lockClause=mode==='FOR SHARE'?'FOR SHARE':'FOR UPDATE';const p=(await db.query<Play>(`${playSelect} WHERE p.id=$1 ${lockClause}`,[id])).rows[0];if(!p)roomError(ErrorCode.NOT_FOUND,'Play session not found');return p;}
 private async notify(db:PoolClient,userId:string,type:'JOIN_REQUEST'|'JOIN_REQUEST_RESULT',dedup:string,data:unknown){
  const parsed=type==='JOIN_REQUEST'?JoinRequestNotificationDataSchema.parse(data):JoinRequestResultNotificationDataSchema.parse(data);
  const id=randomUUID();const row=await db.query("INSERT INTO notifications(id,user_id,type,title,body,data,dedup_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,dedup_key) DO NOTHING RETURNING id",[id,userId,type,type==='JOIN_REQUEST'?'Có người xin vào đội':'Kết quả xin vào đội',type==='JOIN_REQUEST'?'Có yêu cầu mới cần xét duyệt.':'Yêu cầu vào đội của bạn đã được xét duyệt.',JSON.stringify(parsed),dedup]);
  if(row.rowCount)await db.query("INSERT INTO notification_outbox(id,notification_id,user_id,channel,dedup_key) VALUES($1,$2,$3,'IN_APP',$4)",[randomUUID(),id,userId,dedup]);
 }
 async apply(userId:string,sessionId:string,id:string):Promise<JoinRequestDTO>{return this.transaction(async db=>{
  const located=await this.card(db,id),room=await this.room(db,located.room_id);await this.lockUsers(db,[userId,room.owner_id]);await this.actor(db,userId,sessionId);
  const c=await this.card(db,id),p=await this.play(db,c.play_session_id);await this.actor(db,userId,sessionId);
  if(room.visibility!=='PUBLIC')roomError(ErrorCode.FORBIDDEN,'Private recruitment is not discoverable');
  if(c.state!=='OPEN'||p.state==='ENDED')roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Recruitment is closed');
  const existing=(await db.query<Join>(joinSelect+' WHERE j.recruitment_id=$1 AND j.applicant_id=$2 FOR UPDATE',[id,userId])).rows[0];
  if(existing){if(['PENDING','ACCEPTED'].includes(existing.status))return this.dto(existing);roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Request already finalized');}
  if((await db.query('SELECT id FROM team_members WHERE play_session_id=$1 AND user_id=$2',[p.id,userId])).rowCount)roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Already in roster');
  if((await db.query('SELECT count(*)::int AS n FROM team_members WHERE play_session_id=$1',[p.id])).rows[0].n>=p.player_capacity)roomError(ErrorCode.CAPACITY_FULL,'Team is full');
  const requestId=randomUUID();await db.query('INSERT INTO join_requests(id,recruitment_id,applicant_id) VALUES($1,$2,$3)',[requestId,id,userId]);
  await this.notify(db,room.owner_id,'JOIN_REQUEST',`join:${requestId}:pending`,{requestId,recruitmentId:id,applicantId:userId});
  await this.actor(db,userId,sessionId);
  return this.dto((await db.query<Join>(joinSelect+' WHERE j.id=$1',[requestId])).rows[0]);
 });}
 /** Transaction-scoped admission reused by PLAY_SESSION invitations in T23.
  * Caller must lock the room and sorted actor/applicant users first and enforce consent/permissions.
  * No commit, external delivery or socket publication occurs in this method.
  */
 async admit(db:PoolClient,room:Room,playSessionId:string,userId:string,excludeJoinRequestId?:string){
  await this.eligible(db,userId);const p=await this.play(db,playSessionId);if(p.room_id!==room.id||p.state==='ENDED')roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Play session ended or changed');
  const existing=await db.query('SELECT slot_index FROM team_members WHERE play_session_id=$1 AND user_id=$2',[p.id,userId]);
  if(existing.rowCount)return;
  if(p.state==='ACTIVE'&&(await db.query('SELECT user_id FROM active_play_slots WHERE user_id=$1',[userId])).rowCount)roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Already playing another team');
  const slots=(await db.query<{slot_index:number}>('SELECT slot_index FROM team_members WHERE play_session_id=$1 ORDER BY slot_index',[p.id])).rows.map(r=>r.slot_index);
  const slot=Array.from({length:p.player_capacity},(_,i)=>i+1).find(i=>!slots.includes(i));if(!slot)roomError(ErrorCode.CAPACITY_FULL,'Team is full');
  const added=await db.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER') ON CONFLICT(room_id,user_id) DO NOTHING",[randomUUID(),room.id,userId]);
  await db.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO NOTHING',[randomUUID(),room.conversation_id,userId]);
  if(added.rowCount)await cryptoMemberJoined(db,room.conversation_id,userId);
  await db.query('INSERT INTO team_members(id,play_session_id,user_id,slot_index,player_capacity,is_host) VALUES($1,$2,$3,$4,$5,false)',[randomUUID(),p.id,userId,slot,p.player_capacity]);
  if(p.state==='ACTIVE')await db.query('INSERT INTO active_play_slots(user_id,play_session_id,slot_index) VALUES($1,$2,$3)',[userId,p.id,slot]);
  await db.query('UPDATE recruitments SET current_players=$2,updated_at=now() WHERE play_session_id=$1',[p.id,slots.length+1]);await db.query('UPDATE play_sessions SET updated_at=now() WHERE id=$1',[p.id]);
  // Shared admission owns this rule for both join approvals and future PLAY_SESSION invitations.
  if(p.state==='ACTIVE')await db.query("UPDATE join_requests j SET status='CANCELLED' FROM recruitments c WHERE j.recruitment_id=c.id AND j.applicant_id=$1 AND j.status='PENDING' AND ($2::text IS NULL OR j.id<>$2) AND c.timing_type='now'",[userId,excludeJoinRequestId??null]);
  await this.eligible(db,userId);
 }
 async respond(userId:string,sessionId:string,id:string,action:'ACCEPT'|'REJECT'):Promise<JoinRequestDTO>{return this.transaction(async db=>{
  const located=(await db.query<Join>(joinSelect+' WHERE j.id=$1',[id])).rows[0];if(!located)roomError(ErrorCode.NOT_FOUND,'Request not found');
  const c=await this.card(db,located.recruitment_id),room=await this.room(db,c.room_id);await this.lockUsers(db,[userId,located.applicant_id]);await this.actor(db,userId,sessionId);await this.member(db,room,userId,true);
  const p=await this.play(db,c.play_session_id),j=(await db.query<Join>(joinSelect+' WHERE j.id=$1 FOR UPDATE',[id])).rows[0];if(!j)roomError(ErrorCode.NOT_FOUND,'Request not found');await this.actor(db,userId,sessionId);
  const final=action==='ACCEPT'?'ACCEPTED':'REJECTED';if(j.status===final)return this.dto(j);if(j.status!=='PENDING')roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Request already finalized');
  if(action==='ACCEPT'){
   const fresh=await this.card(db,c.id);if(room.visibility!=='PUBLIC'||fresh.state!=='OPEN'||p.state==='ENDED')roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Recruitment no longer accepting');
   await this.admit(db,room,p.id,j.applicant_id,id);
  }
  await db.query('UPDATE join_requests SET status=$2 WHERE id=$1',[id,final]);
  await this.notify(db,j.applicant_id,'JOIN_REQUEST_RESULT',`join:${id}:${final}`,{requestId:id,recruitmentId:c.id,result:final});
  await this.actor(db,userId,sessionId);
  if(action==='ACCEPT')await this.eligible(db,j.applicant_id);
  return this.dto((await db.query<Join>(joinSelect+' WHERE j.id=$1',[id])).rows[0]);
 });}
 async cancel(userId:string,sessionId:string,id:string){return this.transaction(async db=>{
  await this.lockUsers(db,[userId]);await this.actor(db,userId,sessionId);const j=(await db.query<Join>(joinSelect+' WHERE j.id=$1 FOR UPDATE',[id])).rows[0];if(!j)roomError(ErrorCode.NOT_FOUND,'Request not found');if(j.applicant_id!==userId)roomError(ErrorCode.FORBIDDEN,'Only applicant may cancel');if(j.status==='CANCELLED')return {success:true};if(j.status!=='PENDING')roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Request already finalized');await db.query("UPDATE join_requests SET status='CANCELLED' WHERE id=$1",[id]);return {success:true};
 });}
 async mine(userId:string,sessionId:string){return this.transaction(async db=>{await this.actor(db,userId,sessionId);return (await db.query<Join>(joinSelect+' WHERE j.applicant_id=$1 ORDER BY j.created_at DESC,j.id',[userId])).rows.map(j=>this.dto(j));});}
 async requests(userId:string,sessionId:string,id:string){return this.transaction(async db=>{const c=await this.card(db,id),room=await this.room(db,c.room_id);await this.actor(db,userId,sessionId);await this.member(db,room,userId,true);return (await db.query<Join>(joinSelect+' WHERE j.recruitment_id=$1 ORDER BY j.created_at,j.id',[id])).rows.map(j=>this.dto(j));});}
 async snapshot(userId:string,sessionId:string,id:string):Promise<TeamSnapshotDTO>{return this.transaction(async db=>{
  const located=(await db.query('SELECT room_id FROM play_sessions WHERE id=$1',[id])).rows[0];if(!located)roomError(ErrorCode.NOT_FOUND,'Play session not found');const room=await this.room(db,located.room_id,'FOR SHARE');await this.actor(db,userId,sessionId);await this.member(db,room,userId);const p=await this.play(db,id,'FOR SHARE');
  const roster=(await db.query("SELECT user_id,slot_index,is_host,to_char(joined_at,'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS joined_iso FROM team_members WHERE play_session_id=$1 ORDER BY slot_index",[id])).rows;
  return TeamSnapshotSchema.parse({playSession:{id:p.id,roomId:p.room_id,hostUserId:p.host_user_id,playerCapacity:p.player_capacity,timingType:p.timing_type,scheduledAt:p.scheduled_at?.toISOString(),state:p.state,createdAt:p.created_iso,updatedAt:p.updated_iso},roster:roster.map(r=>({playSessionId:id,userId:r.user_id,slotIndex:r.slot_index,isHost:r.is_host,joinedAt:r.joined_iso}))});
 });}
}
