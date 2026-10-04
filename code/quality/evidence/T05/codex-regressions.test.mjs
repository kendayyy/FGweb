import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {loadEnv} from '../../../scripts/check-env.mjs';
import * as schema from '../../../packages/database/dist/index.js';
function code(e){return e?.cause?.code ?? e?.code;}
async function isolated(operation){const name='test_t05_review_'+randomUUID().replaceAll('-','');const c=new pg.Client({connectionString:loadEnv().DATABASE_URL});await c.connect();try{await c.query(`CREATE SCHEMA "${name}"`);await c.query(`SET search_path TO "${name}"`);const db=drizzle(c,{schema});await migrate(db,{migrationsFolder:'packages/database/migrations',migrationsSchema:name});await schema.seedGames(db);await c.query('INSERT INTO "user"(id,name,email,created_at,updated_at) VALUES($1,$2,$3,now(),now()),($4,$5,$6,now(),now())',['a','A','a@example.test','b','B','b@example.test']);await operation(c);}finally{try{await c.query(`DROP SCHEMA "${name}" CASCADE`);}finally{await c.end();}}}
test('LOBBY requires a lobby identity and cannot carry a DM pair',async()=>{await isolated(async c=>{await assert.rejects(c.query('INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES($1,$2,$3,$4)',['bad-lobby','LOBBY','a','b']),e=>code(e)==='23514');});});
test('deleting a replied-to message clears reply only, preserving conversation',async()=>{await isolated(async c=>{await c.query('INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES($1,$2,$3,$4)',['dm','DM','a','b']);await c.query('INSERT INTO messages(id,conversation_id,sender_id,client_message_id) VALUES($1,$2,$3,$4)',['parent','dm','a','p']);await c.query('INSERT INTO messages(id,conversation_id,sender_id,client_message_id,reply_to_id) VALUES($1,$2,$3,$4,$5)',['reply','dm','b','r','parent']);await c.query('DELETE FROM messages WHERE id=$1',['parent']);const r=await c.query('SELECT conversation_id,reply_to_id FROM messages WHERE id=$1',['reply']);assert.deepEqual(r.rows,[{conversation_id:'dm',reply_to_id:null}]);});});
