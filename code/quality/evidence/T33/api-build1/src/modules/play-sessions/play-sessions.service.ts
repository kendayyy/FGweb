import {enqueueNotification} from '@fg/database';
import {Injectable} from '@nestjs/common';
import type {PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ErrorCode,IdSchema,IsoDateTimeSchema,JoinRequestSchema,PlaySessionSchema,JoinRequestNotificationDataSchema,JoinRequestResultNotificationDataSchema,type JoinRequestDTO,type PlaySessionDTO,type Page,type ListRoomPlaySessionsQuery} from '@fg/contracts';
import {TeamsService} from '../teams/teams.service.js';
import {roomError} from '../rooms/rooms.service.js';

type Room={id:string;owner_id:string;visibility:string;conversation_id:string};
type Play={id:string;room_id:string;host_user_id:string;state:string;timing_type:string;player_capacity:number;scheduled_at:Date|null;created_iso:string;updated_iso:string};
type Join={id:string;recruitment_id:string;applicant_id:string;status:string;created_iso:string};
type LockMode='FOR UPDATE'|'FOR SHARE';
const playSelect=`SELECT p.*,to_char(p.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,to_char(p.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso FROM play_sessions p`;
const joinSelect=`SELECT j.*,to_char(j.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM join_requests j`;
const roomCursor=z.object({roomId:IdSchema,id:IdSchema,createdAt:IsoDateTimeSchema}).strict();

