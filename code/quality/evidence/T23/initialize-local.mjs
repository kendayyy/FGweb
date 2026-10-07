import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as tables from '@fg/database';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.DATABASE_URL);
assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Local only');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));assert.equal(ledger.tasks.find(t=>t.id==='T06-FIX1').status,'PASS');
const db=new pg.Client({connectionString:url.href,connectionTimeoutMillis:5000,query_timeout:15000});await db.connect();
try{
 await db.query('SET search_path TO public');
 const before=(await db.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN('pg_catalog','information_schema','public','fg_migrations') ORDER BY table_schema,table_name")).rows;
 assert.equal((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rowCount,0,'Public schema must be empty; do not reset existing data');
 assert.equal((await db.query("SELECT to_regclass('fg_migrations.__drizzle_migrations') AS journal")).rows[0].journal,null);
 await migrate(drizzle(db),{migrationsFolder:'packages/database/migrations',migrationsSchema:'fg_migrations'});
 await tables.seedGames(drizzle(db,{schema:tables}));
 assert.equal((await db.query('SELECT id FROM fg_migrations.__drizzle_migrations')).rowCount,7);
 assert.equal((await db.query('SELECT id FROM games')).rowCount,7);assert.equal((await db.query('SELECT id FROM lobbies')).rowCount,7);
 assert.equal((await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='invitations' AND column_name='recipient_accepted_at'")).rowCount,1);
 const after=(await db.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN('pg_catalog','information_schema','public','fg_migrations') ORDER BY table_schema,table_name")).rows;
 assert.deepEqual(after,before,'Other historical schemas unchanged');
 console.log(JSON.stringify({localApplicationInitialized:true,priorPublicTables:0,migrationsApplied:7,games:7,lobbies:7,otherSchemasUnchanged:true,reset:false}));
}finally{await db.end();}
