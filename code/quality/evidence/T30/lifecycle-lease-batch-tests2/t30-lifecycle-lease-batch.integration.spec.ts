import 'reflect-metadata';
import { jest } from '@jest/globals';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { RoomServiceClient } from 'livekit-server-sdk';
import { ParticipantInfo_State } from '@livekit/protocol';
import type { ParticipantInfo } from '@livekit/protocol';
import * as tables from '@fg/database';
import { AppModule } from '../../../../apps/api/src/app.module.js';
import { CallsService } from '../../../../apps/api/src/modules/calls/calls.service.js';
import { CallLifecycleService } from '../../../../apps/api/src/modules/calls/call-lifecycle.service.js';
import { PublishingService } from '../../../../apps/api/src/modules/calls/publishing.service.js';
import { createSignedSessionCookie } from '../../../../apps/api/test/test-cookie-helper.js';

function findWorkspaceRoot(startDir: string): string {
  let curr = startDir;
  for (let i = 0; i < 7; i++) {
    if (
      fs.existsSync(path.join(curr, '.env.local')) ||
      fs.existsSync(path.join(curr, 'packages/database/migrations'))
    ) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir, '../../../../..');
}

const root = findWorkspaceRoot(path.dirname(fileURLToPath(import.meta.url)));
const authSecret = 't30-noop-write-secret-min-32-chars-long';
const origin = 'http://localhost:5173';

const originalListRooms = RoomServiceClient.prototype.listRooms;
const originalListParticipants = RoomServiceClient.prototype.listParticipants;
const originalGetParticipant = RoomServiceClient.prototype.getParticipant;
const originalUpdateParticipant = RoomServiceClient.prototype.updateParticipant;
const originalDeleteRoom = RoomServiceClient.prototype.deleteRoom;

jest.setTimeout(60000);

