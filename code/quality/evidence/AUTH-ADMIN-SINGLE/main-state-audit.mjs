import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {loadAdminConfig} from '../../../scripts/check-admin-config.mjs';
import {verifyFgPassword} from '../../../apps/api/dist/modules/auth/auth-password.js';
const config=loadAdminConfig();assert(config.ready,'Private local input must remain valid');
const {app,input}=config,pool=new pg.Pool({connectionString:app.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
try{
 const result=await pool.query('SELECT u.name,u.email_verified,a.password FROM "user" u JOIN account a ON a.user_id=u.id AND a.account_id=u.id AND a.provider_id=$3 WHERE u.id=$1 AND lower(u.email)=lower($2)',[input.userId,input.email,'credential']);
 assert.equal(result.rowCount,1,'Exactly one fixed native credential identity is required');
 assert(result.rows[0].name==='kingame','Reserved stored identity must match');
 assert(await verifyFgPassword({password:input.password,hash:result.rows[0].password}),'Stored salted credential must verify the exact private input');
 const marker=await pool.query('SELECT value FROM verification WHERE identifier=$1',['fg-admin-provision:v1']);
 const binding=createHash('sha256').update(`${input.userId}\0${input.email.toLowerCase()}`).digest('hex');
 assert(marker.rowCount===1&&marker.rows[0].value===binding,'The sole protected owner binding must match');
 console.log(JSON.stringify({mainIdentityExists:true,soleCredential:true,exactPrivatePasswordVerified:true,protectedOwnerBindingMatches:true,ownerVerified:result.rows[0].email_verified,configuredAdminBindingMatches:app.ADMIN_USER_IDS===input.userId,privateValuesLogged:false}));
}catch{
 console.error('Main owner state audit failed; private details omitted.');process.exitCode=1;
}finally{await pool.end();}
