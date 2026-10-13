import 'reflect-metadata';
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { HttpException } from '@nestjs/common';
import * as tables from '@fg/database';
import {
  ErrorCode,
  CallParticipantSchema,
  type CallParticipantDTO,
  IsoDateTimeSchema,
} from '@fg/contracts';
import { CallsService } from '../../../../apps/api/src/modules/calls/calls.service.js';
import type { AuthService } from '../../../../apps/api/src/modules/auth/auth.service.js';
import type { RoomsService } from '../../../../apps/api/src/modules/rooms/rooms.service.js';
import * as leaseStore from '../../../../apps/api/src/modules/calls/lease-store.js';

function findWorkspaceRoot(startDir: string): string {
  let curr = startDir;
  for (let i = 0; i < 6; i++) {
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
  return path.resolve(startDir, '../../../..');
}

const root = findWorkspaceRoot(path.dirname(fileURLToPath(import.meta.url)));
const owned = `t30_call_lease_batch_${randomUUID().replaceAll('-', '')}`;

let pool: pg.Pool;
let callsPool: pg.Pool;
let dbUrl: string;
let originalDbUrl: string | undefined;
let schemaCreated = false;
let callsService: CallsService;
let valorantGame: { id: string; title: string };

const originalClientQuery = pg.Client.prototype.query;

type LiveLeasesFunction = (
  db: pg.Pool | pg.PoolClient,
  ids: string[]
) => Promise<leaseStore.LiveLease[]>;

/**
 * Access the proposed bulk helper via namespace typing without named import compilation failure.
 * When unbatched source does not export liveLeases, this evaluates to undefined and tests fail
 * assertions intentionally (RED) rather than crashing the test harness.
 */
const liveLeasesFn = (leaseStore as { liveLeases?: LiveLeasesFunction }).liveLeases;

type CallsServiceWithPool = { pool: pg.Pool };

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function awaitWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout waiting for ${label} after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function expectHttpError(
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: ErrorCode,
  expectedMessage?: string
) {
  try {
    await action();
    throw new Error('Expected action to throw HttpException, but it succeeded');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const httpErr = error as HttpException;
    expect(httpErr.getStatus()).toBe(expectedStatus);
    const response = httpErr.getResponse() as { code?: string; message?: string };
    expect(response.code).toBe(expectedCode);
    if (expectedMessage !== undefined) {
      expect(response.message).toBe(expectedMessage);
    }
  }
}

/**
 * Lossless pg.Client query observer that counts admissions lease guard queries.
 * Forwarding all arguments, callbacks, Promises, and errors losslessly to the underlying pg client.
 * Identifies the exact shape of liveLease / liveLeases queries (FROM call_admissions a JOIN call_members).
 */
async function countLeaseQueriesDuring<T>(
  action: () => Promise<T>
): Promise<{ result: T; count: number; totalCount: number }> {
  let count = 0;
  let totalCount = 0;
  const wrappedQuery = function (this: unknown, ...args: unknown[]) {
    totalCount++;
    const raw =
      typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
    if (/\bfrom\s+["']?call_admissions["']?\s+a\s+join\s+["']?call_members["']?/i.test(raw)) {
      count++;
    }
    return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
  };

  pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;
  try {
    const result = await action();
    return { result, count, totalCount };
  } finally {
    pg.Client.prototype.query = originalClientQuery;
  }
}

interface CallerRecord {
  id: string;
  name: string;
  sessionId: string;
  callMemberId: string;
  admissionId: string;
}

interface FixtureData {
  owner: CallerRecord;
  member2: CallerRecord;
  member3: CallerRecord;
  outsider: { id: string; sessionId: string };
  banned: { id: string; sessionId: string };
  notOnboarded: { id: string; sessionId: string };
  room: { id: string; conversationId: string };
  call: { id: string };
}

async function seedFixture(): Promise<FixtureData> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');

    const now = new Date();
    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const uOwner = {
      id: `u_owner_${randomUUID()}`,
      name: 'Caller One',
      email: `c1_${randomUUID()}@fixture.invalid`,
      image: 'https://cdn.invalid/c1-user.png',
    };
    const uM2 = {
      id: `u_m2_${randomUUID()}`,
      name: 'Caller Two',
      email: `c2_${randomUUID()}@fixture.invalid`,
      image: null,
    };
    const uM3 = {
      id: `u_m3_${randomUUID()}`,
      name: 'Caller Three',
      email: `c3_${randomUUID()}@fixture.invalid`,
      image: 'https://cdn.invalid/c3-user.png',
    };
    const uOut = {
      id: `u_out_${randomUUID()}`,
      name: 'Outsider User',
      email: `out_${randomUUID()}@fixture.invalid`,
      image: null,
    };
    const uBan = {
      id: `u_ban_${randomUUID()}`,
      name: 'Banned User',
      email: `ban_${randomUUID()}@fixture.invalid`,
      image: null,
    };
    const uNoOnboard = {
      id: `u_no_onboard_${randomUUID()}`,
      name: 'Not Onboarded User',
      email: `noonboard_${randomUUID()}@fixture.invalid`,
      image: null,
    };

    const users = [uOwner, uM2, uM3, uOut, uBan, uNoOnboard];
    for (const u of users) {
      await client.query(
        'INSERT INTO "user"(id, name, email, email_verified, image, created_at, updated_at) VALUES($1, $2, $3, true, $4, $5, $5)',
        [u.id, u.name, u.email, u.image, now.toISOString()]
      );
    }

    // Profiles:
    // owner: custom avatar and PLAYING status
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [uOwner.id, 'Caller One', 'https://cdn.invalid/c1.png', 'Bio 1', 'PLAYING', now.toISOString()]
    );
    // member2: null avatar and JUST_CHATTING status
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [uM2.id, 'Caller Two', null, 'Bio 2', 'JUST_CHATTING', now.toISOString()]
    );
    // member3: custom avatar and LOOKING_FOR_TEAM status
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [uM3.id, 'Caller Three', 'https://cdn.invalid/c3.png', 'Bio 3', 'LOOKING_FOR_TEAM', now.toISOString()]
    );
    // outsider: default profile
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, NULL, NULL, $3, $4, $4)',
      [uOut.id, 'Outsider User', 'JUST_CHATTING', now.toISOString()]
    );
    // banned: default profile
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, NULL, NULL, $3, $4, $4)',
      [uBan.id, 'Banned User', 'JUST_CHATTING', now.toISOString()]
    );
    // notOnboarded: profile present, but NO game_interests row
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, NULL, NULL, $3, $4, $4)',
      [uNoOnboard.id, 'Not Onboarded User', 'JUST_CHATTING', now.toISOString()]
    );

    // Game interests for all except notOnboarded
    for (const u of [uOwner, uM2, uM3, uOut, uBan]) {
      await client.query(
        'INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $2, $3)',
        [`gi_${randomUUID()}`, u.id, valorantGame.id]
      );
    }

    // Sessions for all users
    const sessions: Record<string, string> = {};
    for (const u of users) {
      const sId = `sess_${randomUUID()}`;
      sessions[u.id] = sId;
      await client.query(
        'INSERT INTO "session"(id, token, user_id, expires_at, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $5)',
        [sId, `tok_${randomUUID()}`, u.id, futureExpiry, now.toISOString()]
      );
    }

    // Initial admin ban for banned user
    await client.query(
      'INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, $2, $3, $4, $5, $6)',
      [`adm_${randomUUID()}`, uOwner.id, uBan.id, 'BAN', 'Violation of terms', now.toISOString()]
    );

    // Room conversation
    const conversationId = `conv_${randomUUID()}`;
    await client.query(
      'INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, $2, $3, $3)',
      [conversationId, 'ROOM', now.toISOString()]
    );

    // Room
    const roomId = `room_${randomUUID()}`;
    await client.query(
      `INSERT INTO rooms(id, name, description, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, 'OWNER', 'PUBLIC', 'OWNER_APPROVAL', 10, $6, 'ROOM', $7, $7)`,
      [roomId, 'Call Test Room', 'Room description', valorantGame.id, uOwner.id, conversationId, now.toISOString()]
    );

    // Room members: owner, member2, member3, banned, notOnboarded (outsider is NOT added)
    const roomMembers: Array<{ userId: string; role: 'OWNER' | 'MEMBER'; offsetSec: number }> = [
      { userId: uOwner.id, role: 'OWNER', offsetSec: 0 },
      { userId: uM2.id, role: 'MEMBER', offsetSec: 1 },
      { userId: uM3.id, role: 'MEMBER', offsetSec: 2 },
      { userId: uBan.id, role: 'MEMBER', offsetSec: 3 },
      { userId: uNoOnboard.id, role: 'MEMBER', offsetSec: 4 },
    ];
    for (const rm of roomMembers) {
      const joinedIso = new Date(now.getTime() + rm.offsetSec * 1000).toISOString();
      await client.query(
        'INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, $3, $4, $5)',
        [`rm_${randomUUID()}`, roomId, rm.userId, rm.role, joinedIso]
      );
    }

    // Call group in room
    const callId = `call_${randomUUID()}`;
    await client.query(
      'INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, $3, $4)',
      [callId, roomId, 'OPEN', now.toISOString()]
    );

    // Call members (seat index 1, 2, 3)
    const cmOwnerId = `cm_${randomUUID()}`;
    const cmM2Id = `cm_${randomUUID()}`;
    const cmM3Id = `cm_${randomUUID()}`;

    // owner: seat 1, unmuted (is_muted = false)
    await client.query(
      'INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, $4, 1, false, $5)',
      [cmOwnerId, callId, roomId, uOwner.id, now.toISOString()]
    );
    // member2: seat 2, muted (is_muted = true)
    await client.query(
      'INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, $4, 2, true, $5)',
      [cmM2Id, callId, roomId, uM2.id, new Date(now.getTime() + 1000).toISOString()]
    );
    // member3: seat 3, muted (is_muted = true)
    await client.query(
      'INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, $4, 3, true, $5)',
      [cmM3Id, callId, roomId, uM3.id, new Date(now.getTime() + 2000).toISOString()]
    );

    // Call admissions: mediaIdentity format admission_<uuid> to strictly satisfy contracts regex
    const admOwnerId = `admission_${randomUUID()}`;
    const admM2Id = `admission_${randomUUID()}`;
    const admM3Id = `admission_${randomUUID()}`;

    const admissionExpiry = new Date(Date.now() + 60 * 1000).toISOString();

    await client.query(
      'INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, $4, $5)',
      [admOwnerId, cmOwnerId, sessions[uOwner.id], admissionExpiry, now.toISOString()]
    );
    await client.query(
      'INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, $4, $5)',
      [admM2Id, cmM2Id, sessions[uM2.id], admissionExpiry, now.toISOString()]
    );
    await client.query(
      'INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, $4, $5)',
      [admM3Id, cmM3Id, sessions[uM3.id], admissionExpiry, now.toISOString()]
    );

    // Call publish slot for owner (isPublishing = true)
    await client.query(
      'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, created_at) VALUES($1, $2, $3, 1, $4)',
      [`cps_${randomUUID()}`, callId, uOwner.id, now.toISOString()]
    );

    // Call restriction for member2 (micRestricted = true)
    await client.query(
      `INSERT INTO call_restrictions(id, call_group_id, target_user_id, restriction_type, issued_by, created_at)
       VALUES($1, $2, $3, 'MIC_MUTED', $4, $5)`,
      [`cr_${randomUUID()}`, callId, uM2.id, uOwner.id, now.toISOString()]
    );

    await client.query('COMMIT');

    return {
      owner: {
        id: uOwner.id,
        name: uOwner.name,
        sessionId: sessions[uOwner.id],
        callMemberId: cmOwnerId,
        admissionId: admOwnerId,
      },
      member2: {
        id: uM2.id,
        name: uM2.name,
        sessionId: sessions[uM2.id],
        callMemberId: cmM2Id,
        admissionId: admM2Id,
      },
      member3: {
        id: uM3.id,
        name: uM3.name,
        sessionId: sessions[uM3.id],
        callMemberId: cmM3Id,
        admissionId: admM3Id,
      },
      outsider: { id: uOut.id, sessionId: sessions[uOut.id] },
      banned: { id: uBan.id, sessionId: sessions[uBan.id] },
      notOnboarded: { id: uNoOnboard.id, sessionId: sessions[uNoOnboard.id] },
      room: { id: roomId, conversationId },
      call: { id: callId },
    };
  } catch (seedErr) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      throw new AggregateError([seedErr, rbErr], 'Seed transaction and rollback failed', {
        cause: rbErr,
      });
    }
    throw seedErr;
  } finally {
    client.release();
  }
}