describe('T30 CallLifecycleService No-Op Write Integration Suite', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let dbUrl: string;
  let originalDbUrl: string | undefined;
  let valorantGame: { id: string; title: string };
  let schemaCreated = false;
  let lifecycleService: CallLifecycleService;
  let callsService: CallsService;
  let publishingService: PublishingService;

  const schemaUuid = randomUUID().replaceAll('-', '');
  const owned = `t30_lifecycle_batch_${schemaUuid}`;
  const cookies: Record<string, string> = {};
  const savedEnv = { ...process.env };

  let activeParticipants: ParticipantInfo[] = [];
  const observations:Record<string,unknown>[]=[];
  afterEach(()=>{lifecycleService?.setClock();activeParticipants=[];});

  beforeAll(async () => {
    originalDbUrl = process.env.DATABASE_URL;
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    const db = new URL(env.DATABASE_URL!);
    db.searchParams.set('options', `-c search_path=${owned}`);
    dbUrl = db.href;

    pool = new pg.Pool({
      connectionString: dbUrl,
      max: 16,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });

    await pool.query(`CREATE SCHEMA "${owned}"`);
    schemaCreated = true;

    await migrate(drizzle(pool), {
      migrationsFolder: path.join(root, 'packages/database/migrations'),
      migrationsSchema: owned,
    });

    await tables.seedGames(drizzle(pool, { schema: tables }));
    const games = (await pool.query<{ id: string; title: string }>('SELECT id, title FROM games')).rows;
    const val = games.find((g) => g.title === 'Valorant');
    if (!val) throw new Error('Valorant game required');
    valorantGame = val;

    for (const id of ['owner', 'viewer', 'contender']) {
      await pool.query(
        'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1, $1, $2, true, now(), now())',
        [id, `${id}@fixture.invalid`]
      );
      await pool.query('INSERT INTO profiles(user_id, display_name) VALUES($1, $1)', [id]);
      await pool.query('INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $1, $2)', [id, valorantGame.id]);
      cookies[id] = await createSignedSessionCookie(authSecret, `tok-${id}`);
      await pool.query(
        "INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at) VALUES($1, $2, $3, now() + interval '1 day', now(), now())",
        [`sess-${id}`, id, `tok-${id}`]
      );
    }

    Object.assign(process.env, env, {
      DATABASE_URL: dbUrl,
      PUBLIC_ORIGIN: origin,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: authSecret,
      LIVEKIT_SERVER_URL: 'http://127.0.0.1:7880',
      LIVEKIT_ADMISSION_URL: 'ws://127.0.0.1:7880',
      LIVEKIT_API_KEY: 'controlled-test-key',
      LIVEKIT_API_SECRET: 'controlled-test-secret',
    });

    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false, rawBody: true });
    await app.init();

    lifecycleService = app.get(CallLifecycleService);
    callsService = app.get(CallsService);
    publishingService = app.get(PublishingService);

    // Deterministically disable background sweep intervals and callbacks
    if ((lifecycleService as unknown as { timer?: NodeJS.Timeout }).timer) {
      clearInterval((lifecycleService as unknown as { timer: NodeJS.Timeout }).timer);
      (lifecycleService as unknown as { timer?: NodeJS.Timeout }).timer = undefined;
    }
    callsService.setAfterLeave(undefined);

    // Mock deterministic SDK presence policy
    RoomServiceClient.prototype.listRooms = async function (this: RoomServiceClient, names?: string[]) {
      if (names && names.length) {
        return names.map((name) => ({ name, creationTime: BigInt(Date.now()) } as any));
      }
      return [];
    };
    RoomServiceClient.prototype.listParticipants = async function (this: RoomServiceClient) {
      return activeParticipants;
    };
    RoomServiceClient.prototype.getParticipant = async function (this: RoomServiceClient) {
      return {} as any;
    };
    RoomServiceClient.prototype.updateParticipant = async function (this: RoomServiceClient) {
      return {} as any;
    };
    RoomServiceClient.prototype.deleteRoom = async function (this: RoomServiceClient) {
      return {} as any;
    };
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    const cleanup = {
      schemaRemoved: false,
      poolEnded: false,
      prototypesRestored: false,
      envRestored: false,
      appClosed: false,
    };

    try {
      await app?.close();
      cleanup.appClosed = true;
    } catch (err) {
      errors.push(err);
    }

    try {
      if (schemaCreated) {
        expect(owned).toMatch(/^t30_lifecycle_batch_[a-f0-9]{32}$/);
        await pool.query(`DROP SCHEMA "${owned}" CASCADE`);
        cleanup.schemaRemoved =
          (await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [owned])).rowCount === 0;
        expect(cleanup.schemaRemoved).toBe(true);
      }
    } catch (err) {
      errors.push(err);
    }

    if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
    else delete process.env.DATABASE_URL;
    process.env = savedEnv;
    cleanup.envRestored =
      JSON.stringify(Object.entries(process.env).sort()) ===
      JSON.stringify(Object.entries(savedEnv).sort());

    RoomServiceClient.prototype.listRooms = originalListRooms;
    RoomServiceClient.prototype.listParticipants = originalListParticipants;
    RoomServiceClient.prototype.getParticipant = originalGetParticipant;
    RoomServiceClient.prototype.updateParticipant = originalUpdateParticipant;
    RoomServiceClient.prototype.deleteRoom = originalDeleteRoom;

    cleanup.prototypesRestored =
      RoomServiceClient.prototype.listRooms === originalListRooms &&
      RoomServiceClient.prototype.listParticipants === originalListParticipants &&
      RoomServiceClient.prototype.getParticipant === originalGetParticipant &&
      RoomServiceClient.prototype.updateParticipant === originalUpdateParticipant &&
      RoomServiceClient.prototype.deleteRoom === originalDeleteRoom;

    try {
      await pool?.end();
      cleanup.poolEnded = Boolean(pool && (pool as unknown as { ended?: boolean }).ended === true);
    } catch (err) {
      errors.push(err);
    }

    const cleanupFile = path.join(
      root,
      `quality/evidence/T30/lifecycle-lease-batch-cleanup-${schemaUuid}.json`
    );
    fs.writeFileSync(
      cleanupFile,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          ...cleanup,
          observations,
          errorCount: errors.length,
        },
        null,
        2
      ) + '\n',
      { flag: 'wx' }
    );

    if(!Object.values(cleanup).every(Boolean))errors.push(new Error("Actual cleanup evidence incomplete"));
    if (errors.length) {
      throw new AggregateError(errors, 'Controlled noop-write test teardown failed');
    }
  });

  async function seedControlledCall() {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const fixtureUser=randomUUID(),fixtureSession=randomUUID();
      await db.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[fixtureUser,fixtureUser+'@fixture.invalid']);
      await db.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[fixtureUser]);
      await db.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),fixtureUser,valorantGame.id]);
      await db.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[fixtureSession,fixtureUser,'tok-'+fixtureSession]);
      const convId = `conv_${randomUUID()}`;
      await db.query(
        "INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, 'ROOM', now(), now())",
        [convId]
      );

      const roomId = `room_${randomUUID()}`;
      await db.query(
        `INSERT INTO rooms(id, name, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
         VALUES($1, 'Controlled Noop Room', $2, 'owner', 'OWNER', 'PUBLIC', 'DIRECT_MEMBER', 10, $3, 'ROOM', now(), now())`,
        [roomId, valorantGame.id, convId]
      );

      await db.query(
        "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, 'owner', 'OWNER', now()), ($3, $2, $5, 'MEMBER', now()), ($4, $2, 'contender', 'MEMBER', now())",
        [`rm_${randomUUID()}`, roomId, `rm_${randomUUID()}`, `rm_${randomUUID()}`,fixtureUser]
      );

      const callId = randomUUID();
      await db.query(
        "INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, 'OPEN', now())",
        [callId, roomId]
      );

      const cmId = `cm_${randomUUID()}`;
      await db.query(
        "INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, $4, 1, false, now())",
        [cmId, callId, roomId,fixtureUser]
      );

      const admissionId = `admission_${randomUUID()}`;
      await db.query(
        "INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, now() + interval '1 day', now())",
        [admissionId, cmId,fixtureSession]
      );

      await db.query('COMMIT');
      return { roomId, callId, cmId, admissionId };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }


  async function captureConnectedAtUpdate(fn:()=>Promise<void>){
    let count=0;let rowCount:number|null=null;
    const lifecyclePool=(lifecycleService as unknown as {pool:pg.Pool}).pool;
    const originals=new Map<pg.PoolClient,pg.PoolClient['query']>();
    const acquire=(client:pg.PoolClient)=>{if(originals.has(client))return;const orig=client.query;originals.set(client,orig);
      client.query=function(...args:any[]){const result=Reflect.apply(orig,this,args);const text=typeof args[0]==='string'?args[0]:args[0]?.text??'';
        if(/^UPDATE call_admissions SET connected_at=/.test(text)){count++;if(result&&typeof result.then==='function')result.then((res:any)=>{rowCount=res.rowCount;},()=>{});}
        return result;
      } as typeof client.query;
    };
    lifecyclePool.on('acquire',acquire);
    try{await fn();}finally{lifecyclePool.removeListener('acquire',acquire);for(const [client,orig]of originals)client.query=orig;}
    return {count,rowCount};
  }
  async function captureLeaseReads(fn:()=>Promise<void>){
    const lp=(lifecycleService as unknown as {pool:pg.Pool}).pool;
    const originals=new Map<pg.PoolClient,pg.PoolClient['query']>();const reads:{name:string;durationMs:number}[]=[];
    const acquire=(client:pg.PoolClient)=>{if(originals.has(client))return;const original=client.query;originals.set(client,original);
      client.query=function(...args:any[]){const started=performance.now(),result=Reflect.apply(original,this,args),name=args[0]?.name;
        if(name==='fg_live_call_admission_v1'||name==='fg_live_call_admissions_v1')result.then(()=>reads.push({name,durationMs:performance.now()-started}),()=>{});
        return result;
      } as typeof client.query;
    };lp.on('acquire',acquire);
    try{await fn();}finally{lp.removeListener('acquire',acquire);for(const[client,original]of originals)client.query=original;}
    return reads;
  }
  async function seedTen(){const f=await seedControlledCall();const people=[f];
    for(let seat=2;seat<=10;seat++){const user=randomUUID(),session=randomUUID(),cmId=randomUUID(),admissionId=randomUUID();
      await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[user,user+'@fixture.invalid']);
      await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[user]);
      await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),user,valorantGame.id]);
      await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[session,user,'tok-'+session]);
      await pool.query("INSERT INTO room_members(id,room_id,user_id,role,joined_at) VALUES($1,$2,$3,'MEMBER',now())",[randomUUID(),f.roomId,user]);
      await pool.query('INSERT INTO call_members(id,call_group_id,room_id,user_id,seat_index,is_muted,joined_at) VALUES($1,$2,$3,$4,$5,false,now())',[cmId,f.callId,f.roomId,user,seat]);
      await pool.query("INSERT INTO call_admissions(id,call_member_id,session_id,expires_at,created_at) VALUES($1,$2,$3,now()+interval '1 day',now())",[admissionId,cmId,session]);
      people.push({...f,cmId,admissionId});
    }
    activeParticipants=people.map(p=>({identity:p.admissionId,state:ParticipantInfo_State.ACTIVE,tracks:[]} as unknown as ParticipantInfo));return people;
  }
  it('ten live native identities retain all seats with one canonical eligibility query',async()=>{
    const people=await seedTen(),reads=await captureLeaseReads(()=>reconcile(people[0].callId));
    const live=(await pool.query('SELECT count(*)::int AS n FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[people[0].callId])).rows[0].n;
    observations.push({kind:'ten-live',live,reads});expect(live).toBe(10);expect(reads.length).toBeLessThanOrEqual(1);
  });
  it('mixed ten-member batch removes revoked, expired, logged-out and incomplete profiles despite native presence',async()=>{
    const people=await seedTen();
    await pool.query('UPDATE call_admissions SET revoked_at=clock_timestamp() WHERE id=$1',[people[1].admissionId]);
    await pool.query("UPDATE call_admissions SET created_at=clock_timestamp()-interval '1 minute',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[people[2].admissionId]);
    await pool.query('DELETE FROM session WHERE id=(SELECT session_id FROM call_admissions WHERE id=$1)',[people[3].admissionId]);
    await pool.query('DELETE FROM game_interests WHERE user_id=(SELECT user_id FROM call_members WHERE id=$1)',[people[4].cmId]);
    const reads=await captureLeaseReads(()=>reconcile(people[0].callId));
    const left=await Promise.all(people.map(async p=>(await member(p.cmId)).left_at!==null));
    observations.push({kind:'mixed-guards',left,reads});expect(left).toEqual([false,true,true,true,true,false,false,false,false,false]);
    expect(reads.length).toBeLessThanOrEqual(1);
  });
  it('canonical wait reads expiry and revocation committed before acquiring the room lock',async()=>{
    const people=await seedTen(),held=await pool.connect();const lp=(lifecycleService as unknown as {pool:pg.Pool}).pool;
    const originals=new Map<pg.PoolClient,pg.PoolClient['query']>();let observedResolve!:()=>void;
    const observed=new Promise<void>(resolve=>{observedResolve=resolve;});
    const acquire=(client:pg.PoolClient)=>{if(originals.has(client))return;const original=client.query;originals.set(client,original);client.query=function(...args:any[]){const result=Reflect.apply(original,this,args);if(typeof args[0]==='string'&&/^SELECT id FROM rooms.*FOR SHARE/.test(args[0]))observedResolve();return result;} as typeof client.query;};
    let pending:Promise<void>|undefined;
    try{await held.query('BEGIN');await held.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[people[0].roomId]);lp.on('acquire',acquire);pending=reconcile(people[0].callId);await observed;
      await held.query('UPDATE call_admissions SET revoked_at=clock_timestamp() WHERE id=$1',[people[1].admissionId]);
      await held.query("UPDATE call_admissions SET created_at=clock_timestamp()-interval '1 minute',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[people[2].admissionId]);await held.query('COMMIT');await pending;
      expect((await member(people[1].cmId)).left_at!==null).toBe(true);expect((await member(people[2].cmId)).left_at!==null).toBe(true);expect((await member(people[0].cmId)).left_at===null).toBe(true);
      observations.push({kind:'fresh-after-lock',revokedReleased:true,expiredReleased:true,validRetained:true});
    }finally{await held.query('ROLLBACK');held.release();if(pending)await pending;lp.removeListener('acquire',acquire);for(const[client,original]of originals)client.query=original;}
  });
  const reconcile=(id:string)=>(lifecycleService as unknown as {reconcileGroup:(id:string)=>Promise<void>}).reconcileGroup(id);
  const present=(id:string)=>{activeParticipants=[{identity:id,state:ParticipantInfo_State.ACTIVE,tracks:[]} as unknown as ParticipantInfo];};
  const row=async(id:string)=>(await pool.query('SELECT ctid::text,xmin::text,connected_at,disconnected_at,revoked_at FROM call_admissions WHERE id=$1',[id])).rows[0];
  const member=async(id:string)=>(await pool.query('SELECT left_at FROM call_members WHERE id=$1',[id])).rows[0];
  it('first presence writes exactly once and sets actual service timestamp',async()=>{
    const f=await seedControlledCall();present(f.admissionId);const time=Date.now();lifecycleService.setClock(()=>time);
    const capture=await captureConnectedAtUpdate(()=>reconcile(f.callId));const r=await row(f.admissionId);
    observations.push({kind:'first',...capture,timestampExact:r.connected_at?.getTime()===time,disconnectNull:r.disconnected_at===null});
    expect(capture).toEqual({count:1,rowCount:1});expect(r.connected_at?.getTime()===time).toBe(true);expect(r.disconnected_at===null).toBe(true);
  });
  it('already connected actual source must skip physical tuple rewrite',async()=>{
    const f=await seedControlledCall();present(f.admissionId);await reconcile(f.callId);const before=await row(f.admissionId);
    const capture=await captureConnectedAtUpdate(()=>reconcile(f.callId));const after=await row(f.admissionId);
    observations.push({kind:'repeated',...capture,ctidUnchanged:after.ctid===before.ctid,xminUnchanged:after.xmin===before.xmin,timestampUnchanged:after.connected_at.getTime()===before.connected_at.getTime()});
    expect(capture).toEqual({count:1,rowCount:0});expect(after.ctid===before.ctid).toBe(true);expect(after.xmin===before.xmin).toBe(true);expect(after.connected_at.getTime()===before.connected_at.getTime()).toBe(true);
  });
  it('actual disconnect and reconnect writes once retaining original connected timestamp',async()=>{
    const f=await seedControlledCall();present(f.admissionId);const base=Date.now();lifecycleService.setClock(()=>base);await reconcile(f.callId);const before=await row(f.admissionId);
    activeParticipants=[];lifecycleService.setClock(()=>base+5000);await reconcile(f.callId);const disconnected=await row(f.admissionId);expect(disconnected.disconnected_at?.getTime()===base+5000).toBe(true);
    present(f.admissionId);lifecycleService.setClock(()=>base+10000);const capture=await captureConnectedAtUpdate(()=>reconcile(f.callId));const after=await row(f.admissionId);
    observations.push({kind:'reconnect',...capture,disconnectCleared:after.disconnected_at===null,firstTimestampRetained:after.connected_at.getTime()===before.connected_at.getTime()});
    expect(capture).toEqual({count:1,rowCount:1});expect(after.disconnected_at===null).toBe(true);expect(after.connected_at.getTime()===before.connected_at.getTime()).toBe(true);
  });
  for(const condition of ['revoked','expired'] as const)it(condition+' admission releases despite native presence',async()=>{
    const f=await seedControlledCall();present(f.admissionId);await reconcile(f.callId);
    if(condition==='revoked')await pool.query('UPDATE call_admissions SET revoked_at=clock_timestamp() WHERE id=$1',[f.admissionId]);
    else await pool.query("UPDATE call_admissions SET created_at=clock_timestamp()-interval '1 minute',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[f.admissionId]);
    const capture=await captureConnectedAtUpdate(()=>reconcile(f.callId));const m=await member(f.cmId);const r=await row(f.admissionId);
    observations.push({kind:condition,...capture,released:m.left_at!==null,revoked:r.revoked_at!==null});
    expect(capture.count).toBe(0);expect(m.left_at!==null).toBe(true);expect(r.revoked_at!==null).toBe(true);
  });
  it('absent member retains connection timestamp until exact 30 second grace release',async()=>{
    const f=await seedControlledCall();present(f.admissionId);const base=Date.now();lifecycleService.setClock(()=>base);await reconcile(f.callId);const initial=await row(f.admissionId);
    activeParticipants=[];const disconnect=base+10000;lifecycleService.setClock(()=>disconnect);await reconcile(f.callId);const first=await row(f.admissionId);
    expect(first.disconnected_at?.getTime()===disconnect).toBe(true);expect(first.connected_at.getTime()===initial.connected_at.getTime()).toBe(true);expect((await member(f.cmId)).left_at===null).toBe(true);
    lifecycleService.setClock(()=>disconnect+29999);await reconcile(f.callId);const before=await row(f.admissionId);const retained=(await member(f.cmId)).left_at===null;
    expect(retained).toBe(true);expect(before.disconnected_at.getTime()===disconnect).toBe(true);expect(before.connected_at.getTime()===initial.connected_at.getTime()).toBe(true);
    lifecycleService.setClock(()=>disconnect+30000);await reconcile(f.callId);const released=(await member(f.cmId)).left_at!==null;
    observations.push({kind:'absentGrace',retainedBeforeBoundary:retained,releasedAtBoundary:released});expect(released).toBe(true);
  });
  it('independent unconnected absent admission stays until its expiration boundary',async()=>{
    const f=await seedControlledCall();activeParticipants=[];const expiration=Date.now()+120000;
    await pool.query('UPDATE call_admissions SET expires_at=$2 WHERE id=$1',[f.admissionId,new Date(expiration)]);
    lifecycleService.setClock(()=>expiration-1);await reconcile(f.callId);const retained=(await member(f.cmId)).left_at===null;
    const r=await row(f.admissionId);expect(r.connected_at===null&&r.disconnected_at===null).toBe(true);expect(retained).toBe(true);
    lifecycleService.setClock(()=>expiration);await reconcile(f.callId);const released=(await member(f.cmId)).left_at!==null;
    observations.push({kind:'unconnected',retainedBeforeBoundary:retained,releasedAtBoundary:released});expect(released).toBe(true);
  });
});
