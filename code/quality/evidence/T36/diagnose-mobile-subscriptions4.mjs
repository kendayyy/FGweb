import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import pg from 'pg';
const session=JSON.parse(fs.readFileSync('.runtime/t36/tunnel/active-session.json','utf8'));
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const statusResponse=await fetch('http://127.0.0.1:'+session.controlPort+'/status',{headers:{Authorization:'Bearer '+session.controlToken},signal:AbortSignal.timeout(10000)});
assert.equal(statusResponse.status,200);const live=await statusResponse.json();
const pool=new pg.Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
const lookup=[];const ids=Object.values(session.accounts).map(account=>account.userId);
try{
 const schemas=(await pool.query("SELECT schemaname FROM pg_tables WHERE tablename='push_subscriptions' ORDER BY schemaname")).rows;
 for(const {schemaname}of schemas){
  assert(/^[a-zA-Z0-9_]+$/.test(schemaname));
  const rows=(await pool.query('SELECT user_id,count(*)::int AS count FROM "'+schemaname+'".push_subscriptions WHERE user_id=ANY($1::text[]) GROUP BY user_id',[ids])).rows;
  lookup.push({schema:schemaname,currentOwnedSchema:schemaname===session.schema,ownedTesterCounts:rows.map(row=>({actor:Object.entries(session.accounts).find(([,account])=>account.userId===row.user_id)?.[0],count:row.count}))});
 }
}finally{await pool.end();}
const receipt={at:new Date().toISOString(),humanReport:{source:'Direct asynchronous reply',questionItemId:['request_user_input_async','call_7ed21ee44138459aa397afa886283f68',0],statement:'Push đã được đăng ký trên thiết bị này'},runtime:{origin:live.origin,runId:live.runId,subscriptionCounts:live.subscriptions.map(row=>({actor:Object.entries(session.accounts).find(([,account])=>account.userId===row.user_id)?.[0]??'other-test-actor',count:row.count})),producers:live.producers,deliveries:live.deliveries.map(row=>({at:row.at,status:row.status}))},independentDatabaseLookup:lookup,readOnly:true,noSubscriptionEndpointsKeysOrSessionTokensRead:true,taskPass:false};
const p='quality/evidence/T36/mobile-subscription-diagnosis4.json';fs.writeFileSync(p,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md','\n- '+receipt.at+': Human reports exact FG Push registered status. Codex investigates API controller/database and canonical frontend acknowledgment path before proposing any fix. Independent read-only lookup checks only exact owned tester IDs across tables, without endpoints/keys/session tokens; receipt code/'+p+'. No application/runtime change or PASS. Earlier inline diagnostic failed at shell quoting before execution; this script records actual completed lookup.\n');
console.log(JSON.stringify({origin:live.origin,activeSubscriptions:receipt.runtime.subscriptionCounts,producerActors:[...new Set(live.producers.map(producer=>producer.actor))],deliveryStatuses:receipt.runtime.deliveries,independentOwnedTesterLookup:lookup}));
