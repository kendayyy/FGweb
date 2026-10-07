import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makeSignature,hashPassword} from 'better-auth/crypto';
import {MeDTOSchema,PrivateProfileSchema,PublicProfileSchema} from '@fg/contracts';
import {createPlaySessionsHarness} from '../T24/native-harness.mjs';

const h=await createPlaySessionsHarness();
try{
 const id=randomUUID(),token=randomUUID(),secret='t24-owned-review-secret-at-least-32-characters';
 await h.pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,'FG Email',`${id}@fixture.invalid`]);
 await h.pool.query('INSERT INTO account(id,user_id,provider_id,account_id,password,created_at,updated_at) VALUES($1,$2,$3,$2,$4,now(),now())',[randomUUID(),id,'credential',await hashPassword('native fixture password')]);
 await h.pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[randomUUID(),id,token]);
 const cookie=`better-auth.session_token=${token}.${await makeSignature(token,secret)}`;
 const call=async(method,route,body,authenticated=true)=>{
  const response=await fetch(`${h.base}/api/v1${route}`,{method,headers:{Origin:'http://localhost:5173',...authenticated?{Cookie:cookie}:{},...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{}});
  return {status:response.status,body:await response.json()};
 };
 assert.equal((await call('GET','/me',undefined,false)).status,401);
 const before=await call('GET','/me');assert.equal(before.status,200);const me=MeDTOSchema.parse(before.body);assert.equal(me.discordId,null);assert.equal(me.onboardingComplete,false);
 const onboarding=await call('POST','/me/onboarding',{displayName:'FG Email',interestedGames:['Valorant']});assert.equal(onboarding.status,200);assert.equal(PrivateProfileSchema.parse(onboarding.body).discordId,null);
 const after=await call('GET','/me');assert.equal(after.status,200);assert.equal(MeDTOSchema.parse(after.body).onboardingComplete,true);
 const profile=await call('GET',`/users/${id}/profile`,undefined,false);assert.equal(profile.status,200);PublicProfileSchema.parse(profile.body);
 for(const key of ['email','discordId','password','providerId'])assert(!Object.hasOwn(profile.body,key));
 console.log(JSON.stringify({compiledAppModule:true,actualPostgresAndRedis:true,emailOnlyMeAndOnboarding:true,guestDenied:true,publicIdentityPrivate:true}));
}finally{await h.cleanup();}
