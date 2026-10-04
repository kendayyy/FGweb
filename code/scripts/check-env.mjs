import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createECDH } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export function inside(root,file) {
 const resolved=path.resolve(root,file);const relative=path.relative(fs.realpathSync(root),resolved);
 if(relative.startsWith('..')||path.isAbsolute(relative)) throw new Error('path outside code');
 let ancestor=resolved;while(!fs.existsSync(ancestor)) ancestor=path.dirname(ancestor);
 const realRelative=path.relative(fs.realpathSync(root),fs.realpathSync(ancestor));
 if(realRelative.startsWith('..')||path.isAbsolute(realRelative)) throw new Error('path outside code');
 return resolved;
}
export function loadEnv(file='.env.local') { return parseEnv(fs.readFileSync(inside(process.cwd(),file),'utf8')); }
export function validateEnv(env) {
 const required=['DATABASE_URL','REDIS_URL','PUBLIC_ORIGIN','BETTER_AUTH_URL','BETTER_AUTH_SECRET','DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','UPLOAD_ROOT'];
 const errors=required.filter(k=>!env[k]?.trim()).map(k=>'missing '+k);
 function validate(key,check){try{if(!check(env[key]))errors.push('invalid '+key);}catch{errors.push('invalid '+key);}}
 validate('DATABASE_URL',v=>['postgres:','postgresql:'].includes(new URL(v).protocol));
 validate('REDIS_URL',v=>['redis:','rediss:'].includes(new URL(v).protocol));
 validate('LIVEKIT_URL',v=>['ws:','wss:'].includes(new URL(v).protocol));
 validate('PUBLIC_ORIGIN',v=>{const u=new URL(v);return v===u.origin&&(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)));});
 validate('BETTER_AUTH_URL',v=>v===env.PUBLIC_ORIGIN);
 validate('BETTER_AUTH_SECRET',v=>v?.length>=32);
 validate('DISCORD_CLIENT_ID',v=>/^\d{17,20}$/.test(v));
 validate('SMTP_HOST',v=>/^[a-zA-Z0-9.-]+$/.test(v));
 validate('SMTP_PORT',v=>['465','587'].includes(v));
 validate('SMTP_USER',v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
 validate('SMTP_FROM',v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
 validate('VAPID_SUBJECT',v=>/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)||new URL(v).protocol==='https:');
 validate('VAPID_PRIVATE_KEY',v=>{const c=createECDH('prime256v1');c.setPrivateKey(Buffer.from(v,'base64url'));return c.getPublicKey().toString('base64url')===env.VAPID_PUBLIC_KEY;});
 validate('UPLOAD_ROOT',v=>{inside(process.cwd(),v);return !!v;});
 if(errors.length)throw new Error(errors.join('; '));return env;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{validateEnv(loadEnv(process.argv[process.argv.indexOf('--file')+1]&&process.argv.includes('--file')?process.argv[process.argv.indexOf('--file')+1]:'.env.local'));console.log('PASS: environment syntax, required fields, origins, upload boundary and VAPID pair');}catch(error){console.error('FAIL: '+(error.message.startsWith('missing ')||error.message.startsWith('invalid ')?error.message:'configuration unavailable or outside code'));process.exitCode=1;}}
