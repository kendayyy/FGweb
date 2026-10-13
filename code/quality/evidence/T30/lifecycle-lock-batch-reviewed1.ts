import {PublishingService} from './publishing.service.js';
import {TrackSource} from 'livekit-server-sdk';
import {Injectable,OnModuleInit,OnModuleDestroy,Logger,HttpException} from '@nestjs/common';
import {Pool,PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {RoomServiceClient,WebhookReceiver} from 'livekit-server-sdk';
import {ParticipantInfo,ParticipantInfo_State} from '@livekit/protocol';
import {CallsService} from './calls.service.js';
import {liveLeases} from './lease-store.js';

interface Deferred<T=void> {
 promise: Promise<T>;
 resolve: (value: T | PromiseLike<T>) => void;
 reject: (reason?: unknown) => void;
}

function defer<T=void>(): Deferred<T> {
 let resolve!: (value: T | PromiseLike<T>) => void;
 let reject!: (reason?: unknown) => void;
 const promise = new Promise<T>((res, rej) => {
  resolve = res;
  reject = rej;
 });
 return {promise, resolve, reject};
}

interface GroupRunner {
 running: boolean;
 pendingOrdinary: Deferred[];
 pendingEnded: Array<{ended: {identity: string; at: number}; deferred: Deferred}>;
}

const roomName=/^fg-call_([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
const gone=(error:unknown)=>Boolean(error&&typeof error==='object'&&'code'in error&&error.code==='not_found');
@Injectable()
export class CallLifecycleService implements OnModuleInit,OnModuleDestroy {
 private pool!:Pool;
 private clock=()=>Date.now();
 private timer?:ReturnType<typeof setInterval>;
 private running?:Promise<void>;
 private closing=false;
 private readonly logger=new Logger(CallLifecycleService.name);
 private readonly coalescers=new Map<string,GroupRunner>();
 private readonly inFlight=new Set<Promise<void>>();
 constructor(private readonly calls:CallsService,private readonly publishing:PublishingService){}
 setClock(fn?:()=>number){this.clock=fn??(()=>Date.now());}
 onModuleInit(){
  this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:8,connectionTimeoutMillis:5000,statement_timeout:15000});
  this.calls.setAfterLeave(id=>this.closeIfEmpty(id));
  this.timer=setInterval(()=>{if(this.closing||this.running||!this.configured())return;this.running=this.sweep().catch(()=>this.logger.warn('Call lifecycle unavailable; persisted state will be retried')).finally(()=>{this.running=undefined;});},1000);this.timer.unref();
 }
 async onModuleDestroy(){
  this.closing=true;
  clearInterval(this.timer);
  this.calls.setAfterLeave(undefined);
  await this.running;
  while(this.inFlight.size>0){
   await Promise.allSettled(Array.from(this.inFlight));
  }
  await this.pool?.end();
 }
 private configured(){return Boolean(process.env.LIVEKIT_SERVER_URL&&process.env.LIVEKIT_ADMISSION_URL&&process.env.LIVEKIT_API_KEY&&process.env.LIVEKIT_API_SECRET);}
 private native(){if(!this.configured())throw Error('Private media configuration required');return new RoomServiceClient(process.env.LIVEKIT_SERVER_URL!,process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!,{requestTimeout:3});}
 private async transaction<T>(run:(db:PoolClient)=>Promise<T>):Promise<T>{const db=await this.pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL TIME ZONE 'UTC'");const result=await run(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
 private async lock(db:PoolClient,id:string){
  // Materialized room lock is consumed by the group row lock: same order, one roundtrip.
  return (await db.query(`WITH located AS MATERIALIZED (SELECT room_id FROM call_groups WHERE id=$1),
   locked_room AS MATERIALIZED (SELECT r.id FROM rooms r JOIN located l ON l.room_id=r.id FOR SHARE OF r)
   SELECT c.id,c.room_id,c.state FROM call_groups c JOIN locked_room r ON r.id=c.room_id WHERE c.id=$1 FOR UPDATE OF c`,[id])).rows[0] as {id:string;room_id:string;state:string}|undefined;
 }
 private async release(db:PoolClient,ids:string[],time:Date){if(!ids.length)return;
  await db.query('UPDATE call_admissions SET revoked_at=COALESCE(revoked_at,$2) WHERE call_member_id=ANY($1::text[])',[ids,time]);
  await db.query('DELETE FROM call_publish_slots WHERE (call_group_id,user_id) IN(SELECT call_group_id,user_id FROM call_members WHERE id=ANY($1::text[]))',[ids]);
  await db.query('UPDATE call_members SET left_at=COALESCE(left_at,$2) WHERE id=ANY($1::text[])',[ids,time]);
 }
 private async closeLocked(db:PoolClient,id:string,time:Date){
  if((await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL LIMIT 1',[id])).rowCount)return false;
  // Left members have NULL generated call_state, so closing the group retains
  // historical rows instead of invoking its active-member FK cascade.
  await db.query("UPDATE call_groups SET state='CLOSED',ended_at=COALESCE(ended_at,$2) WHERE id=$1 AND state='OPEN'",[id,time]);return true;
 }
 private async deleteNative(id:string){
  const native=this.native(),name=`fg-call_${id}`;
  try{await native.deleteRoom(name);}catch(error){
   // Native DeleteRoom can return a plain 404 without a Twirp error code.
   // Confirm absence instead of swallowing an unknown administration failure.
   if((await native.listRooms([name])).length)throw error;
  }
 }
 async closeIfEmpty(id:string){const closed=await this.transaction(async db=>{
  const group=await this.lock(db,id);if(!group||group.state!=='OPEN')return false;
  return this.closeLocked(db,id,new Date(this.clock()));
 });if(closed){this.publishing.forget(id);await this.deleteNative(id);}}
 async receive(raw:string,authorization?:string){
  let event;
  try{event=await new WebhookReceiver(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!).receive(raw,authorization,false,0);}catch{throw new HttpException({code:'FORBIDDEN',message:'Webhook signature denied'},401);}
  if(!event.id||event.id.length>128||!event.event)throw new HttpException({code:'INVALID_INPUT',message:'Invalid webhook event'},400);
  const match=event.room?.name?.match(roomName),id=match?.[1];
  // Only durable identifiers/type are stored; native JSON may contain identities
  // and metadata that are not required for deduplication.
  const added=await this.transaction(async db=>{
   // Durable dedupe has no room/group FK or state mutation. Canonical
   // reconciliation below retains its fresh room/group locks and is awaited.
   return Boolean((await db.query('INSERT INTO webhook_events(id,event_id,event_type,payload) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO NOTHING RETURNING id',[randomUUID(),event.id,event.event,JSON.stringify({callId:id??null})])).rowCount);
  });
  // Always reconcile on a retry as well: a crash after the durable event insert
  // must not turn a duplicate acknowledgement into a lost state transition.
  if(id)await this.reconcileGroup(id,event.event==='track_unpublished'&&event.track?.source===TrackSource.SCREEN_SHARE&&event.participant?.identity?{identity:event.participant.identity,at:Number(event.createdAt)*1000}:undefined);return {success:true,duplicate:!added};
 }
 private async reconcileGroup(id:string,ended?:{identity:string;at:number}):Promise<void>{
  if(this.closing)throw new HttpException('Call lifecycle shutting down',503);
  const deferred=defer();
  let runner=this.coalescers.get(id);
  if(!runner){
   runner={running:false,pendingOrdinary:[],pendingEnded:[]};
   this.coalescers.set(id,runner);
  }
  if(ended)runner.pendingEnded.push({ended,deferred});
  else runner.pendingOrdinary.push(deferred);
  if(!runner.running){
   runner.running=true;
   const job=this.runGroup(id,runner);
   this.inFlight.add(job);
   job.then(()=>{this.inFlight.delete(job);},()=>{this.inFlight.delete(job);});
  }
  return deferred.promise;
 }
 private async runGroup(id:string,runner:GroupRunner):Promise<void>{
  try{
   while(runner.pendingEnded.length>0||runner.pendingOrdinary.length>0){
    if(runner.pendingEnded.length>0){
     const {ended,deferred}=runner.pendingEnded.shift()!;
     try{
      await this.reconcilePass(id,ended);
      deferred.resolve();
     }catch(err){
      deferred.reject(err);
     }
    }else if(runner.pendingOrdinary.length>0){
     const batch=runner.pendingOrdinary;
     runner.pendingOrdinary=[];
     try{
      await this.reconcilePass(id);
      for(const d of batch)d.resolve();
     }catch(err){
      for(const d of batch)d.reject(err);
     }
    }
   }
  }finally{
   runner.running=false;
   if(this.coalescers.get(id)===runner&&runner.pendingEnded.length===0&&runner.pendingOrdinary.length===0){
    this.coalescers.delete(id);
   }else if(runner.pendingEnded.length>0||runner.pendingOrdinary.length>0){
    runner.running=true;
    const nextJob=this.runGroup(id,runner);
    this.inFlight.add(nextJob);
    nextJob.then(()=>{this.inFlight.delete(nextJob);},()=>{this.inFlight.delete(nextJob);});
   }
  }
 }
 private async reconcilePass(id:string,ended?:{identity:string;at:number}){
  const time=new Date(this.clock()),native=this.native();let closed=false;
  await this.transaction(async db=>{
   const group=await this.lock(db,id);if(!group)return;
   if(group.state==='CLOSED'){this.publishing.forget(id);closed=true;return;}
   const name=`fg-call_${id}`,nativeExists=Boolean((await native.listRooms([name])).length);
   let participants:ParticipantInfo[]=[];if(nativeExists)try{participants=await native.listParticipants(name);}catch(error){if(!gone(error))throw error;}
   const present=new Set(participants.filter(p=>p.state!==ParticipantInfo_State.DISCONNECTED).map(p=>p.identity));
   const members=(await db.query(`SELECT m.id,m.user_id,a.id AS lease_id,a.connected_at,a.disconnected_at,a.expires_at,a.revoked_at
    FROM call_members m LEFT JOIN call_admissions a ON a.call_member_id=m.id AND a.revoked_at IS NULL WHERE m.call_group_id=$1 AND m.left_at IS NULL FOR UPDATE OF m`,[id])).rows;
   // Fresh eligibility after canonical room/group and member locks; never reuse a previous pass.
   const eligible=new Set((await liveLeases(db,members.flatMap(member=>member.lease_id?[member.lease_id]:[]))).map(lease=>lease.id));
   const released:string[]=[],presentAdmissions:string[]=[];
   for(const member of members){
    if(!member.lease_id||!eligible.has(member.lease_id)){released.push(member.id);continue;}
    if(present.has(member.lease_id)){
     presentAdmissions.push(member.lease_id);continue;
    }
    if(member.connected_at){
     if(!member.disconnected_at)await db.query('UPDATE call_admissions SET disconnected_at=$2 WHERE id=$1 AND disconnected_at IS NULL AND revoked_at IS NULL',[member.lease_id,time]);
     else if(time.getTime()-member.disconnected_at.getTime()>=30000)released.push(member.id);
    }else if(member.expires_at.getTime()<=time.getTime())released.push(member.id);
   }
   if(presentAdmissions.length)await db.query('UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=ANY($1::text[]) AND revoked_at IS NULL AND (connected_at IS NULL OR disconnected_at IS NOT NULL)',[presentAdmissions,time]);
   await this.release(db,released,time);
   await this.publishing.reconcileWithin(db,id,participants,time,ended);
   // A newly created group has no joined/reserved members yet. It must stay
   // available for the first admission, rather than closing in its first sweep.
   // An empty group with native presence is eligible to close if historical members
   // were retained or a matching internal committed-admission marker is present.
   if(!nativeExists||(await db.query('SELECT id FROM call_members WHERE call_group_id=$1 LIMIT 1',[id])).rowCount||(await db.query("SELECT id FROM webhook_events WHERE event_id=$1 AND event_type='FG_ADMISSION_COMMITTED' LIMIT 1",[`fg:admission-committed:${id}`])).rowCount)closed=await this.closeLocked(db,id,time);
  });
  if(closed)await this.deleteNative(id);
 }
 async sweep(){if(!this.configured())return;
  const groups=(await this.pool.query("SELECT id FROM call_groups WHERE state='OPEN' ORDER BY room_id,id")).rows;
  for(const group of groups)await this.reconcileGroup(group.id);
  await this.calls.reconcile();
  // Native rooms orphaned by committed room deletion are collected after one
  // minute. The delay protects CreateRoom whose database transaction is pending.
  for(const room of await this.native().listRooms()){
   const id=room.name.match(roomName)?.[1];if(!id)continue;
   const group=(await this.pool.query('SELECT state FROM call_groups WHERE id=$1',[id])).rows[0];
   if(group?.state==='CLOSED'||(!group&&Number(room.creationTime)*1000<=this.clock()-60000))await this.deleteNative(id);
  }
 }
}
