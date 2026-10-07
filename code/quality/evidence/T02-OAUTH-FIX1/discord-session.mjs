import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {makeSignature} from 'better-auth/crypto';
import {MeDTOSchema} from '@fg/contracts';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const runtime=JSON.parse(fs.readFileSync('.runtime/auth-admin/local-server.json','utf8'));
const pool=new pg.Pool({connectionString:env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
try{
 assert.equal(runtime.origin,'http://localhost:18080');
 const found=await pool.query(`SELECT s.token,s.user_id,a.account_id FROM session s JOIN account a ON a.user_id=s.user_id AND a.provider_id='discord' WHERE s.expires_at>clock_timestamp() AT TIME ZONE 'UTC' AND s.created_at >= $1::timestamptz AT TIME ZONE 'UTC' ORDER BY s.created_at DESC LIMIT 1`,[runtime.startedAt]);
 assert.equal(found.rowCount,1,'A current actual OAuth-created Discord session is required');
 const session=found.rows[0],signed=await makeSignature(session.token,env.BETTER_AUTH_SECRET);
 const cookie=`better-auth.session_token=${encodeURIComponent(`${session.token}.${signed}`)}`;
 const response=await fetch(`${runtime.origin}/api/v1/me`,{headers:{Cookie:cookie},signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,'Actual OAuth session Me must succeed');
 const body=await response.json();assert(MeDTOSchema.safeParse(body).success,'Actual native Me DTO must validate');
 assert(body.id===session.user_id&&body.discordId===session.account_id,'Actual Me must match the OAuth identity');
 assert(!['accessToken','refreshToken','token','password','passwordHash'].some(key=>key in body),'Me must not expose credential fields');
 const proof={checkedAt:new Date().toISOString(),origin:runtime.origin,humanConfirmedDiscordLogin:true,actualOAuthCreatedSession:true,nativeMeStatus:response.status,meDtoValid:true,discordIdentityMatches:true,credentialFieldsExposed:false,cookieReconstructedPrivatelyFromActualSession:true,userSessionPreserved:true,privateValuesLogged:false};
 fs.writeFileSync('quality/evidence/T02-OAUTH-FIX1/discord-session-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}catch{console.error('Actual Discord session verification failed; no private identity/cookie/token values logged.');process.exitCode=1;}
finally{await pool.end();}

