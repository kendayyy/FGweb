import {z} from 'zod';import {RoomSchema,PlaySessionSchema,JoinRequestSchema,GameSchema,MessageSchema,PublicProfileSchema,PublicRecruitmentSchema,createPageSchema,IdSchema,type NotificationDTO} from '@fg/contracts';
import {encodedId,NotificationApiError} from './api.js';
const DirectSchema=z.object({conversationId:IdSchema,peer:PublicProfileSchema});
async function fresh<T>(path:string,schema:z.ZodType<T>,signal:AbortSignal):Promise<T>{const response=await fetch('/api/v1/'+path,{signal,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});if(!response.ok)throw new NotificationApiError(response.status);let value:unknown;try{value=await response.json();}catch{throw new NotificationApiError(0,true);}const parsed=schema.safeParse(value);if(!parsed.success)throw new NotificationApiError(0,true);return parsed.data;}
async function roomTarget(roomId:string,signal:AbortSignal){const room=await fresh('rooms/'+encodedId(roomId),RoomSchema,signal);if(room.id!==roomId)throw new NotificationApiError(0,true);return '/rooms/'+encodedId(room.id);}
async function findPage<T>(read:(cursor:string|undefined)=>Promise<{items:T[];hasMore:boolean;nextCursor?:string|null}>,find:(item:T)=>Promise<string|null>){let cursor:string|undefined;const seen=new Set<string>();for(let page=0;page<100;page++){const value=await read(cursor);for(const item of value.items){const result=await find(item);if(result)return result;}if(!value.hasMore)return null;if(!value.nextCursor||seen.has(value.nextCursor))throw new NotificationApiError(0,true);seen.add(value.nextCursor);cursor=value.nextCursor;}throw new NotificationApiError(0,true);}
export async function resolveNotificationTarget(notice:NotificationDTO,actorId:string,signal:AbortSignal):Promise<string>{
 if(notice.userId!==actorId)throw new NotificationApiError(0,true);const data=notice.data;
 if(notice.type==='FRIEND_INVITE')return '/?friends=1';
 if(notice.type==='ROOM_INVITE'||notice.type==='TEAM_INVITE'||notice.type==='JOIN_REQUEST_RESULT')return '/team-activity';
 if(notice.type==='REMINDER_10MIN'&&'roomId'in data)return roomTarget(data.roomId,signal);
 if(notice.type==='JOIN_REQUEST'&&'recruitmentId'in data&&'requestId'in data){
  try{const card=await fresh('recruitments/'+encodedId(data.recruitmentId),PublicRecruitmentSchema,signal);if(card.id!==data.recruitmentId)throw new NotificationApiError(0,true);return await roomTarget(card.roomId,signal);}catch(error){if(!(error instanceof NotificationApiError)||error.status!==404)throw error;}
  // A private/closed card is not public: locate it through actual owned room queues.
  const target=await findPage(cursor=>fresh('rooms/me?limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):''),createPageSchema(RoomSchema),signal),async room=>{
   if(room.ownerId!==actorId)return null;
   return findPage(cursor=>fresh('rooms/'+encodedId(room.id)+'/play-sessions?limit=20'+(cursor?'&cursor='+encodeURIComponent(cursor):''),createPageSchema(PlaySessionSchema),signal),async session=>{
    try{const queue=await fresh('play-sessions/'+encodedId(session.id)+'/requests',z.array(JoinRequestSchema),signal);return queue.some(q=>q.id===data.requestId&&q.recruitmentId===data.recruitmentId)?roomTarget(room.id,signal):null;}catch(error){if(error instanceof NotificationApiError&&[403,404].includes(error.status))return null;throw error;}
   });
  });if(target)return target;
 }
 if((notice.type==='DM'||notice.type==='MENTION')&&'conversationId'in data){
  const direct=await findPage(cursor=>fresh('direct-conversations?limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):''),createPageSchema(DirectSchema),signal),async item=>item.conversationId===data.conversationId?'/?dm='+encodeURIComponent(item.conversationId):null);if(direct)return direct;
  const room=await findPage(cursor=>fresh('rooms/me?limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):''),createPageSchema(RoomSchema),signal),async item=>item.conversationId===data.conversationId?roomTarget(item.id,signal):null);if(room)return room;
  if(notice.type==='MENTION'){const games=await fresh('games',z.array(GameSchema),signal);for(const game of games){const history=await fresh('games/'+encodedId(game.id)+'/lobby/messages?limit=50',createPageSchema(MessageSchema),signal);if(history.items.some(row=>row.conversationId===data.conversationId))return '/?game='+encodeURIComponent(game.id);}}
 }
 throw new NotificationApiError(404);
}
