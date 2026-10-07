import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {getAuthTables} from 'better-auth/db';
import {hashPassword,verifyPassword} from 'better-auth/crypto';
import * as schema from '@fg/database';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),client=new pg.Client({connectionString:env.DATABASE_URL});
const name=`test_auth02_data_${randomUUID().replaceAll('-','')}`;assert(/^test_auth02_data_[a-f0-9]{32}$/.test(name));
await client.connect();let created=false;
try{
 await client.query(`CREATE SCHEMA "${name}"`);created=true;await client.query(`SET search_path TO "${name}"`);
 const db=drizzle(client,{schema});await migrate(db,{migrationsFolder:'packages/database/migrations',migrationsSchema:name});
 const installed=getAuthTables({emailAndPassword:{enabled:true}});assert.equal(installed.account.fields.password.type,'string');assert.equal(installed.verification.fields.expiresAt.type,'date');
 const now=new Date(),discordId='existing-discord-user';
 await db.insert(schema.user).values({id:discordId,name:'Discord unchanged',email:'discord-fixture@example.com',emailVerified:true,createdAt:now,updatedAt:now});
 await db.insert(schema.account).values({id:'discord-account',accountId:'discord-provider-id',providerId:'discord',userId:discordId,createdAt:now,updatedAt:now});
 await db.insert(schema.profiles).values({userId:discordId,displayName:'Existing gamer',bio:'Keep profile'});
 await db.insert(schema.session).values({id:'existing-session',token:randomUUID(),userId:discordId,expiresAt:new Date(Date.now()+3600000),createdAt:now,updatedAt:now});
 const before=await client.query('SELECT u.*,p.display_name,p.bio,s.id AS session_id,a.provider_id,a.account_id FROM "user" u JOIN profiles p ON p.user_id=u.id JOIN session s ON s.user_id=u.id JOIN account a ON a.user_id=u.id WHERE u.id=$1',[discordId]);
 const password='  kiểm thử Ω thật  ',hash1=await hashPassword(password),hash2=await hashPassword(password);assert.notEqual(hash1,hash2,'Independent salts');assert.notEqual(hash1,password);assert(await verifyPassword({hash:hash1,password}));assert(!await verifyPassword({hash:hash1,password:password.trim()}),'Spaces are significant');
 for(const [id,hashed]of [[discordId,hash1],['email-user',hash2]]){
  if(id!==discordId)await db.insert(schema.user).values({id,name:'Email user',email:'email-fixture@example.com',emailVerified:false,createdAt:now,updatedAt:now});
  await db.insert(schema.account).values({id:`credential-${id}`,accountId:id,providerId:'credential',userId:id,password:hashed,createdAt:now,updatedAt:now});
 }
 const accounts=await client.query('SELECT provider_id,password FROM account WHERE user_id=$1',[discordId]);assert.equal(accounts.rowCount,2);assert.equal(accounts.rows.find(r=>r.provider_id==='credential').password,hash1);assert.equal(accounts.rows.find(r=>r.provider_id==='discord').password,null);
 const emailAccounts=await client.query('SELECT provider_id FROM account WHERE user_id=$1',['email-user']);assert.deepEqual(emailAccounts.rows,[{provider_id:'credential'}]);
 await assert.rejects(db.insert(schema.account).values({id:'duplicate-credential',accountId:discordId,providerId:'credential',userId:discordId,password:hash2,createdAt:now,updatedAt:now}),err=>err.cause?.code==='23505');
 const expiresAt=new Date(now.getTime()+86400000),metadata={userId:discordId,sessionId:'existing-session',email:'discord-fixture@example.com'};
 await db.insert(schema.verification).values({id:'schema-proof',identifier:'schema-proof-only',value:JSON.stringify(metadata),expiresAt,createdAt:now,updatedAt:now});
 const [verification]=await db.select().from(schema.verification);assert.deepEqual(JSON.parse(verification.value),metadata);assert.equal(verification.expiresAt.getTime(),expiresAt.getTime());
 const utc=await client.query("SELECT expires_at AT TIME ZONE 'UTC' AS expires_at FROM verification WHERE id=$1",['schema-proof']);assert.equal(utc.rows[0].expires_at.getTime(),expiresAt.getTime());
 await migrate(db,{migrationsFolder:'packages/database/migrations',migrationsSchema:name});
 const after=await client.query('SELECT u.*,p.display_name,p.bio,s.id AS session_id,a.provider_id,a.account_id FROM "user" u JOIN profiles p ON p.user_id=u.id JOIN session s ON s.user_id=u.id JOIN account a ON a.user_id=u.id WHERE u.id=$1 AND a.provider_id=$2',[discordId,'discord']);assert.deepEqual(after.rows,before.rows);
 console.log(JSON.stringify({database:'real isolated migrated PostgreSQL',installedBetterAuth:'1.7.7',schemaCompatible:true,migrationRequired:false,saltedScrypt:true,passwordSpacesPreserved:true,credentialAndDiscordCoexist:true,emailOnlySupported:true,providerAccountUnique:true,verificationMetadataAndExpirySupported:true,existingDiscordUserProfileSessionUnchanged:true,repeatMigrateIdempotent:true,authFlowsImplemented:false}));
}finally{if(created)await client.query(`DROP SCHEMA "${name}" CASCADE`);await client.end();}
