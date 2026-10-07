import fs from 'node:fs';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from '@fg/database';
import {loadAdminConfig} from './check-admin-config.mjs';

const mode=process.argv[2];
let pool,mail;
try{
 if(!['prepare','status','activate','resend-verification'].includes(mode))throw new Error('Unsupported provisioning action');
 const config=loadAdminConfig();if(!config.ready)throw new Error('Compliant private input and fixed binding required');
 const {app,input}=config;
 if(!app.DATABASE_URL||!app.BETTER_AUTH_SECRET||!(app.BETTER_AUTH_URL||app.PUBLIC_ORIGIN))throw new Error('Auth services are not configured');
 Object.assign(process.env,app);pool=new pg.Pool({connectionString:app.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
 const db=drizzle(pool,{schema});
 const {provisionAdminAccount}=await import('../apps/api/dist/modules/auth/auth-provision.js');
 if(mode==='prepare'||mode==='resend-verification'){
  const result=await provisionAdminAccount(db,input);
  let verificationSent=false;
  if(!result.verified&&(result.created||mode==='resend-verification')){
   const {createFgAuth}=await import('../apps/api/dist/modules/auth/auth.service.js');
   const {authMailTransport}=await import('../apps/api/dist/modules/auth/auth-mail.js');mail=authMailTransport();
   const baseURL=app.BETTER_AUTH_URL||app.PUBLIC_ORIGIN;
   const auth=createFgAuth(db,{baseURL,secret:app.BETTER_AUTH_SECRET,discordClientId:app.DISCORD_CLIENT_ID,discordClientSecret:app.DISCORD_CLIENT_SECRET,mailTransport:mail,mailFrom:app.SMTP_FROM});
   await auth.api.sendVerificationEmail({body:{email:input.email},headers:new Headers({Origin:baseURL})});verificationSent=true;
  }
  console.log(JSON.stringify({...result,verificationSent,adminActivated:false}));
 }else{
  // Status/activation never create or mutate a user, password or verification.
  const {AuthService}=await import('../apps/api/dist/modules/auth/auth.service.js');
  process.env.ADMIN_USER_IDS=input.userId;delete process.env.ADMIN_DISCORD_IDS;
  const service=new AuthService();service.setDb(db);
  const verified=await service.isUserAdmin(input.userId);
  if(mode==='activate'){
   if(!verified)throw new Error('Owner must consume a real email verification first');
   const {createHash}=await import('node:crypto');
   const binding=createHash('sha256').update(`${input.userId}\0${input.email.toLowerCase()}`).digest('hex');
   const result=await pool.query('SELECT value FROM verification WHERE identifier=$1',['fg-admin-provision:v1']);
   if(result.rowCount!==1||result.rows[0].value!==binding)throw new Error('Fixed provision binding is missing or conflicts');
   const original=fs.readFileSync('.env.local','utf8');
   const lines=original.split(/\r?\n/).filter(line=>!/^\s*(?:ADMIN_USER_IDS|ADMIN_DISCORD_IDS)\s*=/.test(line));
   const updated=`${lines.join('\n').trimEnd()}\nADMIN_USER_IDS=${input.userId}\n`;
   fs.writeFileSync('.runtime/auth-admin/env-activation.tmp',updated,{mode:0o600});fs.renameSync('.runtime/auth-admin/env-activation.tmp','.env.local');
  }
  console.log(JSON.stringify({ownerVerified:verified,adminActivated:mode==='activate'&&verified,configurationChanged:mode==='activate'}));
 }
}catch{
 console.error('Admin action stopped: check compliant local input, identity collisions, fixed binding, email verification and service availability. No credential details are logged.');process.exitCode=1;
}finally{mail?.close();if(pool)await pool.end();}
