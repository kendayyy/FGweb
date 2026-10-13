import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
const root=path.resolve(import.meta.dirname,'../../..'),folder=path.join(root,'packages/database/migrations');
const indexes=['chat_crypto_to_device_expiry_idx','chat_crypto_protocol_expiry_idx'];
describe('Additive queue expiry migration on actual PostgreSQL',()=>{
 for(const populated of [false,true])it(`migrates ${populated?'populated':'empty'} owned schema and preserves retry rows on repeat`,async()=>{
  const owned=`crypto_be_${randomUUID().replaceAll('-','')}`,runtime=path.resolve(root,'.runtime/chatcrypto-be',randomUUID()),env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8')),client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:15000});
  fs.mkdirSync(path.join(runtime,'meta'),{recursive:true});const journal=JSON.parse(fs.readFileSync(path.join(folder,'meta/_journal.json'),'utf8'));journal.entries=journal.entries.slice(0,21);fs.writeFileSync(path.join(runtime,'meta/_journal.json'),JSON.stringify(journal));for(const entry of journal.entries)fs.copyFileSync(path.join(folder,entry.tag+'.sql'),path.join(runtime,entry.tag+'.sql'));
  await client.connect();
  try{
   expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await client.query(`CREATE SCHEMA "${owned}"`);await client.query(`SET search_path TO "${owned}"`);await migrate(drizzle(client),{migrationsFolder:runtime,migrationsSchema:owned});
   expect((await client.query('SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND indexname=ANY($2::text[])',[owned,indexes])).rowCount).toBe(0);
   const tables=['chat_crypto_to_device_events','chat_crypto_protocol_events'];
   if(populated){
    const key=Buffer.alloc(32,1).toString('base64').replace(/=+$/,'');
    await client.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('a','a','expiry@example.invalid',true,now(),now())`);
    await client.query(`INSERT INTO conversations(id,kind) VALUES('dm','ROOM')`);
    await client.query(`INSERT INTO chat_crypto_devices(user_id,device_id,ed25519_key,curve25519_key,device_keys) VALUES('a','A',$1,$1,$2)`,[key,{user_id:'@a:fg.invalid',device_id:'A',algorithms:['m.olm.v1.curve25519-aes-sha2','m.megolm.v1.aes-sha2'],keys:{'ed25519:A':key,'curve25519:A':key},signatures:{'@a:fg.invalid':{'ed25519:A':'A'.repeat(86)}}}]);
    for(const table of tables){const column=table===tables[0]?'content':'event',payload=table===tables[0]?{algorithm:'m.olm.v1.curve25519-aes-sha2',sender_key:key,ciphertext:{[key]:{type:0,body:'AQID'}}}:{eventType:'m.key.verification.request',content:{transaction_id:'retry',from_device:'A',methods:['m.sas.v1'],timestamp:1}};
     await client.query(`INSERT INTO ${table}(id,conversation_id,membership_revision,sender_user_id,sender_device_id,recipient_user_id,recipient_device_id,transaction_id,${column},created_at,expires_at,acknowledged_at) VALUES('retry','dm',1,'a','A','a','A','retry',$1,now()-interval '1 day',now()+interval '1 day',now())`,[payload]);
    }
   }
   const before=[];for(const table of tables)before.push((await client.query(`SELECT row_to_json(q)::text AS exact FROM ${table} q ORDER BY id`)).rows);
   await migrate(drizzle(client),{migrationsFolder:folder,migrationsSchema:owned});await migrate(drizzle(client),{migrationsFolder:folder,migrationsSchema:owned});
   const actual=(await client.query('SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname=ANY($2::text[]) ORDER BY indexname',[owned,indexes])).rows;expect(actual).toHaveLength(2);for(const row of actual)expect(row.indexdef).toContain('USING btree (expires_at, id)');
   for(let i=0;i<tables.length;i++)expect((await client.query(`SELECT row_to_json(q)::text AS exact FROM ${tables[i]} q ORDER BY id`)).rows).toEqual(before[i]);
   expect(Number((await client.query(`SELECT count(*) FROM "${owned}".__drizzle_migrations`)).rows[0].count)).toBe(22);
  }finally{
   try{expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await client.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}finally{await client.end();expect(fs.realpathSync(runtime)).toBe(path.join(fs.realpathSync(path.join(root,'.runtime/chatcrypto-be')),path.basename(runtime)));expect(path.basename(runtime)).toMatch(/^[a-f0-9-]{36}$/);fs.rmSync(runtime,{recursive:true});}
  }
 },30000);
});
