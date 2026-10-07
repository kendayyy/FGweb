import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from '@fg/database';
import assert from 'node:assert/strict';
import {loadAdminConfig} from '../../../scripts/check-admin-config.mjs';
const config=loadAdminConfig();assert(config.ready,'Private local input must be valid');
const {app,input}=config,origin='http://localhost:18080';
Object.assign(process.env,app,{PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin});
let pool,mail;
try{
 const response=await fetch(`${origin}/api/v1/me`);assert.equal(response.status,401,'Real local application must be serving');
 pool=new pg.Pool({connectionString:app.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
 const rows=await pool.query('SELECT email_verified,name FROM "user" WHERE id=$1 AND lower(email)=lower($2)',[input.userId,input.email]);
 assert.equal(rows.rowCount,1);assert.equal(rows.rows[0].name,'kingame');assert.equal(rows.rows[0].email_verified,false);
 const {createFgAuth}=await import('../../../apps/api/dist/modules/auth/auth.service.js');
 const {authMailTransport}=await import('../../../apps/api/dist/modules/auth/auth-mail.js');mail=authMailTransport();
 const auth=createFgAuth(drizzle(pool,{schema}),{baseURL:origin,secret:app.BETTER_AUTH_SECRET,discordClientId:app.DISCORD_CLIENT_ID,discordClientSecret:app.DISCORD_CLIENT_SECRET,mailTransport:mail,mailFrom:app.SMTP_FROM});
 await auth.api.sendVerificationEmail({body:{email:input.email},headers:new Headers({Origin:origin})});
 console.log(JSON.stringify({actualNativeVerificationMailSent:true,recipientIsApprovedPendingOwner:true,origin,temporaryLocalPortOnly:true,verified:false}));
}catch{
 console.error('Owner verification mail failed; no private values or tokens are logged.');process.exitCode=1;
}finally{mail?.close();if(pool)await pool.end();}
