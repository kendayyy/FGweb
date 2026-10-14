import {Pool} from 'pg';import {enqueueNotification} from '@fg/database';
/** Uses PostgreSQL UTC clock and existing domain transaction/dedup policy. */
export class ScheduleReminders {
 private readonly pool:Pool;private closing=false;private active?:Promise<number>;
 constructor(databaseURL:string){this.pool=new Pool({connectionString:databaseURL,max:2,connectionTimeoutMillis:5000,statement_timeout:15000});}
 scan():Promise<number>{if(this.closing)return Promise.resolve(0);if(this.active)return this.active;this.active=(async()=>{const db=await this.pool.connect();let count=0;try{await db.query('BEGIN');const sessions=(await db.query("SELECT id,room_id,scheduled_at FROM play_sessions WHERE timing_type='scheduledAt' AND state='SCHEDULED' AND scheduled_at>clock_timestamp() AND scheduled_at<=clock_timestamp()+interval '10 minutes' ORDER BY scheduled_at,id LIMIT 100 FOR UPDATE SKIP LOCKED")).rows;
   for(const s of sessions){const recipients=(await db.query('SELECT tm.user_id FROM team_members tm JOIN room_members rm ON rm.room_id=$2 AND rm.user_id=tm.user_id WHERE tm.play_session_id=$1 ORDER BY tm.user_id',[s.id,s.room_id])).rows,scheduledAt=s.scheduled_at.toISOString();for(const r of recipients){const key='reminder:'+s.id+':'+scheduledAt+':'+r.user_id;if(await enqueueNotification(db,r.user_id,'REMINDER_10MIN',{playSessionId:s.id,roomId:s.room_id,scheduledAt},key))count++;}}
   await db.query('COMMIT');return count;
  }catch{await db.query('ROLLBACK').catch(()=>{});throw new Error('Scheduled reminder scan unavailable');}finally{db.release();}})();void this.active.finally(()=>{this.active=undefined;}).catch(()=>{});return this.active;}
 async close(){this.closing=true;await this.active?.catch(()=>{});await this.pool.end();}
}