jest.setTimeout(60000);

describe('T30 Call Participant Lease Batching Integration & Contract Suite', () => {
  beforeAll(async () => {
    originalDbUrl = process.env.DATABASE_URL;
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    const db = new URL(env.DATABASE_URL!);
    db.searchParams.set('options', `-c search_path=${owned}`);
    dbUrl = db.href;

    pool = new pg.Pool({
      connectionString: dbUrl,
      max: 20,
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
    const seededGames = (
      await pool.query<{ id: string; title: string }>('SELECT id, title FROM games')
    ).rows;
    const val = seededGames.find((g) => g.title === 'Valorant');
    if (!val) {
      throw new Error('Required seeded Valorant game not found');
    }
    valorantGame = val;

    process.env.DATABASE_URL = dbUrl;

    // Direct instantiation with minimal inert dependency substitutes.
    // CallsService.participants executes DB actor/session/ban/room/group guards and calls zero auth/rooms methods.
    const mockAuthService = {
      setCallHooks: () => {},
    } as unknown as AuthService;

    const mockRoomsService = {
      setCallRevoker: () => {},
    } as unknown as RoomsService;

    callsService = new CallsService(mockAuthService, mockRoomsService);
    callsPool = new pg.Pool({
      connectionString: dbUrl,
      max: 16,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });
    (callsService as unknown as CallsServiceWithPool).pool = callsPool;
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    const cleanup={schemaRemoved:false,callsPoolEnded:false,bootstrapPoolEnded:false,queryDelegateRestored:false,databaseEnvironmentRestored:false};
    try { await callsPool?.end(); cleanup.callsPoolEnded=Boolean(callsPool); } catch(error){errors.push(error);}
    try { if(schemaCreated){expect(owned).toMatch(/^t30_call_lease_batch_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA "${owned}" CASCADE`);cleanup.schemaRemoved=(await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[owned])).rowCount===0;expect(cleanup.schemaRemoved).toBe(true);} } catch(error){errors.push(error);}
    if(originalDbUrl!==undefined)process.env.DATABASE_URL=originalDbUrl;else delete process.env.DATABASE_URL;
    cleanup.databaseEnvironmentRestored=process.env.DATABASE_URL===originalDbUrl;
    pg.Client.prototype.query=originalClientQuery;cleanup.queryDelegateRestored=pg.Client.prototype.query===originalClientQuery;
    try {await pool?.end();cleanup.bootstrapPoolEnded=Boolean(pool);}catch(error){errors.push(error);}
    fs.writeFileSync(path.join(root,'quality/evidence/T30/call-participant-lease-batch-cleanup-'+owned.slice('t30_call_lease_batch_'.length)+'.json'),JSON.stringify({recordedAt:new Date().toISOString(),...cleanup,errorCount:errors.length},null,2)+'\n',{flag:'wx'});
    if(errors.length)throw new AggregateError(errors,'Owned call lease batch cleanup failed');
  });


  it('records actual prepared lease plans before and after owned-schema statistics without changing application guards',async()=>{
    const fixture=await seedFixture(),client=await pool.connect();
    const ids=[fixture.owner.admissionId,fixture.member2.admissionId,fixture.member3.admissionId];
    let statement:{name:string;text:string;values:unknown[]}|undefined;
    const delegate=client.query,descriptor=Object.getOwnPropertyDescriptor(client,'query');
    const wrapped=function(this:pg.PoolClient,...args:unknown[]){const query=args[0] as {name?:string;text?:string;values?:unknown[]};if(query?.name==='fg_live_call_admissions_v1')statement={name:query.name,text:query.text!,values:query.values!};return (delegate as unknown as (...args:unknown[])=>unknown).apply(this,args);};
    try{
      client.query=wrapped as unknown as typeof client.query;
      const leases=await leaseStore.liveLeases(client,ids);expect(leases).toHaveLength(3);
    }finally{if(descriptor)Object.defineProperty(client,'query',descriptor);else delete (client as unknown as {query?:unknown}).query;}
    const measurements:unknown[]=[];
    try{
      expect(statement).toBeDefined();for(let i=0;i<6;i++)expect((await client.query(statement!)).rows).toHaveLength(3);
      const array='ARRAY['+ids.map(id=>"'"+id.replaceAll("'","''")+"'").join(',')+']::text[]';
      const measure=async(stage:string)=>{
        const plans=[];
        for(let i=0;i<3;i++){
          const result=(await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE fg_live_call_admissions_v1('+array+')')).rows[0]['QUERY PLAN'][0];
          expect(result.Plan['Actual Rows']).toBe(3);
          const summary={stage,totalCost:result.Plan['Total Cost'],actualRows:result.Plan['Actual Rows'],planningMs:result['Planning Time'],executionMs:result['Execution Time'],jit:result.JIT?{functions:result.JIT.Functions,timing:result.JIT.Timing}:null,sharedHit:result.Plan['Shared Hit Blocks'],sharedRead:result.Plan['Shared Read Blocks']};plans.push(summary);
        }
        const counters=(await client.query("SELECT generic_plans,custom_plans FROM pg_prepared_statements WHERE name='fg_live_call_admissions_v1'")).rows[0];measurements.push({stage,counters,plans});
      };
      const initial={jit:(await client.query('SHOW jit')).rows[0].jit,jitThreshold:(await client.query('SHOW jit_above_cost')).rows[0].jit_above_cost};
      await measure('seeded-default-statistics');
      const ownedTables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename",[owned])).rows.map(r=>r.tablename);expect(ownedTables.length).toBeGreaterThan(20);
      for(const table of ownedTables){expect(owned).toMatch(/^t30_call_lease_batch_[a-f0-9]{32}$/);await client.query('ANALYZE "'+owned+'"."'+table.replaceAll('"','""')+'"');}
      await measure('owned-schema-analyzed');
      await client.query('SET jit=off');await measure('owned-client-jit-off');await client.query('RESET jit');
      fs.writeFileSync(path.join(root,'quality/evidence/T30/lease-plan-probe1-result.json'),JSON.stringify({at:new Date().toISOString(),actualPg:true,diagnosticOnly:true,initial,measurements,ownedTablesAnalyzed:ownedTables.length,originalLeaseGuardsUnchanged:true,queryDelegateRestored:client.query===delegate},null,2)+'\n',{flag:'wx'});
    }finally{await client.query('RESET jit');client.release();}
  });
});
