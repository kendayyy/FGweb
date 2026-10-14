import {Injectable} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {TrackSource} from 'livekit-server-sdk';
import {ErrorCode,type CallModerationRequest} from '@fg/contracts';
import {roomError} from '../rooms/rooms.service.js';
import {CallsService} from './calls.service.js';
import {liveLease} from './lease-store.js';

@Injectable()
export class CallModerationService {
  constructor(private readonly calls:CallsService){}
  async moderate(user:string,session:string,id:string,request:CallModerationRequest){
    const result=await this.calls.withControlGroup(user,session,id,async(db,group)=>{
      const owner=(await db.query('SELECT owner_id FROM rooms WHERE id=$1',[group.room_id])).rows[0]?.owner_id;
      if(owner!==user){const helper=(await db.query("SELECT p.id FROM permission_grants p JOIN room_members m ON m.room_id=p.room_id AND m.user_id=p.user_id WHERE p.room_id=$1 AND p.user_id=$2 AND m.role='HELPER' AND p.permission='MANAGE_CALLS' FOR SHARE OF p,m",[group.room_id,user])).rowCount;if(!helper)roomError(ErrorCode.FORBIDDEN,'Current MANAGE_CALLS permission required');}
      const member=(await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE',[id,request.targetUserId])).rows[0];if(!member)roomError(ErrorCode.FORBIDDEN,'Current call target required');
      const admission=(await db.query('SELECT id FROM call_admissions WHERE call_member_id=$1 AND revoked_at IS NULL FOR UPDATE',[member.id])).rows[0];const lease=admission?await liveLease(db,admission.id):undefined;if(!lease)roomError(ErrorCode.FORBIDDEN,'Current call admission required');
      if(request.action==='KICK'){await this.calls.revokeMemberWithin(db,member.id,lease);return {success:true as const};}
      const kind=['MUTE_MIC','ALLOW_MIC'].includes(request.action)?'MIC_MUTED':'STREAM_BLOCKED',restrict=['MUTE_MIC','STOP_SCREEN_SHARE'].includes(request.action);
      if(restrict)await db.query('INSERT INTO call_restrictions(id,call_group_id,target_user_id,restriction_type,issued_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(call_group_id,target_user_id,restriction_type) DO UPDATE SET issued_by=EXCLUDED.issued_by',[randomUUID(),id,request.targetUserId,kind,user]);else await db.query('DELETE FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2 AND restriction_type=$3',[id,request.targetUserId,kind]);
      if(request.action==='MUTE_MIC')await db.query('UPDATE call_members SET is_muted=true WHERE id=$1',[member.id]);
      if(request.action==='STOP_SCREEN_SHARE')await db.query('DELETE FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2',[id,request.targetUserId]);
      const previous=await this.calls.syncNativePermissions(db,lease);
      if(request.action==='MUTE_MIC')for(const track of previous?.tracks??[])if(track.source===TrackSource.MICROPHONE||track.source===TrackSource.SCREEN_SHARE_AUDIO)await this.calls.muteNativeTrack(lease,track.sid);
      return {success:true as const};
    });
    if(request.action==='KICK')await this.calls.finishModeration(id);
    return result;
  }
}
