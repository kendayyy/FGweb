import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';
const file='.env.local';const existing=fs.readFileSync(file,'utf8');const env=parseEnv(existing);const local=parseEnv(fs.readFileSync('infra/.env.local','utf8'));
const keys=webpush.generateVAPIDKeys();
const defaults={DATABASE_URL:`postgresql://${encodeURIComponent(local.POSTGRES_USER)}:${encodeURIComponent(local.POSTGRES_PASSWORD)}@127.0.0.1:55432/${encodeURIComponent(local.POSTGRES_DB)}`,REDIS_URL:`redis://:${encodeURIComponent(local.REDISCLI_AUTH)}@127.0.0.1:56379`,PUBLIC_ORIGIN:'http://localhost:5173',BETTER_AUTH_URL:'http://localhost:5173',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),LIVEKIT_URL:'ws://127.0.0.1:57880',LIVEKIT_API_KEY:local.LIVEKIT_API_KEY,LIVEKIT_API_SECRET:local.LIVEKIT_API_SECRET,UPLOAD_ROOT:'.runtime/uploads'};
if(!env.VAPID_PUBLIC_KEY&&!env.VAPID_PRIVATE_KEY){defaults.VAPID_PUBLIC_KEY=keys.publicKey;defaults.VAPID_PRIVATE_KEY=keys.privateKey;}
let output=existing;let count=0;for(const[k,v]of Object.entries(defaults)){if(env[k])continue;const expression=new RegExp('^'+k+'=.*$','m');if(expression.test(output))output=output.replace(expression,`${k}=${v}`);else output+=`\n${k}=${v}`;count++;}
fs.writeFileSync(file,output.trimEnd()+'\n',{mode:0o600});console.log('Local configuration completed; generated fields: '+count+'; existing values preserved; secrets not displayed.');
