import {NestFactory} from '@nestjs/core';
import type {INestApplication} from '@nestjs/common';
import pg from 'pg';
import {drizzle, type NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import supertest from 'supertest';
import * as tables from '@fg/database';
import {MeDTOSchema} from '@fg/contracts';
import {AppModule} from '../src/app.module.js';
import {AuthService} from '../src/modules/auth/auth.service.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';

describe('T08-FIX1 authenticated persisted profile read (real PostgreSQL)',()=>{
 let app:INestApplication;
 let client:pg.Client;
 let db:NodePgDatabase<typeof tables>;
 let createdSchema=false;
 const originalUrl=process.env.DATABASE_URL;
 const schemaName='t08_fix1_'+randomUUID().replaceAll('-','');
 const origin=process.env.PUBLIC_ORIGIN!;
 let actor:string;
 let cookie:string;
 beforeAll(async()=>{
  if(!originalUrl||!process.env.BETTER_AUTH_SECRET||!origin)throw new Error('Local DB/auth config required; run with --env-file=.env.local');
  client=new pg.Client({connectionString:originalUrl});await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);createdSchema=true;
  await client.query(`SET search_path TO "${schemaName}"`);
  db=drizzle(client,{schema:tables});
  await migrate(db,{migrationsFolder:'packages/database/migrations',migrationsSchema:schemaName});
  await tables.seedGames(db);
  const scoped=new URL(originalUrl);scoped.searchParams.set('options',`-c search_path=${schemaName}`);
  process.env.DATABASE_URL=scoped.toString();
  app=await NestFactory.create(AppModule,{logger:false});await app.init();
 },60000);
 beforeEach(async()=>{
  actor=randomUUID();const now=new Date();const token=randomUUID();
  await db.insert(tables.user).values({id:actor,name:'Discord Gamer',email:actor+'@example.com',emailVerified:true,image:'https://provider.example.com/avatar.png',createdAt:now,updatedAt:now});
  await db.insert(tables.account).values({id:randomUUID(),userId:actor,accountId:'discord-'+actor,providerId:'discord',createdAt:now,updatedAt:now});
  await db.insert(tables.session).values({id:randomUUID(),token,userId:actor,expiresAt:new Date(Date.now()+3600000),createdAt:now,updatedAt:now});
  cookie=await createSignedSessionCookie(process.env.BETTER_AUTH_SECRET!,token);
 });
 afterAll(async()=>{
  try{if(app)await app.close();}
  finally{
   process.env.DATABASE_URL=originalUrl;
   if(client){try{if(createdSchema){await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);const check=await client.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schemaName]);expect(check.rowCount).toBe(0);}}finally{await client.end();}}
  }
 });
 const me=async()=>MeDTOSchema.parse((await supertest(app.getHttpServer()).get('/api/v1/me').set('Cookie',cookie).expect(200)).body);
 const mutate=(method:'patch'|'post'|'put',route:string,body:object)=>supertest(app.getHttpServer())[method](route).set('Cookie',cookie).set('Origin',origin).send(body).expect(200);
 it('first login returns explicit incomplete onboarding and empty stored interests',async()=>{
  const user=await me();expect(user.onboardingComplete).toBe(false);expect(user.interestedGames).toEqual([]);
 });
 it('a profile without interests does not falsely complete onboarding',async()=>{
  await mutate('patch','/api/v1/me/profile',{bio:'Profile only'});
  const user=await me();expect(user.onboardingComplete).toBe(false);expect(user.interestedGames).toEqual([]);
 });
 it('stored interests without a profile remain incomplete and are restored from DB',async()=>{
  await mutate('put','/api/v1/me/interests',{interestedGames:['Roblox']});
  const user=await me();expect(user.onboardingComplete).toBe(false);expect(user.interestedGames).toEqual(['Roblox']);
 });
 it('onboarding without rank is complete and remains correct across fresh GET requests',async()=>{
  await mutate('post','/api/v1/me/onboarding',{displayName:'FG Gamer',interestedGames:['Roblox','Valorant']});
  for(let attempt=0;attempt<2;attempt++){const user=await me();expect(user.onboardingComplete).toBe(true);expect([...(user.interestedGames??[])].sort()).toEqual(['Roblox','Valorant']);expect(user.displayName).toBe('FG Gamer');}
  expect(await app.get(AuthService).isUserOnboarded(actor)).toBe(true);
 });
 it('GET me retains explicitly cleared avatar after another unrelated profile update',async()=>{
  await mutate('patch','/api/v1/me/profile',{avatarUrl:null});
  expect((await me()).avatarUrl).toBeNull();
  await mutate('patch','/api/v1/me/profile',{bio:'Keep cleared avatar'});
  expect((await me()).avatarUrl).toBeNull();
 });
 it('guest cannot read private completion state and public profile omits private identity/state',async()=>{
  await supertest(app.getHttpServer()).get('/api/v1/me').expect(401);
  await mutate('post','/api/v1/me/onboarding',{displayName:'Public Gamer',interestedGames:['Valorant']});
  const response=await supertest(app.getHttpServer()).get(`/api/v1/users/${actor}/profile`).expect(200);
  for(const field of ['email','discordId','emailVerified','onboardingComplete','interestedGames'])expect(response.body).not.toHaveProperty(field);
 });
});
