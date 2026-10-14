import {NotificationOutboxWorker} from './notification-outbox.js';
const worker=new NotificationOutboxWorker({databaseURL:process.env.DATABASE_URL??'',redisURL:process.env.REDIS_URL??''});
let closing=false;const close=async()=>{if(closing)return;closing=true;try{await worker.close();process.exit(0);}catch{process.exit(1);}};
process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
try{await worker.start();console.log('FG in-app notification worker ready');}catch{console.error('FG in-app notification worker startup failed');await worker.close();process.exitCode=1;}
