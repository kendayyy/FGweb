import {TrackSource} from 'livekit-server-sdk';
import type {Pool,PoolClient} from 'pg';
export type LiveLease={id:string;user_id:string;session_id:string;call_group_id:string;room_id:string;room_name:string;session_expires_at:Date};
/** Use server state for original and SFU-refreshed JWTs alike. */
export async function liveLease(db:Pool|PoolClient,id:string):Promise<LiveLease|undefined>{
 return (await db.query<LiveLease>({
  name:'fg_live_call_admission_v1',
  text:`SELECT a.id,m.user_id,a.session_id,m.call_group_id,m.room_id,
  'fg-call_'||m.call_group_id AS room_name,s.expires_at AT TIME ZONE 'UTC' AS session_expires_at
  FROM call_admissions a JOIN call_members m ON m.id=a.call_member_id
  JOIN call_groups c ON c.id=m.call_group_id AND c.room_id=m.room_id
  JOIN room_members rm ON rm.room_id=m.room_id AND rm.user_id=m.user_id
  JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id
  JOIN profiles p ON p.user_id=m.user_id
  WHERE a.id=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
  AND m.left_at IS NULL AND c.state='OPEN' AND s.expires_at>clock_timestamp() AT TIME ZONE 'UTC'
  AND (a.disconnected_at IS NULL OR a.disconnected_at>clock_timestamp()-interval '30 seconds')
  AND EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=m.user_id)
  AND COALESCE((SELECT action FROM admin_actions WHERE target_user_id=m.user_id AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1),'UNBAN')<>'BAN'`,
  values:[id]
 })).rows[0];
}


/** Current DB policy, never a privilege copied from an original/refreshed JWT. */
export async function publicationSources(db:Pool|PoolClient,lease:Pick<LiveLease,'call_group_id'|'user_id'>):Promise<TrackSource[]>{
 const policy=(await db.query<{mic_blocked:boolean;screen_blocked:boolean;reserved:boolean}>("SELECT EXISTS(SELECT 1 FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2 AND restriction_type='MIC_MUTED') AS mic_blocked,EXISTS(SELECT 1 FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2 AND restriction_type='STREAM_BLOCKED') AS screen_blocked,EXISTS(SELECT 1 FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2) AS reserved",[lease.call_group_id,lease.user_id])).rows[0];
 const sources:TrackSource[]=[];if(!policy.mic_blocked)sources.push(TrackSource.MICROPHONE);if(policy.reserved&&!policy.screen_blocked){sources.push(TrackSource.SCREEN_SHARE);if(!policy.mic_blocked)sources.push(TrackSource.SCREEN_SHARE_AUDIO);}return sources;
}
export async function publicationPermission(db:Pool|PoolClient,lease:Pick<LiveLease,'call_group_id'|'user_id'>){const sources=await publicationSources(db,lease);return {canSubscribe:true,canPublish:sources.length>0,canPublishSources:sources,canPublishData:false,canUpdateMetadata:false};}

export async function liveLeases(db:Pool|PoolClient,ids:string[]):Promise<LiveLease[]>{
 const uniqueIds=[...new Set(ids)];if(!uniqueIds.length)return [];
 return (await db.query<LiveLease>({
  name:'fg_live_call_admissions_v1',
  text:`SELECT a.id,m.user_id,a.session_id,m.call_group_id,m.room_id,
  'fg-call_'||m.call_group_id AS room_name,s.expires_at AT TIME ZONE 'UTC' AS session_expires_at
  FROM call_admissions a JOIN call_members m ON m.id=a.call_member_id
  JOIN call_groups c ON c.id=m.call_group_id AND c.room_id=m.room_id
  JOIN room_members rm ON rm.room_id=m.room_id AND rm.user_id=m.user_id
  JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id
  JOIN profiles p ON p.user_id=m.user_id
  WHERE a.id=ANY($1::text[]) AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
  AND m.left_at IS NULL AND c.state='OPEN' AND s.expires_at>clock_timestamp() AT TIME ZONE 'UTC'
  AND (a.disconnected_at IS NULL OR a.disconnected_at>clock_timestamp()-interval '30 seconds')
  AND EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=m.user_id)
  AND COALESCE((SELECT action FROM admin_actions WHERE target_user_id=m.user_id AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1),'UNBAN')<>'BAN'`,
  values:[uniqueIds]
 })).rows;
}
