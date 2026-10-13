import 'reflect-metadata';
import { jest } from '@jest/globals';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import request from 'supertest';
import { raw, type Request, type Response } from 'express';
import WebSocket from 'ws';
import { SignalResponse } from '@livekit/protocol';
import { AccessToken, RoomServiceClient, TokenVerifier } from 'livekit-server-sdk';
import * as tables from '@fg/database';
import { AppModule } from '../../../../apps/api/src/app.module.js';
import { CallsService } from '../../../../apps/api/src/modules/calls/calls.service.js';
import { createSignedSessionCookie } from '../../../../apps/api/test/test-cookie-helper.js';

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
const initialClientQuery=pg.Client.prototype.query;
const authSecret = 't30-cascade-cookie-key-at-least-32-characters';
let origin = 'http://localhost:5173';

type Fixture = {
  server: string;
  ws: string;
  turnPort?: number;
  close: () => Promise<{ containersRemoved: boolean; networkRemoved: boolean }>;
  diagnostics?: () => string;
};

type Lifecycle = {
  setClock: (fn?: () => number) => void;
  sweep: () => Promise<void>;
};

jest.setTimeout(90000);

describe('T30 cascade empty call closure and lifecycle invariants', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let base: string;
  let fixture: Fixture;
  let sfu: RoomServiceClient;
  let game: { id: string; title: string };
  let schemaCreated = false;
  let dropWebhooks = false;

  const owned = `t30_cascade_call_${randomUUID().replaceAll('-', '')}`;
  const saved = { ...process.env };
  const cookies: Record<string, string> = {};
  const sockets: WebSocket[] = [];

  const lifecycle = () => app.get<Lifecycle>('FG_CALL_LIFECYCLE');

  beforeAll(async () => {
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    const db = new URL(env.DATABASE_URL!);
    db.searchParams.set('options', `-c search_path=${owned}`);

    pool = new pg.Pool({
      connectionString: db.href,
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
    game = (await pool.query("SELECT id, title FROM games WHERE title = 'Valorant'")).rows[0];

    for (const id of ['owner', 'viewer', 'participant2']) {
      await pool.query(
        'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1, $1, $2, true, now(), now())',
        [id, `${id}@fixture.invalid`]
      );
      await pool.query('INSERT INTO profiles(user_id, display_name) VALUES($1, $1)', [id]);
      await pool.query('INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $1, $2)', [id, game.id]);
      cookies[id] = await createSignedSessionCookie(authSecret, `tok-${id}`);
    }

    Object.assign(process.env, env, {
      DATABASE_URL: db.href,
      PUBLIC_ORIGIN: origin,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: authSecret,
      LIVEKIT_SERVER_URL: 'http://127.0.0.1:1',
      LIVEKIT_ADMISSION_URL: 'ws://127.0.0.1:1',
    });

    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false, rawBody: true });
    app.use('/api/media/webhook', raw({ type: () => true, limit: '64kb' }));

    // Network fault fixture drops selected SFU webhooks without forging responses.
    app.use((req: { url: string }, res: { status: (code: number) => { end: () => void } }, next: () => void) => {
      if (dropWebhooks && req.url === '/api/media/webhook') {
        res.status(204).end();
      } else {
        next();
      }
    });

    await app.listen(0, '0.0.0.0');
    base = await app.getUrl();
    base = base.replace('0.0.0.0', '127.0.0.1');
    origin = base;
    Object.assign(process.env, { PUBLIC_ORIGIN: origin, BETTER_AUTH_URL: origin });

    const helper = (await import(
      pathToFileURL(path.join(root, 'quality/evidence/T30/private-gateway-fixture.mjs')).href
    )) as {
      startGatewayFixture: (input: {
        databaseURL: string;
        key: string;
        secret: string;
        origin: string;
        webhookUrl: string;
        turnTcp: boolean;
      }) => Promise<Fixture>;
    };

    const webhook = new URL('/api/media/webhook', base);
    webhook.hostname = 'host.docker.internal';

    fixture = await helper.startGatewayFixture({
      databaseURL: db.href,
      key: env.LIVEKIT_API_KEY!,
      secret: env.LIVEKIT_API_SECRET!,
      origin,
      webhookUrl: webhook.href,
      turnTcp: true,
    });

    Object.assign(process.env, {
      LIVEKIT_SERVER_URL: fixture.server,
      LIVEKIT_ADMISSION_URL: fixture.ws,
    });
    sfu = new RoomServiceClient(fixture.server, env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!);
  });

  afterAll(async () => {
    const errors:string[]=[],cleanup={recordedAt:new Date().toISOString(),socketsTerminated:false,appClosed:false,containersRemoved:false,networkRemoved:false,schemaRemoved:false,poolEnded:false,environmentRestored:false,queryDelegateRestored:false,errorCount:0};
    const attempt=async(label:string,run:()=>Promise<void>)=>{try{await run();}catch{errors.push(label);}};
    await attempt('sockets',async()=>{for(const s of sockets)s.terminate();cleanup.socketsTerminated=true;});
    await attempt('app',async()=>{await app?.close();cleanup.appClosed=Boolean(app);});
    await attempt('native',async()=>{if(fixture){const c=await fixture.close();cleanup.containersRemoved=c.containersRemoved;cleanup.networkRemoved=c.networkRemoved;expect(c.containersRemoved).toBe(true);expect(c.networkRemoved).toBe(true);}});
    await attempt('schema',async()=>{if(schemaCreated){expect(owned).toMatch(/^t30_cascade_call_[a-f0-9]{32}$/);await pool.query('DROP SCHEMA "'+owned+'" CASCADE');cleanup.schemaRemoved=(await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[owned])).rowCount===0;expect(cleanup.schemaRemoved).toBe(true);}});
    await attempt('pool',async()=>{await pool?.end();cleanup.poolEnded=Boolean(pool);});
    process.env=saved;cleanup.environmentRestored=process.env===saved;cleanup.queryDelegateRestored=pg.Client.prototype.query===initialClientQuery;if(!cleanup.queryDelegateRestored)errors.push('query delegate');cleanup.errorCount=errors.length;
    fs.writeFileSync(path.join(root,'quality/evidence/T30/cascade-empty-call-cleanup-'+owned.slice('t30_cascade_call_'.length)+'.json'),JSON.stringify(cleanup,null,2)+'\n',{flag:'wx'});
    if(errors.length)throw Error('Owned cascade fixture cleanup failed: '+errors.join(','));
  });

  beforeEach(async () => {
    dropWebhooks = false;
    try {
      lifecycle().setClock();
    } catch {}
    for (const socket of sockets.splice(0)) {
      try {
        socket.terminate();
      } catch {}
    }
    for (const room of await sfu.listRooms()) {
      try {
        await sfu.deleteRoom(room.name);
      } catch (error) {
        if ((await sfu.listRooms([room.name])).length) throw error;
      }
    }
    await pool.query('DELETE FROM rooms; DELETE FROM webhook_events; DELETE FROM session;');
    await pool.query("DELETE FROM conversations WHERE kind = 'ROOM';");
    for (const id of ['owner', 'viewer', 'participant2']) {
      await pool.query(
        "INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at) VALUES($1, $2, $3, now() + interval '1 day', now(), now())",
        [`sess-${id}`, id, `tok-${id}`]
      );
    }
  });

  const post = (route: string, user = 'owner') =>
    request(base)
      .post('/api/v1/' + route)
      .set('Cookie', cookies[user])
      .set('Origin', origin)
      .send({});

  async function roomCall() {
    const room = await request(base)
      .post('/api/v1/rooms')
      .set('Cookie', cookies.owner)
      .set('Origin', origin)
      .send({
        name: 'T30 cascade test room',
        gameId: game.id,
        gameTitle: game.title,
        visibility: 'PRIVATE',
        playerCapacity: 2,
      });
    expect(room.status).toBe(200);

    await pool.query(
      "INSERT INTO room_members(id, room_id, user_id, role) VALUES($1, $2, 'viewer', 'MEMBER')",
      [randomUUID(), room.body.id]
    );
    await pool.query(
      "INSERT INTO conversation_members(id, conversation_id, user_id) VALUES($1, $2, 'viewer')",
      [randomUUID(), room.body.conversationId]
    );

    const call = await post(`rooms/${room.body.id}/calls`);
    expect(call.status).toBe(201);
    return { room: room.body, call: call.body as { id: string; roomId: string; state: string } };
  }

  async function join(callId: string, user = 'viewer') {
    const joined = await post(`calls/${callId}/join`, user);
    expect(joined.status).toBe(201);
    return joined.body as {
      callId: string;
      roomName: string;
      token: string;
      sfuUrl: string;
    };
  }

  async function signal(token: string): Promise<{ accepted: boolean; ws: WebSocket; status?: number }> {
    return new Promise((resolve, reject) => {
      const url = new URL('/rtc', fixture.ws);
      url.searchParams.set('access_token', token);
      url.searchParams.set('protocol', '16');
      url.searchParams.set('sdk', 'js');
      url.searchParams.set('version', '2.22.3');

      const ws = new WebSocket(url, { headers: { Origin: origin } });
      sockets.push(ws);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(Error('Native join timed out'));
      }, 10000);

      const finish = (accepted: boolean, status?: number) => {
        clearTimeout(timer);
        resolve({ accepted, status, ws });
      };

      ws.once('unexpected-response', (_r, res) => {
        finish(false, res.statusCode);
        res.resume();
      });
      ws.once('error', () => finish(false));
      ws.on('message', (bytes) => {
        try {
          const msg = SignalResponse.fromBinary(new Uint8Array(bytes as Buffer));
          if (msg.message.case === 'join') finish(true);
          if (msg.message.case === 'leave') finish(false);
        } catch {}
      });
    });
  }

  async function eventually(run: () => Promise<boolean>, timeout = 10000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await run()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error('Expected actual lifecycle state was not reached');
  }

  async function state(id: string): Promise<string | undefined> {
    return (await pool.query('SELECT state FROM call_groups WHERE id = $1', [id])).rows[0]?.state;
  }

  /**
   * TEST 1 (The Core RED Bug Condition):
   * When the last room member is cascade-deleted, the foreign key constraints CASCADE
   * and delete the row from call_members entirely.
   * If the participant is already gone from native SFU (or disconnected), CallsService.reconcile()
   * finds 0 participants in SFU, and thus does NOT invoke this.afterLeave() / closeIfEmpty().
   * Subsequently, CallLifecycleService.sweep() calls reconcileGroup(id).
   * Inside reconcileGroup:
   *   nativeExists === true (SFU room fg-call_<id> still exists on LiveKit SFU)
   *   (SELECT id FROM call_members WHERE call_group_id=$1).rowCount === 0 (cascaded away!)
   * Line 99 evaluates:
   *   if (!nativeExists || (await db.query('SELECT id FROM call_members WHERE call_group_id=$1 LIMIT 1', [id])).rowCount)
   * Because nativeExists is true AND rowCount is 0, this evaluates to FALSE!
   * reconcileGroup treats the call as a "fresh newly created group" and NEVER calls closeLocked()!
   * The call group remains 'OPEN' forever, failing this assertion (Expected: "CLOSED", Received: "OPEN").
   */
  it('cascade removal of last room member closes call group and deletes native SFU room when participant was already absent from SFU', async () => {
    const { room, call } = await roomCall();
    const joined = await join(call.id, 'viewer');
    const sig = await signal(joined.token);
    expect(sig.accepted).toBe(true);
    dropWebhooks = true;

    // Disconnect the native WebSocket and ensure participant is gone from SFU
    sig.ws.terminate();
    const identity=(await new TokenVerifier(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!).verify(joined.token)).sub!;
    try { await sfu.removeParticipant(joined.roomName,identity); } catch(error) { if((await sfu.listParticipants(joined.roomName)).some(p=>p.identity===identity))throw error; }
    await eventually(async () => (await sfu.listParticipants(joined.roomName)).length === 0);

    // Foreign key cascade: deleting from room_members deletes from call_members
    await pool.query("DELETE FROM room_members WHERE room_id = $1 AND user_id = 'viewer'", [room.id]);
    expect((await pool.query('SELECT id FROM call_members WHERE call_group_id = $1', [call.id])).rowCount).toBe(0);

    // Native room still exists on SFU
    expect((await sfu.listRooms([joined.roomName])).length).toBe(1);

    // Reconcile and sweep
    await app.get(CallsService).reconcile();
    await lifecycle().sweep();

    const observedRooms=await sfu.listRooms([joined.roomName]);
    const observed={recordedAt:new Date().toISOString(),callState:await state(call.id),memberRows:(await pool.query('SELECT id FROM call_members WHERE call_group_id=$1',[call.id])).rowCount,nativeRooms:observedRooms.length,nativeParticipants:observedRooms.length?(await sfu.listParticipants(joined.roomName)).length:null};
    fs.writeFileSync(path.join(root,'quality/evidence/T30/cascade-empty-call-state-'+owned.slice('t30_cascade_call_'.length)+'.json'),JSON.stringify(observed,null,2)+'\n',{flag:'wx'});
    // The call MUST transition to CLOSED and the SFU room must be deleted
    expect(await state(call.id)).toBe('CLOSED');
    expect((await sfu.listRooms([joined.roomName])).length).toBe(0);
    // Persistent room remains intact
    expect((await pool.query('SELECT id FROM rooms WHERE id = $1', [room.id])).rowCount).toBe(1);
    // Token reconnect is rejected
    expect((await signal(joined.token)).accepted).toBe(false);
  });

  /**
   * TEST 2 (Exact Frozen Regression Spec Reproduction):
   * Mirrors publishing-gateway.integration.spec.ts line 189–196 directly.
   * In codex-t30-frozen-publishing-regressions-3.json, this exact test failed:
   *   expect(received).toBe(expected)
   *   Expected: "CLOSED"
   *   Received: "OPEN"
   *   at line 194
   */
  it('last native participant removed after membership cascade closes the empty group and keeps its room (exact regression reproduction)', async () => {
    const { room, call } = await roomCall();
    const joined = await join(call.id);
    expect((await signal(joined.token)).accepted).toBe(true);
    dropWebhooks = true;
    await pool.query("DELETE FROM room_members WHERE room_id = $1 AND user_id = 'viewer'", [room.id]);
    expect((await pool.query('SELECT id FROM call_members WHERE call_group_id = $1', [call.id])).rowCount).toBe(0);
    await app.get(CallsService).reconcile();
    await lifecycle().sweep();
    expect(await state(call.id)).toBe('CLOSED');
    expect((await sfu.listRooms([joined.roomName])).length).toBe(0);
    expect((await pool.query('SELECT id FROM rooms WHERE id = $1', [room.id])).rowCount).toBe(1);
    expect((await signal(joined.token)).accepted).toBe(false);
  });

  /**
   * TEST 3 (Positive Control: Truly Fresh Call Group):
   * A call group newly created that has never had any join attempts has 0 call_members rows.
   * Its native room exists on SFU.
   * reconcileGroup must NOT close it on its first or subsequent sweeps; it must remain OPEN
   * and joinable for the first admission.
   */
  it('fresh empty call group without any joins remains OPEN and joinable across lifecycle sweeps', async () => {
    const { room, call } = await roomCall();
    dropWebhooks = true;

    // Verify DB state: call_members is empty (never joined)
    expect((await pool.query('SELECT id FROM call_members WHERE call_group_id = $1', [call.id])).rowCount).toBe(0);
    expect(await state(call.id)).toBe('OPEN');
    expect((await sfu.listRooms([`fg-call_${call.id}`])).length).toBe(1);

    // Running lifecycle sweep must keep it OPEN
    await lifecycle().sweep();
    expect(await state(call.id)).toBe('OPEN');
    expect((await sfu.listRooms([`fg-call_${call.id}`])).length).toBe(1);

    // The call must still be joinable by an authorized room member
    const joined = await join(call.id, 'viewer');
    expect(joined.token).toBeDefined();
    expect((await signal(joined.token)).accepted).toBe(true);
    expect(await state(call.id)).toBe('OPEN');
    expect((await pool.query('SELECT id FROM call_members WHERE call_group_id = $1 AND left_at IS NULL', [call.id])).rowCount).toBe(1);
  });

  /**
   * TEST 4 (Positive Control: Partial Member Cascade):
   * When a call has multiple active members and only one member is cascade-removed from room_members,
   * the call group has remaining active participants.
   * Running reconcile() and sweep() must keep the call group OPEN.
   */
  it('partial room member cascade does not close call group when active members remain', async () => {
    const { room, call } = await roomCall();

    // Add participant2 to room_members and conversation_members
    await pool.query(
      "INSERT INTO room_members(id, room_id, user_id, role) VALUES($1, $2, 'participant2', 'MEMBER')",
      [randomUUID(), room.id]
    );
    await pool.query(
      "INSERT INTO conversation_members(id, conversation_id, user_id) VALUES($1, $2, 'participant2')",
      [randomUUID(), room.conversationId]
    );

    const joinedViewer = await join(call.id, 'viewer');
    const joinedP2 = await join(call.id, 'participant2');
    expect((await signal(joinedViewer.token)).accepted).toBe(true);
    expect((await signal(joinedP2.token)).accepted).toBe(true);

    dropWebhooks = true;

    // Remove only viewer from room_members
    await pool.query("DELETE FROM room_members WHERE room_id = $1 AND user_id = 'viewer'", [room.id]);

    // Viewer's call_members row was cascaded, but participant2 remains active
    expect((await pool.query("SELECT id FROM call_members WHERE call_group_id = $1 AND user_id = 'viewer'", [call.id])).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM call_members WHERE call_group_id = $1 AND user_id = 'participant2' AND left_at IS NULL", [call.id])).rowCount).toBe(1);

    // Reconcile and sweep
    await app.get(CallsService).reconcile();
    await lifecycle().sweep();

    // The call must remain OPEN because participant2 is still active
    expect(await state(call.id)).toBe('OPEN');
    expect((await sfu.listRooms([joinedP2.roomName])).length).toBe(1);
  });

  /**
   * TEST 5 (Comparative Baseline: Normal Leave):
   * Normal leave updates call_members setting left_at = now().
   * The call_members row is RETAINED.
   * In this normal case, (SELECT id FROM call_members WHERE call_group_id=$1 LIMIT 1).rowCount is 1.
   * Therefore line 99 executes closeLocked() and the call is CLOSED.
   * This proves the difference between soft leave (row preserved) and hard cascade (row deleted).
   */
  it('normal leave retains call_members row with left_at timestamp and closes call cleanly', async () => {
    const { room, call } = await roomCall();
    const joined = await join(call.id, 'viewer');
    expect((await signal(joined.token)).accepted).toBe(true);

    const leaveRes = await post(`calls/${call.id}/leave`, 'viewer');
    expect(leaveRes.status).toBe(201);

    // Verify row still exists in call_members with left_at set
    const memberRow = (await pool.query('SELECT left_at FROM call_members WHERE call_group_id = $1', [call.id])).rows[0];
    expect(memberRow).toBeDefined();
    expect(memberRow.left_at).not.toBeNull();

    // Call state is CLOSED and SFU room is deleted
    expect(await state(call.id)).toBe('CLOSED');
    expect((await sfu.listRooms([joined.roomName])).length).toBe(0);

    // Idempotent sweeps do not throw or change state
    await expect(lifecycle().sweep()).resolves.toBeUndefined();
    await expect(lifecycle().sweep()).resolves.toBeUndefined();
    expect(await state(call.id)).toBe('CLOSED');
  });

  /**
   * TEST 6 (Native SFU Expiration Closes Call Group):
   * When an SFU room expires or is deleted externally, sweep() detects that nativeExists is false
   * and closes the database call group.
   */
  it('native SFU room deletion triggers closure of empty database group on sweep', async () => {
    const { call } = await roomCall();
    dropWebhooks = true;

    // Fresh group is OPEN
    await lifecycle().sweep();
    expect(await state(call.id)).toBe('OPEN');

    // SFU room deleted externally (simulating SFU emptyTimeout expiration)
    await sfu.deleteRoom(`fg-call_${call.id}`);

    // Sweep detects native room absence and closes DB group
    await lifecycle().sweep();
    expect(await state(call.id)).toBe('CLOSED');

    // Subsequent join is rejected with 409 Conflict
    expect((await post(`calls/${call.id}/join`, 'viewer')).status).toBe(409);
  });
  const marker=async(id:string)=>(await pool.query("SELECT event_id,event_type,payload FROM webhook_events WHERE event_id=$1",['fg:admission-committed:'+id])).rows;
  it('real committed admission has one separately named internal lifecycle fact and repeated join remains idempotent',async()=>{
    const {call}=await roomCall();expect(await marker(call.id)).toEqual([]);await join(call.id);await join(call.id);
    const rows=await marker(call.id);expect(rows).toHaveLength(1);expect(rows[0].event_type).toBe('FG_ADMISSION_COMMITTED');expect(JSON.parse(rows[0].payload)).toEqual({callId:call.id});
    expect((await pool.query("SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL",[call.id])).rowCount).toBe(1);
  });
  it('denied admission creates no internal fact and fresh group remains open',async()=>{
    const {call}=await roomCall();expect((await post('calls/'+call.id+'/join','participant2')).status).toBe(403);
    expect(await marker(call.id)).toEqual([]);expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1',[call.id])).rowCount).toBe(0);await lifecycle().sweep();expect(await state(call.id)).toBe('OPEN');
  });
  it('actual native administration failure rolls back admission and internal fact',async()=>{
    const {call}=await roomCall();const old=process.env.LIVEKIT_SERVER_URL;process.env.LIVEKIT_SERVER_URL='http://127.0.0.1:1';
    try{expect((await post('calls/'+call.id+'/join','viewer')).status).toBe(500);}finally{process.env.LIVEKIT_SERVER_URL=old;}
    expect(await marker(call.id)).toEqual([]);expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1',[call.id])).rowCount).toBe(0);expect(await state(call.id)).toBe('OPEN');
  });
  it('real session expiration after internal fact write rejects final authority recheck and rolls back fact and admission',async()=>{
    const {call}=await roomCall();let factWritten=false,expirationApplied=false;const original=pg.Client.prototype.query;
    pg.Client.prototype.query=(function(this:pg.Client,...args:unknown[]){
      const q=args[0],sql=typeof q==='string'?q:q&&typeof q==='object'&&'text'in q?String(q.text):'';
      const values=Array.isArray(args[1])?args[1]:q&&typeof q==='object'&&'values'in q&&Array.isArray(q.values)?q.values:[];
      if(factWritten&&!expirationApplied&&/^SELECT id FROM session WHERE id=/.test(sql)&&values.includes('sess-viewer')){
        expirationApplied=true;return Reflect.apply(original,this,["UPDATE session SET expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1",['sess-viewer']]).then(()=>Reflect.apply(original,this,args));
      }
      const result=Reflect.apply(original,this,args);
      if(/^INSERT INTO webhook_events/.test(sql)&&(sql.includes('FG_ADMISSION_COMMITTED')||values.includes('FG_ADMISSION_COMMITTED'))&&result&&typeof result.then==='function')result.then(()=>{factWritten=true;},()=>{});
      return result;
    }) as typeof pg.Client.prototype.query;
    try{expect((await post('calls/'+call.id+'/join','viewer')).status).toBe(401);expect(factWritten).toBe(true);expect(expirationApplied).toBe(true);}
    finally{pg.Client.prototype.query=original;}
    expect(await marker(call.id)).toEqual([]);expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1',[call.id])).rowCount).toBe(0);expect(await state(call.id)).toBe('OPEN');
  });

});
