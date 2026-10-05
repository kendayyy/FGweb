import { NestFactory } from '@nestjs/core';
import { HttpException, type INestApplication } from '@nestjs/common';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as tables from '@fg/database';
import { AppModule } from '../../../apps/api/src/app.module.js';
import { createSignedSessionCookie } from '../../../apps/api/test/test-cookie-helper.js';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import type { ArgumentsHost } from '@nestjs/common';
import { ProfilesExceptionFilter } from '../../../apps/api/src/modules/profiles/profiles.exception-filter.js';

describe('Codex T10 internal error privacy (unit scope)',()=>{
 it('keeps unexpected backend failures500 and hides internal exception text',()=>{
  let status=0;let payload:unknown;
  const response={status:(value:number)=>{status=value;return response;},json:(value:unknown)=>{payload=value;}};
  const host={switchToHttp:()=>({getResponse:()=>response,getRequest:()=>({headers:{}})})} as unknown as ArgumentsHost;
  new ProfilesExceptionFilter().catch(new Error('private_backend_marker'),host);
  expect(status).toBe(500);
  expect(JSON.stringify(payload)).not.toContain('private_backend_marker');
 });
 it('hides server HttpException details and does not label a server failure as invalid user input',()=>{
  let status=0;let payload:unknown;
  const response={status:(value:number)=>{status=value;return response;},json:(value:unknown)=>{payload=value;}};
  const host={switchToHttp:()=>({getResponse:()=>response,getRequest:()=>({headers:{}})})} as unknown as ArgumentsHost;
  new ProfilesExceptionFilter().catch(new HttpException({message:'private_backend_marker',details:{private:'private_backend_marker'}},500),host);
  expect(status).toBe(500);
  expect(JSON.stringify(payload)).not.toContain('private_backend_marker');
  expect((payload as {code?:string}).code).not.toBe('INVALID_INPUT');
 });
});

describe('Codex T10 independent HTTP regressions',()=>{
 let app:INestApplication;
 let client:pg.Client;
 const schemaName='t10_codex_'+randomUUID().replaceAll('-','');
 const originalUrl=process.env.DATABASE_URL;
 const origin=process.env.PUBLIC_ORIGIN!;
 const actor='codex_actor_'+randomUUID();
 let cookie:string;
 beforeAll(async()=>{
  if(!originalUrl||!process.env.BETTER_AUTH_SECRET)throw new Error('Local DB/auth configuration required');
  client=new pg.Client({connectionString:originalUrl});await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}"`);
  const db=drizzle(client,{schema:tables});
  await migrate(db,{migrationsFolder:'packages/database/migrations',migrationsSchema:schemaName});
  await tables.seedGames(db);
  const scoped=new URL(originalUrl);scoped.searchParams.set('options',`-c search_path=${schemaName}`);
  process.env.DATABASE_URL=scoped.toString();
  const now=new Date();
  await db.insert(tables.user).values({id:actor,name:'Review Actor',email:'review-actor@example.com',emailVerified:true,createdAt:now,updatedAt:now});
  await db.insert(tables.account).values({id:'account_'+actor,userId:actor,accountId:'discord-review-fixture',providerId:'discord',createdAt:now,updatedAt:now});
  const token=randomUUID();
  await db.insert(tables.session).values({id:randomUUID(),token,userId:actor,expiresAt:new Date(Date.now()+3600000),createdAt:now,updatedAt:now});
  cookie=await createSignedSessionCookie(process.env.BETTER_AUTH_SECRET,token);
  app=await NestFactory.create(AppModule,{logger:false});await app.init();
 },60000);
 afterAll(async()=>{
  try{if(app)await app.close();}
  finally{
   process.env.DATABASE_URL=originalUrl;
   if(client){try{await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);}finally{await client.end();}}
  }
 });
 it('rejects PATCH payload identity override instead of stripping it into a successful mutation',async()=>{
  const response=await supertest(app.getHttpServer()).patch('/api/v1/me/profile').set('Cookie',cookie).set('Origin',origin).send({displayName:'Injected change',userId:'another-user'});
  expect(response.status).toBe(422);
  const result=await client.query(`SELECT count(*)::int AS count FROM "${schemaName}".profiles WHERE user_id=$1`,[actor]);
  expect(result.rows[0].count).toBe(0);
 });
 it('does not accept an arbitrary avatar URL before T14 when the Discord actor has no provider image',async()=>{
  const response=await supertest(app.getHttpServer()).post('/api/v1/me/onboarding').set('Cookie',cookie).set('Origin',origin).send({displayName:'Review Actor',interestedGames:['Valorant'],avatarUrl:'https://outside.invalid/unapproved.png'});
  expect(response.status).toBe(422);
 });
 it('invalid interest PUT returns the shared INVALID_INPUT error code and preserves data',async()=>{
  const before=await client.query(`SELECT game_id FROM "${schemaName}".game_interests WHERE user_id=$1 ORDER BY game_id`,[actor]);
  const response=await supertest(app.getHttpServer()).put('/api/v1/me/interests').set('Cookie',cookie).set('Origin',origin).send({interestedGames:['unknown-game']});
  expect(response.status).toBe(422);
  expect(response.body.code).toBe('INVALID_INPUT');
  const after=await client.query(`SELECT game_id FROM "${schemaName}".game_interests WHERE user_id=$1 ORDER BY game_id`,[actor]);
  expect(after.rows).toEqual(before.rows);
 });
 it('concurrent interest replacement yields one complete selection instead of a union',async()=>{
  await client.query(`DELETE FROM "${schemaName}".game_interests WHERE user_id=$1`,[actor]);
  // Test-only insertion delay makes both unprotected DELETEs finish before either INSERT.
  await client.query(`CREATE FUNCTION "${schemaName}".delay_interest_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END; $$`);
  await client.query(`CREATE TRIGGER delay_interest_insert BEFORE INSERT ON "${schemaName}".game_interests FOR EACH ROW EXECUTE FUNCTION "${schemaName}".delay_interest_insert()`);
  const responses=await Promise.all(['Valorant','Roblox'].map(game=>supertest(app.getHttpServer()).put('/api/v1/me/interests').set('Cookie',cookie).set('Origin',origin).send({interestedGames:[game]})));
  expect(responses.map(response=>response.status)).toEqual([200,200]);
  const result=await client.query(`SELECT game_id FROM "${schemaName}".game_interests WHERE user_id=$1`,[actor]);
  expect(result.rows).toHaveLength(1);
 });
 it('explicitly cleared avatar stays null when returning the profile or later patching another field',async()=>{
  await client.query(`UPDATE "${schemaName}"."user" SET image=$1 WHERE id=$2`,['https://provider.example.com/review.png',actor]);
  const cleared=await supertest(app.getHttpServer()).patch('/api/v1/me/profile').set('Cookie',cookie).set('Origin',origin).send({avatarUrl:null});
  expect(cleared.status).toBe(200);expect(cleared.body.avatarUrl).toBeNull();
  const changed=await supertest(app.getHttpServer()).patch('/api/v1/me/profile').set('Cookie',cookie).set('Origin',origin).send({bio:'An unrelated edit'});
  expect(changed.status).toBe(200);expect(changed.body.avatarUrl).toBeNull();
  const publicView=await supertest(app.getHttpServer()).get(`/api/v1/users/${actor}/profile`);
  expect(publicView.status).toBe(200);expect(publicView.body.avatarUrl).toBeNull();
 });
});