@Injectable()
export class PlaySessionsService {
 constructor(private readonly teams:TeamsService){}
 private dto(p:Play):PlaySessionDTO{return PlaySessionSchema.parse({id:p.id,roomId:p.room_id,hostUserId:p.host_user_id,playerCapacity:p.player_capacity,timingType:p.timing_type,scheduledAt:p.scheduled_at?.toISOString(),state:p.state,createdAt:p.created_iso,updatedAt:p.updated_iso});}
 private joinDto(j:Join):JoinRequestDTO{return JoinRequestSchema.parse({id:j.id,recruitmentId:j.recruitment_id,applicantId:j.applicant_id,status:j.status,createdAt:j.created_iso});}
 private async eligible(db:PoolClient,id:string){
  const ban=(await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1",[id])).rows[0];
  if(ban?.action==='BAN')roomError(ErrorCode.FORBIDDEN,'Account is banned');
  if(!(await db.query('SELECT p.user_id FROM profiles p WHERE p.user_id=$1 AND EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=p.user_id) FOR SHARE',[id])).rowCount)roomError(ErrorCode.FORBIDDEN,'Onboarding required');
 }
 private async actor(db:PoolClient,id:string,sessionId:string){
  if(!(await db.query('SELECT id FROM session WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE',[sessionId,id])).rowCount)roomError(ErrorCode.LOGIN_REQUIRED,'Session expired or revoked');
  await this.eligible(db,id);
 }
 private async member(db:PoolClient,room:Room,id:string,manage=false){
  const m=(await db.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE',[room.id,id])).rows[0];
  if(!m)roomError(ErrorCode.FORBIDDEN,'Current room membership required');
  if(manage&&room.owner_id!==id){
   const grant=await db.query("SELECT id FROM permission_grants WHERE room_id=$1 AND user_id=$2 AND permission='MANAGE_RECRUITMENT' FOR SHARE",[room.id,id]);
   if(m.role!=='HELPER'||!grant.rowCount)roomError(ErrorCode.FORBIDDEN,'Recruitment management permission required');
  }
 }
 private async play(db:PoolClient,id:string,mode:LockMode='FOR UPDATE'):Promise<Play>{const lockClause=mode==='FOR SHARE'?'FOR SHARE':'FOR UPDATE';const p=(await db.query<Play>(`${playSelect} WHERE p.id=$1 ${lockClause}`,[id])).rows[0];if(!p)roomError(ErrorCode.NOT_FOUND,'Play session not found');return p;}
 /** Admission/start/end serialize on the room, then sorted user locks, then play/request rows.
  * The roster is stable while the room is locked, including T22/T23 shared admissions.
  */
 private async context(db:PoolClient,id:string,user:string,session:string,manage=false,requireMember=true,extra:string[]=[],mode:LockMode='FOR UPDATE'){
  const lockClause=mode==='FOR SHARE'?'FOR SHARE':'FOR UPDATE';
  const located=(await db.query('SELECT room_id FROM play_sessions WHERE id=$1',[id])).rows[0];if(!located)roomError(ErrorCode.NOT_FOUND,'Play session not found');
  const room=(await db.query<Room>(`SELECT id,owner_id,visibility,conversation_id FROM rooms WHERE id=$1 ${lockClause}`,[located.room_id])).rows[0];if(!room)roomError(ErrorCode.NOT_FOUND,'Room not found');
  const roster=(await db.query<{user_id:string;slot_index:number}>('SELECT user_id,slot_index FROM team_members WHERE play_session_id=$1 ORDER BY slot_index',[id])).rows;
  await db.query(`SELECT id FROM "user" WHERE id=ANY($1::text[]) ORDER BY id ${lockClause}`,[[...new Set([user,...extra,...roster.map(r=>r.user_id)])].sort()]);
  await this.actor(db,user,session);if(requireMember)await this.member(db,room,user,manage);
  const play=await this.play(db,id,mode);await this.actor(db,user,session);
  return {room,play,roster};
 }
 private async card(db:PoolClient,id:string){
  const c=(await db.query<{id:string}>('SELECT id FROM recruitments WHERE play_session_id=$1 ORDER BY created_at,id LIMIT 1',[id])).rows[0];
  if(!c)roomError(ErrorCode.NOT_FOUND,'Session recruitment not found');return c;
 }
 private async notification(db:PoolClient,user:string,j:Join,result?:'ACCEPTED'|'REJECTED'){
  const type=result?'JOIN_REQUEST_RESULT':'JOIN_REQUEST';
  const data=result?JoinRequestResultNotificationDataSchema.parse({requestId:j.id,recruitmentId:j.recruitment_id,result}):JoinRequestNotificationDataSchema.parse({requestId:j.id,recruitmentId:j.recruitment_id,applicantId:j.applicant_id});
  await enqueueNotification(db,user,type,data,`join:${j.id}:${result??'pending'}`);
 }
 async listRoom(user:string,session:string,id:string,query:ListRoomPlaySessionsQuery):Promise<Page<PlaySessionDTO>>{
  return this.teams.transaction(async db=>{
   // Room writers serialize membership/policy changes on this same row.
   // Authorize after waiting; an earlier HTTP guard is not a live ACL proof.
   const room=(await db.query<Room>('SELECT id,owner_id,visibility,conversation_id FROM rooms WHERE id=$1 FOR SHARE',[id])).rows[0];
   if(!room)roomError(ErrorCode.NOT_FOUND,'Room not found');
   await this.actor(db,user,session);await this.member(db,room,user);
   const parameters:unknown[]=[id];let clause='';
   if(query.cursor){
    let cursor:z.infer<typeof roomCursor>;
    try{
     const decoded=Buffer.from(query.cursor,'base64url');
     if(!/^[A-Za-z0-9_-]+$/.test(query.cursor)||decoded.toString('base64url')!==query.cursor)throw Error('Invalid cursor encoding');
     cursor=roomCursor.parse(JSON.parse(decoded.toString('utf8')));
    }catch{roomError(ErrorCode.INVALID_INPUT,'Invalid pagination cursor');}
    if(cursor.roomId!==id)roomError(ErrorCode.INVALID_INPUT,'Cursor belongs to another room');
    parameters.push(cursor.createdAt,cursor.id);clause=' AND (p.created_at,p.id)<($2::timestamp,$3)';
   }
   parameters.push(query.limit+1);
   const rows=(await db.query<Play>(playSelect+` WHERE p.room_id=$1${clause} ORDER BY p.created_at DESC,p.id DESC LIMIT $${parameters.length}`,parameters)).rows;
   const items=rows.slice(0,query.limit),hasMore=rows.length>query.limit,last=items.at(-1);
   await this.actor(db,user,session);await this.member(db,room,user);
   return {items:items.map(p=>this.dto(p)),hasMore,...(hasMore&&last?{nextCursor:Buffer.from(JSON.stringify({roomId:id,id:last.id,createdAt:last.created_iso})).toString('base64url')}:{})};
  });
 }
 async join(user:string,session:string,id:string){return this.teams.transaction(async db=>{
  const {room,play,roster}=await this.context(db,id,user,session);if(play.state==='ENDED')roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Play session ended');
  const card=await this.card(db,id),existing=(await db.query<Join>(joinSelect+' WHERE j.recruitment_id=$1 AND j.applicant_id=$2 FOR UPDATE',[card.id,user])).rows[0];
  if(existing){
   if(existing.status==='PENDING'||(existing.status==='ACCEPTED'&&roster.some(r=>r.user_id===user)))return this.joinDto(existing);
   roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Request already finalized');
  }
  if(roster.some(r=>r.user_id===user))roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Already in roster');
  if(roster.length>=play.player_capacity)roomError(ErrorCode.CAPACITY_FULL,'Team is full');
  const requestId=randomUUID();await db.query('INSERT INTO join_requests(id,recruitment_id,applicant_id) VALUES($1,$2,$3)',[requestId,card.id,user]);
  const j=(await db.query<Join>(joinSelect+' WHERE j.id=$1',[requestId])).rows[0];await this.notification(db,room.owner_id,j);await this.actor(db,user,session);return this.joinDto(j);
 });}
 async requests(user:string,session:string,id:string){return this.teams.transaction(async db=>{
  await this.context(db,id,user,session,true,true,[],'FOR SHARE');
  const rows=(await db.query<Join>(joinSelect+' JOIN recruitments c ON c.id=j.recruitment_id WHERE c.play_session_id=$1 ORDER BY j.created_at,j.id',[id])).rows;
  await this.actor(db,user,session);return rows.map(j=>this.joinDto(j));
 });}
 async respond(user:string,session:string,id:string,requestId:string,action:'ACCEPT'|'REJECT'){return this.teams.transaction(async db=>{
  const located=(await db.query<Join>(joinSelect+' WHERE j.id=$1',[requestId])).rows[0];if(!located)roomError(ErrorCode.NOT_FOUND,'Request not found');
  const {room,play}=await this.context(db,id,user,session,true,true,[located.applicant_id]);
  const j=(await db.query<Join>(joinSelect+' WHERE j.id=$1 FOR UPDATE',[requestId])).rows[0];if(!j)roomError(ErrorCode.NOT_FOUND,'Request not found');
  if(!(await db.query('SELECT id FROM recruitments WHERE id=$1 AND play_session_id=$2',[j.recruitment_id,id])).rowCount)roomError(ErrorCode.INVALID_INPUT,'Request does not belong to session');
  await this.member(db,room,j.applicant_id);
  const final=action==='ACCEPT'?'ACCEPTED':'REJECTED';if(j.status===final)return this.joinDto(j);if(j.status!=='PENDING'||play.state==='ENDED')roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Request or session finalized');
  if(action==='ACCEPT')await this.teams.admit(db,room,id,j.applicant_id,requestId);
  await db.query('UPDATE join_requests SET status=$2 WHERE id=$1',[requestId,final]);await this.notification(db,j.applicant_id,j,final);await this.actor(db,user,session);
  return this.joinDto((await db.query<Join>(joinSelect+' WHERE j.id=$1',[requestId])).rows[0]);
 });}
 async start(user:string,session:string,id:string){return this.teams.transaction(async db=>{
  const {room,play,roster}=await this.context(db,id,user,session,true);
  if(play.state==='ENDED')roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Ended session cannot restart');
  if(play.state==='ACTIVE')return this.dto(play);
  if(!roster.length)roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Roster is empty');
  for(const r of roster){await this.eligible(db,r.user_id);await this.member(db,room,r.user_id);}
  if((await db.query('SELECT user_id FROM active_play_slots WHERE user_id=ANY($1::text[])',[roster.map(r=>r.user_id)])).rowCount)roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Reserved player is playing another team');
  await db.query("UPDATE play_sessions SET state='ACTIVE',updated_at=now() WHERE id=$1",[id]);
  for(const r of roster)await db.query('INSERT INTO active_play_slots(user_id,play_session_id,slot_index) VALUES($1,$2,$3)',[r.user_id,id,r.slot_index]);
  await db.query("UPDATE join_requests j SET status='CANCELLED' FROM recruitments c WHERE j.recruitment_id=c.id AND j.applicant_id=ANY($1::text[]) AND j.status='PENDING' AND c.timing_type='now'",[roster.map(r=>r.user_id)]);
  await this.actor(db,user,session);return this.dto(await this.play(db,id));
 });}
 async leave(user:string,session:string,id:string){return this.teams.transaction(async db=>{
  const {play,roster}=await this.context(db,id,user,session,false,false);
  if(play.state==='ENDED'||!roster.some(r=>r.user_id===user))return {success:true};
  if(play.host_user_id===user)roomError(ErrorCode.ACTIVE_PLAY_CONFLICT,'Host must explicitly end the play session');
  await db.query('DELETE FROM active_play_slots WHERE play_session_id=$1 AND user_id=$2',[id,user]);
  await db.query('DELETE FROM team_members WHERE play_session_id=$1 AND user_id=$2',[id,user]);
  await db.query('UPDATE recruitments SET current_players=$2,updated_at=now() WHERE play_session_id=$1',[id,roster.length-1]);
  await db.query('UPDATE play_sessions SET updated_at=now() WHERE id=$1',[id]);await this.actor(db,user,session);return {success:true};
 });}
 async end(user:string,session:string,id:string){return this.teams.transaction(async db=>{
  const {play}=await this.context(db,id,user,session,true);if(play.state==='ENDED')return this.dto(play);
  await db.query('DELETE FROM active_play_slots WHERE play_session_id=$1',[id]);
  await db.query("UPDATE play_sessions SET state='ENDED',updated_at=now() WHERE id=$1",[id]);
  await db.query("UPDATE recruitments SET state='CLOSED',updated_at=now() WHERE play_session_id=$1",[id]);
  await db.query("UPDATE join_requests j SET status='CANCELLED' FROM recruitments c WHERE c.id=j.recruitment_id AND c.play_session_id=$1 AND j.status='PENDING'",[id]);
  await this.actor(db,user,session);return this.dto(await this.play(db,id));
 });}
}
