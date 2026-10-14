import fs from 'node:fs';import {createHash} from 'node:crypto';
const d='quality/evidence/T35',p='apps/worker/src/index.ts',proposed=d+'/worker-index.proposed';
fs.writeFileSync(proposed,`import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {NotificationOutboxWorker} from './notification-outbox.js';
import {NotificationDeliveryWorker,type DeliveryWorkerOptions} from './delivery-worker.js';
import {ScheduleReminders} from './schedule-reminders.js';import {createPushAdapter} from './push.js';import {createEmailAdapter} from './email.js';
export interface NotificationRuntimeOptions {databaseURL:string;redisURL:string;publicOrigin:string;queueName?:string;push?:DeliveryWorkerOptions['push'];email?:DeliveryWorkerOptions['email'];}
/** Importing the factory does not activate any main/production service. */
export async function createNotificationRuntime(options:NotificationRuntimeOptions){
 const ownedEmail=options.email?undefined:createEmailAdapter({host:process.env.SMTP_HOST??'',port:Number(process.env.SMTP_PORT),user:process.env.SMTP_USER??'',password:process.env.SMTP_PASSWORD??'',from:process.env.SMTP_FROM??'',publicOrigin:options.publicOrigin});
 const inApp=new NotificationOutboxWorker({databaseURL:options.databaseURL,redisURL:options.redisURL,queueName:options.queueName});
 const delivery=new NotificationDeliveryWorker({...options,push:options.push??createPushAdapter({subject:process.env.VAPID_SUBJECT??'',publicKey:process.env.VAPID_PUBLIC_KEY??'',privateKey:process.env.VAPID_PRIVATE_KEY??''}),email:options.email??ownedEmail!});
 const reminders=new ScheduleReminders(options.databaseURL);let timer:ReturnType<typeof setInterval>|undefined,closing:Promise<void>|undefined;
 const close=()=>{if(closing)return closing;if(timer)clearInterval(timer);closing=(async()=>{let failed=false;for(const component of [reminders,delivery,inApp])try{await component.close();}catch{failed=true;}ownedEmail?.close();if(failed)throw new Error('Notification runtime shutdown unavailable');})();return closing;};
 try{await inApp.start();await delivery.start();await reminders.scan();timer=setInterval(()=>void reminders.scan().catch(()=>console.error('FG reminder scan unavailable')),1000);timer.unref();}
 catch{await close().catch(()=>{});throw new Error('Notification runtime startup unavailable');}
 return{close,prefixes:{inApp:inApp.prefix,delivery:delivery.prefix},queueNames:{inApp:options.queueName??'in-app',delivery:options.queueName??'external-delivery'}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const runtime=await createNotificationRuntime({databaseURL:process.env.DATABASE_URL??'',redisURL:process.env.REDIS_URL??'',publicOrigin:process.env.PUBLIC_ORIGIN??''});let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;try{await runtime.close();process.exit(0);}catch{process.exit(1);}};process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());console.log('FG notification runtime ready');}
 catch{console.error('FG notification runtime startup failed');process.exitCode=1;}
}
`,{flag:'wx'});
const h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');fs.writeFileSync(d+'/runtime-index-adoption-plan1.json',JSON.stringify({reviewer:'Codex',unresolvedSourceFindings:[],reason:'T35 delivery/reminder features require lifecycle composition with unchanged T33 in-app worker. Exact guarded CLI/factory bootstrap; owned test import does not start main services, all pools/queues/timers close, config/receipts remain separate. No deployment/main migration/85PASS/checker changes.',files:[{path:p,proposed,beforeSha256:h(p),afterSha256:h(proposed)}]},null,2)+'\n',{flag:'wx'});console.log('Prepared exact worker runtime composition proposal, not activated.');
