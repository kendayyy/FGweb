import pg from 'pg';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
export const leaseReasonSql=`SELECT a.id,a.revoked_at IS NOT NULL AS revoked,a.connected_at IS NOT NULL AS connected,
 a.expires_at<=clock_timestamp() AS admission_expired,
 a.disconnected_at IS NOT NULL AS disconnected,
 a.disconnected_at<=clock_timestamp()-interval '30 seconds' AS grace_expired,
 EXTRACT(EPOCH FROM clock_timestamp()-a.disconnected_at)*1000 AS disconnected_ms,
 EXTRACT(EPOCH FROM a.expires_at-clock_timestamp())*1000 AS remaining_ms,
 m.left_at IS NOT NULL AS member_left,c.state<>'OPEN' AS group_closed,
 s.id IS NULL OR s.expires_at<=clock_timestamp() AT TIME ZONE 'UTC' AS session_invalid,
 rm.user_id IS NULL AS membership_missing,p.user_id IS NULL AS profile_missing,
 NOT EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=m.user_id) AS interests_missing,
 COALESCE((SELECT action FROM admin_actions WHERE target_user_id=m.user_id AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1),'UNBAN')='BAN' AS banned,
 EXISTS(SELECT 1 FROM call_publish_slots slot WHERE slot.call_group_id=m.call_group_id AND slot.user_id=m.user_id) AS publishing
 FROM call_admissions a JOIN call_members m ON m.id=a.call_member_id JOIN call_groups c ON c.id=m.call_group_id
 LEFT JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id
 LEFT JOIN room_members rm ON rm.room_id=m.room_id AND rm.user_id=m.user_id
 LEFT JOIN profiles p ON p.user_id=m.user_id ORDER BY a.id`;
export async function startLeaseReasons({connectionString,evidenceDir}){
 const target=path.resolve(evidenceDir);assert(target.startsWith(path.resolve('quality/evidence/T30')+path.sep));
 const client=new pg.Client({connectionString,application_name:'fg_t30_readonly_lease_reasons',statement_timeout:1000,connectionTimeoutMillis:5000});await client.connect();
 const schema=(await client.query('SELECT current_schema() AS schema')).rows[0].schema;assert(/^t30_screen_[a-f0-9]{32}$/.test(schema));
 await client.query('SET default_transaction_read_only=on');
 const tags=new Map(),records=[];let stopped=false,inFlight,failures=0,dropped=0;const failureCodes=[];
 const sample=async()=>{try{const result=await client.query(leaseReasonSql);if(records.length>=1600){dropped++;return;}records.push({at:new Date().toISOString(),leases:result.rows.map(({id,...r})=>{if(!tags.has(id))tags.set(id,tags.size+1);return {tag:tags.get(id),...r,disconnected_ms:r.disconnected_ms===null?null:Math.round(Number(r.disconnected_ms)),remaining_ms:Math.round(Number(r.remaining_ms))};})});}catch(error){failures++;if(failureCodes.length<10)failureCodes.push(/^[0-9A-Z]{5}$/.test(error.code||'')?error.code:'UNKNOWN');}};
 const tick=()=>{if(stopped||inFlight)return;inFlight=sample().finally(()=>{inFlight=undefined;});};const timer=setInterval(tick,250);timer.unref();tick();
 return {async stop(){if(stopped)return;stopped=true;clearInterval(timer);if(inFlight)await inFlight;await client.end();const health={at:new Date().toISOString(),readOnly:true,syntheticSchemaOnly:true,rawIdsRetained:false,secretDataRead:false,samples:records.length,failureCount:failures,failureCodes,droppedCount:dropped,timerStopped:true,actualClientEnded:true};fs.writeFileSync(path.join(target,'lease-reasons.jsonl'),records.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});fs.writeFileSync(path.join(target,'lease-reasons-health.json'),JSON.stringify(health,null,2)+'\n',{flag:'wx'});return health;}};
}
