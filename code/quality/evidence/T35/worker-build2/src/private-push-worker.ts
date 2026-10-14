import pg from 'pg';
import {PrivatePushDispatcher} from './private-push-dispatcher.js';
import {loadPrivatePushConfiguration} from './private-push-configuration.js';
async function main(){
 const args=process.argv.slice(2);let once=false,jobId:string|undefined;
 for(let index=0;index<args.length;index++){
  const argument=args[index];
  if(argument==='--once'&&!once){once=true;continue;}
  if(argument==='--job'&&jobId===undefined){const value=args[++index];if(value&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)){jobId=value;continue;}}
  throw new Error('Private PUSH worker arguments unavailable');
 }
 if(jobId&&!once)throw new Error('Private PUSH worker arguments unavailable');
 const configuration=loadPrivatePushConfiguration(process.env.FG_PRIVATE_PUSH_CONFIG_FILE);if(!process.env.DATABASE_URL)throw new Error('Private PUSH database unavailable');
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000,statement_timeout:10000});let stopping=false;
 const stop=()=>{stopping=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const dispatcher=new PrivatePushDispatcher(pool,configuration);
  do{
   if(!await dispatcher.isReady())throw new Error('Private PUSH schema unavailable');
   const jobs=jobId?[jobId]:(await pool.query("SELECT o.id FROM notification_outbox o JOIN notifications n ON n.id=o.notification_id AND n.user_id=o.user_id WHERE o.channel='PUSH' AND ((n.type='DM' AND o.dedup_key LIKE 'crypto-dm:%') OR (n.type='MENTION' AND o.dedup_key LIKE 'crypto-mention:%')) AND n.dedup_key=o.dedup_key AND o.status='PENDING' AND o.scheduled_at<=clock_timestamp() ORDER BY o.scheduled_at,o.id LIMIT 20")).rows.map(row=>String(row.id));let delivered=0,processed=0;
   for(const id of jobs){if(stopping)break;processed++;if(await dispatcher.dispatchOne(id))delivered++;}
   if(once){console.log(JSON.stringify({status:'READY',processed,delivered}));break;}
   if(delivered)console.log(JSON.stringify({status:'DELIVERED',delivered}));if(!stopping)await new Promise(resolve=>setTimeout(resolve,1000));
  }while(!stopping);
 }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);await pool.end();}
}
void main().catch(()=>{console.error('Private PUSH worker unavailable; jobs retained for retry');process.exitCode=1;});
