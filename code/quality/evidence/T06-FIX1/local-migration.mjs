import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.DATABASE_URL);
assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Local migration only');
const client=new pg.Client({connectionString:url.href,connectionTimeoutMillis:5000,query_timeout:15000});await client.connect();
try{
 const journal=JSON.parse(fs.readFileSync('packages/database/migrations/meta/_journal.json'));
 const exists=(await client.query("SELECT to_regclass('fg_migrations.__drizzle_migrations') AS table")).rows[0].table;
 assert(exists,'Existing reviewed application migration journal required; do not infer/reset');
 const applied=(await client.query('SELECT hash,created_at FROM fg_migrations.__drizzle_migrations ORDER BY created_at')).rows;
 for(const entry of journal.entries.slice(0,6))assert(applied.some(r=>Number(r.created_at)===entry.when&&r.hash===createHash('sha256').update(fs.readFileSync(`packages/database/migrations/${entry.tag}.sql`)).digest('hex')),'Prior migrations must exactly match');
 const before=(await client.query('SELECT row_to_json(i) AS data FROM invitations i ORDER BY id')).rows.map(r=>r.data);
 if(process.argv.includes('--apply'))await migrate(drizzle(client),{migrationsFolder:'packages/database/migrations',migrationsSchema:'fg_migrations'});
 const column=(await client.query("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='invitations' AND column_name='recipient_accepted_at'")).rows[0];
 if(process.argv.includes('--apply')){
  assert.deepEqual(column,{data_type:'timestamp with time zone',is_nullable:'YES',column_default:null});
  const after=(await client.query('SELECT row_to_json(i) AS data FROM invitations i ORDER BY id')).rows.map(r=>r.data);
  for(const r of after)delete r.recipient_accepted_at;for(const r of before)delete r.recipient_accepted_at;assert.deepEqual(after,before,'Local old invitation data preserved');
 }
 console.log(JSON.stringify({localOnly:true,applicationJournalVerified:true,previousMigrations:applied.length,invitationRows:before.length,consentColumnPresent:!!column,applied:process.argv.includes('--apply'),priorInvitationDataPreserved:process.argv.includes('--apply')}));
}finally{await client.end();}
