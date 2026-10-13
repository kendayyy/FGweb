import {Injectable} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {ParticipantInfo} from '@livekit/protocol';
import {TrackSource} from 'livekit-server-sdk';
import {ErrorCode} from '@fg/contracts';
import {roomError} from '../rooms/rooms.service.js';
import {CallsService} from './calls.service.js';
import {liveLease} from './lease-store.js';

@Injectable()
export class PublishingService {
  private readonly observed=new Map<string,Set<string>>();
  constructor(private readonly calls:CallsService){}
  async claim(user:string,session:string,id:string){return this.calls.withControlGroup(user,session,id,async(db)=>{
    const lease=await this.calls.requireAdmission(db,id,user,session);
    if((await db.query("SELECT id FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2 AND restriction_type='STREAM_BLOCKED'",[id,user])).rowCount)roomError(ErrorCode.FORBIDDEN,'Moderator screen restriction');
    const existing=(await db.query('SELECT id FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2',[id,user])).rows[0];
    if(!existing){const occupied=(await db.query('SELECT ordinal FROM call_publish_slots WHERE call_group_id=$1',[id])).rows.map(r=>Number(r.ordinal));const ordinal=[1,2,3].find(n=>!occupied.includes(n));if(!ordinal)roomError(ErrorCode.CAPACITY_FULL,'Screen publisher limit is three');await db.query('INSERT INTO call_publish_slots(id,call_group_id,user_id,ordinal) VALUES($1,$2,$3,$4)',[randomUUID(),id,user,ordinal]);}
    await this.calls.syncNativePermissions(db,lease);
    return this.calls.grantForAdmission(db,lease);
  });}
  async release(user:string,session:string,id:string){return this.calls.withControlGroup(user,session,id,async(db)=>{
    const lease=await this.calls.requireAdmission(db,id,user,session);await db.query('DELETE FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2',[id,user]);await this.calls.syncNativePermissions(db,lease);return {success:true as const};
  });}
  forget(id:string){this.observed.delete(id);}
  /** Caller holds the room/group transaction lock; no nested transaction or quota race. */
  async reconcileWithin(db:PoolClient,id:string,people:ParticipantInfo[],now:Date,ended?:{identity:string;at:number}){
    const seen=this.observed.get(id)??new Set<string>();this.observed.set(id,seen);
    const rows=(await db.query<{id:string;user_id:string;created_at:Date;identity:string|null}>("SELECT p.id,p.user_id,p.created_at AT TIME ZONE 'UTC' AS created_at,a.id AS identity FROM call_publish_slots p LEFT JOIN call_members m ON m.call_group_id=p.call_group_id AND m.user_id=p.user_id AND m.left_at IS NULL LEFT JOIN call_admissions a ON a.call_member_id=m.id AND a.revoked_at IS NULL WHERE p.call_group_id=$1",[id])).rows;
    const current=new Set(rows.map(r=>r.id));for(const key of seen)if(!current.has(key))seen.delete(key);
    for(const row of rows){const peer=people.find(p=>p.identity===row.identity),screen=peer?.tracks.some(t=>t.source===TrackSource.SCREEN_SHARE);
      if(screen){seen.add(row.id);continue;}
      const lease=row.identity?await liveLease(db,row.identity):undefined;
      const stopped=ended?.identity===row.identity&&row.created_at.getTime()<=ended.at;
      if(!lease||seen.has(row.id)||stopped||now.getTime()-row.created_at.getTime()>=30000){await db.query('DELETE FROM call_publish_slots WHERE id=$1',[row.id]);seen.delete(row.id);}
    }
    for(const peer of people)await this.calls.syncLiveNativePermissions(db,peer);
  }
}
