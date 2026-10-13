import 'reflect-metadata';
import { jest } from '@jest/globals';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import WebSocket, { WebSocketServer } from 'ws';
import { AccessToken } from 'livekit-server-sdk';
import {
  SignalRequest,
  SignalResponse,
  RequestResponse_Reason,
  TrackSource,
  TrackType,
} from '@livekit/protocol';
import * as tables from '@fg/database';
import { createSignalingGateway } from '../src/modules/calls/signaling-gateway.js';
import { liveLease } from '../src/modules/calls/lease-store.js';
import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@fg/contracts';
import { CallsService } from '../src/modules/calls/calls.service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const owned = `t30_throughput_${randomUUID().replaceAll('-', '')}`;
const origin = 'http://localhost:5173';
const apiKey = 't30-key';
const apiSecret = 't30-secret-long-enough-32-chars-test!';
let pool: pg.Pool;
let dbUrl: string;
let game: { id: string; title: string };
let created = false;
let originalDbUrl: string | undefined;
let callsService: CallsService;

type UpstreamMock = {
  url: string;
  server: HttpServer;
  wss: WebSocketServer;
  activeSockets: WebSocket[];
  receivedRequests: SignalRequest[];
  receivedRawFrames: Buffer[];
  setParticipantTracks: (tracks: Array<{ sid: string; source: TrackSource; type: TrackType }>) => void;
  sendToAll: (response: SignalResponse) => void;
  close: () => Promise<void>;
};

function startFakeSfu(options?: {
  onGetParticipant?: () => Promise<void>;
}): Promise<UpstreamMock> {
  return new Promise((resolve) => {
    const activeSockets: WebSocket[] = [];
    const participantTracks: Array<{ sid: string; source: TrackSource; type: TrackType }> = [];
    const receivedRequests: SignalRequest[] = [];
    const receivedRawFrames: Buffer[] = [];

    const sfuHttp = createServer(async (req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/twirp/livekit.RoomService/')) {
        req.resume();
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json');
          if (req.url?.includes('GetParticipant')) {
            if (options?.onGetParticipant) {
              await options.onGetParticipant();
            }
            const tracks = participantTracks.map((t) => ({
              sid: t.sid,
              source: t.source,
              type: t.type,
            }));
            res.end(JSON.stringify({ sid: 'PA_MOCK', identity: 'participant', state: 1, tracks }));
          } else if (req.url?.includes('UpdateParticipant')) {
            const tracks = participantTracks.map((t) => ({
              sid: t.sid,
              source: t.source,
              type: t.type,
            }));
            res.end(JSON.stringify({ sid: 'PA_MOCK', identity: 'participant', state: 1, tracks }));
          } else if (req.url?.includes('RemoveParticipant')) {
            res.end(JSON.stringify({}));
          } else {
            res.end(JSON.stringify({}));
          }
        });
        return;
      }
      res.statusCode = 404;
      res.end();
    });

    const sfuWss = new WebSocketServer({ noServer: true });

    sfuHttp.on('upgrade', (req, socket, head) => {
      sfuWss.handleUpgrade(req, socket, head, (ws) => {
        activeSockets.push(ws);
        sfuWss.emit('connection', ws, req);
      });
    });

    sfuWss.on('connection', (ws) => {
      // Send initial join SignalResponse required by signaling gateway handshake
      const join = new SignalResponse({
        message: {
          case: 'join',
          value: {
            room: { name: 'fg-call_mock' },
            participant: { sid: 'PA_MOCK', identity: 'participant' },
          },
        },
      });
      ws.send(Buffer.from(join.toBinary()), { binary: true });

      ws.on('message', (data, binary) => {
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        receivedRawFrames.push(bytes);
        try {
          const req = binary ? SignalRequest.fromBinary(bytes) : SignalRequest.fromJsonString(bytes.toString('utf8'));
          receivedRequests.push(req);

          // Immediate PONG when receiving PING
          if (req.message.case === 'ping') {
            const pong = new SignalResponse({
              message: {
                case: 'pong',
                value: req.message.value,
              },
            });
            ws.send(Buffer.from(pong.toBinary()), { binary: true });
          }
        } catch {
          // Non-protobuf frame
        }
      });
    });

    sfuHttp.listen(0, '127.0.0.1', () => {
      const port = (sfuHttp.address() as AddressInfo).port;
      const mock: UpstreamMock = {
        url: `http://127.0.0.1:${port}`,
        server: sfuHttp,
        wss: sfuWss,
        activeSockets,
        receivedRequests,
        receivedRawFrames,
        setParticipantTracks: (tracks) => {
          participantTracks.length = 0;
          participantTracks.push(...tracks);
        },
        sendToAll: (resp: SignalResponse) => {
          const buf = Buffer.from(resp.toBinary());
          for (const ws of activeSockets) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(buf, { binary: true });
            }
          }
        },
        close: async () => {
          for (const ws of activeSockets) {
            ws.terminate();
          }
          await new Promise<void>((r) => sfuWss.close(() => r()));
          await new Promise<void>((r) => sfuHttp.close(() => r()));
        },
      };
      resolve(mock);
    });
  });
}

function startGateway(
  upstreamUrl: string
): Promise<{
  gateway: ReturnType<typeof createSignalingGateway>;
  url: string;
  wsUrl: string;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const gateway = createSignalingGateway({
      databaseURL: dbUrl,
      upstreamURL: upstreamUrl,
      key: apiKey,
      secret: apiSecret,
      origin,
    });
    gateway.server.listen(0, '127.0.0.1', () => {
      const port = (gateway.server.address() as AddressInfo).port;
      resolve({
        gateway,
        url: `http://127.0.0.1:${port}`,
        wsUrl: `ws://127.0.0.1:${port}`,
        close: async () => {
          await gateway.close();
        },
      });
    });
  });
}

async function seedCallAdmission(poolClient: pg.Pool, userId: string, gameId: string) {
  const roomId = `room_${randomUUID()}`;
  const conversationId = `conv_${randomUUID()}`;
  const roomMemberId = `rm_${randomUUID()}`;
  const conversationMemberId = `cm_${randomUUID()}`;
  const callGroupId = randomUUID();
  const callMemberId = randomUUID();
  const admissionId = randomUUID();
  const sessionId = `sess-${userId}`;
  const sessionToken = `tok-${userId}`;

  await poolClient.query(
    'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1,$1,$2,true,now(),now()) ON CONFLICT (id) DO NOTHING',
    [userId, `${userId}@fixture.invalid`]
  );
  await poolClient.query(
    'INSERT INTO profiles(user_id, display_name) VALUES($1, $1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
  await poolClient.query(
    'INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
    [randomUUID(), userId, gameId]
  );
  await poolClient.query(
    "INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at) VALUES($1, $2, $3, now() + interval '1 day', now(), now()) ON CONFLICT (id) DO NOTHING",
    [sessionId, userId, sessionToken]
  );

  const client = await poolClient.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, 'ROOM', now(), now())",
      [conversationId]
    );
    await client.query(
      `INSERT INTO rooms(id, name, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
       VALUES($1, 'Throughput Test Room', $2, $3, 'OWNER', 'PRIVATE', 'OWNER_APPROVAL', 10, $4, 'ROOM', now(), now())`,
      [roomId, gameId, userId, conversationId]
    );
    await client.query(
      "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, $3, 'OWNER', now())",
      [roomMemberId, roomId, userId]
    );
    await client.query(
      "INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES($1, $2, $3, now())",
      [conversationMemberId, conversationId, userId]
    );
    await client.query(
      "INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, 'OPEN', now())",
      [callGroupId, roomId]
    );
    await client.query(
      "INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, $4, 1, false, now())",
      [callMemberId, callGroupId, roomId, userId]
    );
    await client.query(
      "INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, now() + interval '1 hour', now())",
      [admissionId, callMemberId, sessionId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const roomName = `fg-call_${callGroupId}`;
  return { roomId, conversationId, callGroupId, callMemberId, admissionId, roomName, userId, sessionId };
}

async function seedSecondMemberInCall(
  poolClient: pg.Pool,
  first: { roomId: string; conversationId: string; callGroupId: string },
  userId: string,
  gameId: string
) {
  const roomMemberId = `rm_${randomUUID()}`;
  const conversationMemberId = `cm_${randomUUID()}`;
  const callMemberId = randomUUID();
  const admissionId = randomUUID();
  const sessionId = `sess-${userId}`;
  const sessionToken = `tok-${userId}`;

  await poolClient.query(
    'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1,$1,$2,true,now(),now()) ON CONFLICT (id) DO NOTHING',
    [userId, `${userId}@fixture.invalid`]
  );
  await poolClient.query(
    'INSERT INTO profiles(user_id, display_name) VALUES($1, $1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
  await poolClient.query(
    'INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
    [randomUUID(), userId, gameId]
  );
  await poolClient.query(
    "INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at) VALUES($1, $2, $3, now() + interval '1 day', now(), now()) ON CONFLICT (id) DO NOTHING",
    [sessionId, userId, sessionToken]
  );

  const client = await poolClient.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, $3, 'MEMBER', now())",
      [roomMemberId, first.roomId, userId]
    );
    await client.query(
      "INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES($1, $2, $3, now())",
      [conversationMemberId, first.conversationId, userId]
    );
    await client.query(
      "INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, $4, 2, false, now())",
      [callMemberId, first.callGroupId, first.roomId, userId]
    );
    await client.query(
      "INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, now() + interval '1 hour', now())",
      [admissionId, callMemberId, sessionId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const roomName = `fg-call_${first.callGroupId}`;
  return { roomId: first.roomId, conversationId: first.conversationId, callGroupId: first.callGroupId, callMemberId, admissionId, roomName, userId, sessionId };
}

async function createClientToken(admissionId: string, roomName: string): Promise<string> {
  const at = new AccessToken(apiKey, apiSecret, { identity: admissionId, ttl: 60 });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canSubscribe: true,
    canPublish: true,
  });
  return await at.toJwt();
}

type ClientConnection = {
  ws: WebSocket;
  responses: SignalResponse[];
  rawResponses: Buffer[];
  pongs: bigint[];
  closed: boolean;
  closeCode?: number;
};

async function connectClient(gatewayWsUrl: string, token: string): Promise<ClientConnection> {
  const responses: SignalResponse[] = [];
  const rawResponses: Buffer[] = [];
  const pongs: bigint[] = [];
  const conn: ClientConnection = {
    ws: new WebSocket(`${gatewayWsUrl}/rtc?access_token=${token}`, {
      headers: { Origin: origin },
    }),
    responses,
    rawResponses,
    pongs,
    closed: false,
  };

  conn.ws.on('message', (data, binary) => {
    const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    rawResponses.push(bytes);
    try {
      const resp = binary ? SignalResponse.fromBinary(bytes) : SignalResponse.fromJsonString(bytes.toString('utf8'));
      responses.push(resp);
      if (resp.message.case === 'pong') {
        pongs.push(resp.message.value);
      }
    } catch {
      // Non-protobuf frame
    }
  });

  conn.ws.on('close', (code) => {
    conn.closed = true;
    conn.closeCode = code;
  });

  await new Promise<void>((resolve, reject) => {
    conn.ws.once('open', resolve);
    conn.ws.once('error', reject);
    conn.ws.once('unexpected-response', (_r, res) => {
      res.resume();
      reject(new Error(`Gateway rejected connection: ${res.statusCode}`));
    });
  });

  return conn;
}

async function eventually(fn: () => boolean | Promise<boolean>, timeout = 8000, interval = 50): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`eventually timed out after ${timeout}ms`);
}

jest.setTimeout(60000);

describe('T30 signaling gateway throughput and guard batching', () => {
  beforeAll(async () => {
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    const db = new URL(env.DATABASE_URL!);
    db.searchParams.set('options', `-c search_path=${owned}`);
    dbUrl = db.href;
    pool = new pg.Pool({ connectionString: dbUrl, max: 20, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
    await pool.query(`CREATE SCHEMA "${owned}"`);
    created = true;
    await migrate(drizzle(pool), {
      migrationsFolder: path.join(root, 'packages/database/migrations'),
      migrationsSchema: owned,
    });
    await tables.seedGames(drizzle(pool, { schema: tables }));
    game = (await pool.query("SELECT id, title FROM games WHERE title='Valorant'")).rows[0];

    // Seed admin user for admin_actions FK
    await pool.query(
      'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1,$1,$2,true,now(),now()) ON CONFLICT (id) DO NOTHING',
      ['admin-actor', 'admin-actor@fixture.invalid']
    );

    originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = dbUrl;
    callsService = new CallsService({ setCallHooks: () => {} } as any, { setCallRevoker: () => {} } as any);
    callsService.onModuleInit();
  });

  afterAll(async () => {
    try {
      try {
        await callsService?.onModuleDestroy();
      } catch {}
      if (created) {
        expect(owned).toMatch(/^t30_throughput_[a-f0-9]{32}$/);
        await pool.query(`DROP SCHEMA "${owned}" CASCADE`);
        expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [owned])).rowCount).toBe(0);
      }
    } finally {
      if (originalDbUrl !== undefined) {
        process.env.DATABASE_URL = originalDbUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
      await pool?.end();
    }
  });

  it('black-box bidirectional 32 PING/PONG messages complete in exact order within 8s', async () => {
    const sfu = await startFakeSfu();
    const gw = await startGateway(sfu.url);
    try {
      const user = await seedCallAdmission(pool, 'throughput-user-32', game.id);
      const token = await createClientToken(user.admissionId, user.roomName);
      const client = await connectClient(gw.wsUrl, token);

      const startTime = Date.now();

      // Send 32 PING frames across WebSocket
      for (let i = 0; i < 32; i++) {
        const ping = new SignalRequest({
          message: {
            case: 'ping',
            value: BigInt(i),
          },
        });
        client.ws.send(Buffer.from(ping.toBinary()), { binary: true });
      }

      // Assert all 32 PONG responses arrive in exact sequence within 8000ms deadline
      await eventually(() => client.pongs.length >= 32, 8000);
      const duration = Date.now() - startTime;

      expect(client.pongs).toHaveLength(32);
      for (let i = 0; i < 32; i++) {
        expect(client.pongs[i]).toBe(BigInt(i));
      }
      expect(duration).toBeLessThanOrEqual(8000);
      console.log(JSON.stringify({task:'T30',measurement:'real-PG-guarded-websocket-ping-pong',messages:32,durationMs:duration,orderVerified:true,fakeSfuAdapter:true,nativeMediaAcceptance:false}));

      client.ws.terminate();
    } finally {
      await gw.close();
      await sfu.close();
    }
  });

  it.each(['revoke', 'ban', 'expire'] as const)('mid-native-wait %s drops later queued frames in same batch and terminates connection', async (mode) => {
    let rpcBarrierPromise: Promise<void> | undefined;
    let rpcReleaseFn: (() => void) | undefined;
    let rpcHitCount = 0;

    const sfu = await startFakeSfu({
      onGetParticipant: async () => {
        rpcHitCount++;
        if (rpcBarrierPromise) {
          await rpcBarrierPromise;
        }
      },
    });

    const gw = await startGateway(sfu.url);
    let locker: pg.PoolClient | undefined;

    try {
      const user = await seedCallAdmission(pool, 'race-'+mode+'-user', game.id);

      // Grant screen quota slot so screen addTrack triggers getParticipant
      await pool.query(
        'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, is_call_active, created_at) VALUES($1, $2, $3, 1, true, now())',
        [randomUUID(), user.callGroupId, user.userId]
      );

      const token = await createClientToken(user.admissionId, user.roomName);
      const client = await connectClient(gw.wsUrl, token);

      // 1. External PG connection locks the room
      locker = await pool.connect();
      await locker.query('BEGIN');
      const lockerPid = (await locker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await locker.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [user.roomId]);

      // 2. Client sends warmupPING
      const warmupPing = new SignalRequest({
        message: {
          case: 'ping',
          value: 100n,
        },
      });
      client.ws.send(Buffer.from(warmupPing.toBinary()), { binary: true });

      // 3. Wait until gateway is blocked by lockerPid using pg_blocking_pids
      await eventually(async () => {
        const blocked = await pool.query(
          'SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
          [lockerPid]
        );
        return (blocked.rowCount ?? 0) > 0;
      });

      // 4. While gateway is blocked waiting on room lock, enqueue screen addTrack and protected laterPING
      const screenTrack = new SignalRequest({
        message: {
          case: 'addTrack',
          value: {
            cid: 'cid-screen-race',
            name: 'Screen Race Track',
            type: TrackType.VIDEO,
            source: TrackSource.SCREEN_SHARE,
          },
        },
      });
      const laterPing = new SignalRequest({
        message: {
          case: 'ping',
          value: 999n,
        },
      });

      // Set up fake native RPC barrier before unblocking
      rpcBarrierPromise = new Promise<void>((resolve) => {
        rpcReleaseFn = resolve;
      });

      client.ws.send(Buffer.from(screenTrack.toBinary()), { binary: true });
      client.ws.send(Buffer.from(laterPing.toBinary()), { binary: true });

      // 5. Commit locker so gateway acquires the room lock and starts batch
      await locker.query('COMMIT');
      locker.release();
      locker = undefined;

      // 6. Wait until gateway reaches fake SFU's GetParticipant (stalled at barrier)
      await eventually(() => rpcHitCount > 0);

      // 7. Commit exactly one independent authority change during native wait.
      if(mode==='ban')await pool.query("INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, 'admin-actor', $2, 'BAN', 'Mid-batch race ban', clock_timestamp())",[randomUUID(),user.userId]);
      else if(mode==='expire')await pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[user.sessionId]);
      else await pool.query('UPDATE call_admissions SET revoked_at=clock_timestamp() WHERE id=$1',[user.admissionId]);

      // 8. Release fake RPC barrier before 3s canonical timeout
      rpcReleaseFn?.();

      // 9. Gateway finishes screen addTrack, then evaluates next frame in batch (laterPing 999).
      // Fresh liveLease under transaction detects revocation/ban, throws 403, and invalidates binding!
      // Assert: WebSockets close and laterPing 999 is NEVER forwarded to upstream SFU!
      await eventually(() => client.closed);
      expect(client.closed).toBe(true);

      await eventually(() => sfu.activeSockets.every((s) => s.readyState === WebSocket.CLOSED));

      // Warmup ping 100 reached SFU, but laterPing 999 was dropped
      const receivedPings = sfu.receivedRequests
        .filter((r): r is SignalRequest & { message: { case: 'ping'; value: bigint } } => r.message.case === 'ping')
        .map((r) => r.message.value);
      expect(receivedPings).toContain(100n);
      expect(receivedPings).not.toContain(999n);
    } finally {
      rpcReleaseFn?.();
      if (locker) {
        await locker.query('ROLLBACK').catch(() => {});
        locker.release();
      }
      await gw.close();
      await sfu.close();
    }
  });

  it('enforces screen share quota denial returning NOT_ALLOWED without forwarding to upstream SFU', async () => {
    const sfu = await startFakeSfu();
    const gw = await startGateway(sfu.url);
    try {
      const user = await seedCallAdmission(pool, 'quota-denied-user', game.id);
      const token = await createClientToken(user.admissionId, user.roomName);
      const client = await connectClient(gw.wsUrl, token);

      // User has no quota slot in call_publish_slots; request screen share video
      const screenReq = new SignalRequest({
        message: {
          case: 'addTrack',
          value: {
            cid: 'cid-screen-denied',
            name: 'Screen Share',
            type: TrackType.VIDEO,
            source: TrackSource.SCREEN_SHARE,
          },
        },
      });

      client.ws.send(Buffer.from(screenReq.toBinary()), { binary: true });

      // Gateway must intercept and return requestResponse NOT_ALLOWED directly to client
      await eventually(() => client.responses.some((r) => r.message.case === 'requestResponse'));
      const denyResponse = client.responses.find((r) => r.message.case === 'requestResponse');
      expect(denyResponse).toBeDefined();
      if (denyResponse && denyResponse.message.case === 'requestResponse') {
        expect(denyResponse.message.value.reason).toBe(RequestResponse_Reason.NOT_ALLOWED);
        expect(denyResponse.message.value.message).toBe('Current publication source denied');
      }

      // Upstream SFU must NEVER have received this denied screen share track
      expect(sfu.receivedRequests.some((r) => r.message.case === 'addTrack')).toBe(false);

      client.ws.terminate();
    } finally {
      await gw.close();
      await sfu.close();
    }
  });

  it('permits screen share when quota slot is claimed and tracks pending CID', async () => {
    const sfu = await startFakeSfu();
    const gw = await startGateway(sfu.url);
    try {
      const user = await seedCallAdmission(pool, 'quota-granted-user', game.id);

      // Grant screen share quota slot in database
      const slotId = randomUUID();
      await pool.query(
        'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, is_call_active, created_at) VALUES($1, $2, $3, 1, true, now())',
        [slotId, user.callGroupId, user.userId]
      );

      const token = await createClientToken(user.admissionId, user.roomName);
      const client = await connectClient(gw.wsUrl, token);

      const screenReq = new SignalRequest({
        message: {
          case: 'addTrack',
          value: {
            cid: 'cid-screen-ok',
            name: 'Screen Share OK',
            type: TrackType.VIDEO,
            source: TrackSource.SCREEN_SHARE,
          },
        },
      });

      client.ws.send(Buffer.from(screenReq.toBinary()), { binary: true });

      // Gateway verifies quota, registers pending CID, and forwards addTrack to upstream SFU
      await eventually(() => sfu.receivedRequests.some((r) => r.message.case === 'addTrack'));
      const forwarded = sfu.receivedRequests.find((r) => r.message.case === 'addTrack');
      expect(forwarded).toBeDefined();
      if (forwarded && forwarded.message.case === 'addTrack') {
        expect(forwarded.message.value.cid).toBe('cid-screen-ok');
        expect(forwarded.message.value.source).toBe(TrackSource.SCREEN_SHARE);
      }

      client.ws.terminate();
    } finally {
      await gw.close();
      await sfu.close();
    }
  });

  it('denies duplicate screen track with different CID as LIMIT_EXCEEDED (max 1 native track per screen quota)', async () => {
    const sfu = await startFakeSfu();
    const gw = await startGateway(sfu.url);
    try {
      const user = await seedCallAdmission(pool, 'duplicate-screen-user', game.id);

      // Grant screen share quota slot
      const slotId = randomUUID();
      await pool.query(
        'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, is_call_active, created_at) VALUES($1, $2, $3, 1, true, now())',
        [slotId, user.callGroupId, user.userId]
      );

      const token = await createClientToken(user.admissionId, user.roomName);
      const client = await connectClient(gw.wsUrl, token);

      // First track published
      const track1 = new SignalRequest({
        message: {
          case: 'addTrack',
          value: {
            cid: 'cid-screen-primary',
            name: 'Primary Screen',
            type: TrackType.VIDEO,
            source: TrackSource.SCREEN_SHARE,
          },
        },
      });
      client.ws.send(Buffer.from(track1.toBinary()), { binary: true });
      await eventually(() =>
        sfu.receivedRequests.some((r) => r.message.case === 'addTrack' && r.message.value.cid === 'cid-screen-primary')
      );

      // SFU confirms track published with SID 'TR_SCREEN_1'
      const pubResp = new SignalResponse({
        message: {
          case: 'trackPublished',
          value: {
            cid: 'cid-screen-primary',
            track: {
              sid: 'TR_SCREEN_1',
              source: TrackSource.SCREEN_SHARE,
              type: TrackType.VIDEO,
            },
          },
        },
      });
      sfu.sendToAll(pubResp);

      // Update SFU participant info to reflect published track
      sfu.setParticipantTracks([{ sid: 'TR_SCREEN_1', source: TrackSource.SCREEN_SHARE, type: TrackType.VIDEO }]);

      // Client attempts to publish a SECOND screen track with a different CID
      const track2 = new SignalRequest({
        message: {
          case: 'addTrack',
          value: {
            cid: 'cid-screen-duplicate',
            name: 'Duplicate Screen',
            type: TrackType.VIDEO,
            source: TrackSource.SCREEN_SHARE,
          },
        },
      });
      client.ws.send(Buffer.from(track2.toBinary()), { binary: true });

      // Gateway must deny second screen track with LIMIT_EXCEEDED
      await eventually(() =>
        client.responses.some(
          (r) =>
            r.message.case === 'requestResponse' &&
            r.message.value.reason === RequestResponse_Reason.LIMIT_EXCEEDED &&
            r.message.value.message === 'One native track per screen quota/source'
        )
      );

      // Upstream SFU must NOT have received the duplicate track
      expect(
        sfu.receivedRequests.some(
          (r) => r.message.case === 'addTrack' && r.message.value.cid === 'cid-screen-duplicate'
        )
      ).toBe(false);

      // Secondary codec on SAME verified native track (matching SID) is permitted
      const secondaryCodecTrack = new SignalRequest({
        message: {
          case: 'addTrack',
          value: {
            cid: 'cid-screen-secondary-codec',
            sid: 'TR_SCREEN_1',
            name: 'Secondary Codec',
            type: TrackType.VIDEO,
            source: TrackSource.SCREEN_SHARE,
          },
        },
      });
      client.ws.send(Buffer.from(secondaryCodecTrack.toBinary()), { binary: true });

      await eventually(() =>
        sfu.receivedRequests.some(
          (r) => r.message.case === 'addTrack' && r.message.value.cid === 'cid-screen-secondary-codec'
        )
      );
      const secReq = sfu.receivedRequests.find(
        (r) => r.message.case === 'addTrack' && r.message.value.cid === 'cid-screen-secondary-codec'
      );
      expect(secReq).toBeDefined();
      if (secReq && secReq.message.case === 'addTrack') {
        expect(secReq.message.value.sid).toBe('TR_SCREEN_1');
      }

      client.ws.terminate();
    } finally {
      await gw.close();
      await sfu.close();
    }
  });

  it('overflowing bounded queue (>= 256 queued frames or > 1 MiB) immediately closes binding without leaking memory', async () => {
    const sfu = await startFakeSfu();
    const gw = await startGateway(sfu.url);
    try {
      const user = await seedCallAdmission(pool, 'overflow-user-test', game.id);
      const token = await createClientToken(user.admissionId, user.roomName);
      const client = await connectClient(gw.wsUrl, token);

      // Send 260 frames in a tight synchronous burst exceeding the 256-frame capacity limit
      for (let i = 0; i < 260; i++) {
        const req = new SignalRequest({
          message: {
            case: 'ping',
            value: BigInt(i),
          },
        });
        client.ws.send(Buffer.from(req.toBinary()), { binary: true });
      }

      // Gateway detects queue capacity exceeded and closes binding immediately
      await eventually(() => client.closed);
      expect(client.closed).toBe(true);

      // Sockets cleaned up
      await eventually(() => sfu.activeSockets.every((s) => s.readyState === WebSocket.CLOSED));
    } finally {
      await gw.close();
      await sfu.close();
    }
  });

  it('malformed non-protobuf frame triggers 400 error and terminates connection cleanly', async () => {
    const sfu = await startFakeSfu();
    const gw = await startGateway(sfu.url);
    try {
      const user = await seedCallAdmission(pool, 'malformed-frame-user', game.id);
      const token = await createClientToken(user.admissionId, user.roomName);
      const client = await connectClient(gw.wsUrl, token);

      // Send invalid garbage bytes that cannot be deserialized as SignalRequest
      const garbage = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02, 0x03]);
      client.ws.send(garbage, { binary: true });

      // Gateway fails deserialization, catches error, and terminates connection
      await eventually(() => client.closed);
      expect(client.closed).toBe(true);

      // Upstream socket closed
      await eventually(() => sfu.activeSockets.every((s) => s.readyState === WebSocket.CLOSED));
    } finally {
      await gw.close();
      await sfu.close();
    }
  });

  it.each(['revoke', 'ban', 'expire'] as const)(
    'named prepared liveLease on warm connection distinguishes admissions and reflects %s immediately',
    async (mode) => {
      const userA = await seedCallAdmission(pool, `prep-${mode}-user-a`, game.id);
      const userB = await seedCallAdmission(pool, `prep-${mode}-user-b`, game.id);

      const client = await pool.connect();
      try {
        // Warm up prepared statement with 25 consecutive executions on SAME PoolClient
        for (let i = 0; i < 25; i++) {
          const leaseA = await liveLease(client, userA.admissionId);
          expect(leaseA).toBeDefined();
          expect(leaseA?.id).toBe(userA.admissionId);
          expect(leaseA?.user_id).toBe(userA.userId);

          const leaseB = await liveLease(client, userB.admissionId);
          expect(leaseB).toBeDefined();
          expect(leaseB?.id).toBe(userB.admissionId);
          expect(leaseB?.user_id).toBe(userB.userId);
        }

        // Independent commit of revocation, ban, or expiry using external pool query
        if (mode === 'ban') {
          await pool.query(
            "INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, 'admin-actor', $2, 'BAN', 'Prepared statement ban test', clock_timestamp())",
            [randomUUID(), userA.userId]
          );
        } else if (mode === 'expire') {
          await pool.query(
            "UPDATE session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
            [userA.sessionId]
          );
        } else {
          await pool.query(
            'UPDATE call_admissions SET revoked_at=clock_timestamp() WHERE id=$1',
            [userA.admissionId]
          );
        }

        // Next read on warm client: userA must be immediately undefined while userB remains valid
        const nextReadA = await liveLease(client, userA.admissionId);
        expect(nextReadA).toBeUndefined();

        const nextReadB = await liveLease(client, userB.admissionId);
        expect(nextReadB).toBeDefined();
        expect(nextReadB?.id).toBe(userB.admissionId);
        expect(nextReadB?.user_id).toBe(userB.userId);

        // Query pg_prepared_statements to record only numeric metrics (no raw SQL/params/IDs/tokens logged)
        const prepStats = await client.query<{
          generic_plans: number | string;
          custom_plans: number | string;
        }>(
          "SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = 'fg_live_call_admission_v1'"
        );
        const cacheCount = prepStats.rowCount ?? 0;
        const genericPlans = Number(prepStats.rows[0]?.generic_plans ?? 0);
        const customPlans = Number(prepStats.rows[0]?.custom_plans ?? 0);

        console.log(
          JSON.stringify({
            task: 'T30',
            preparedQuery: 'fg_live_call_admission_v1',
            mode,
            cacheCount,
            genericPlans,
            customPlans,
          })
        );
      } finally {
        client.release();
      }
    }
  );

  it.each(['rooms', 'call_groups'] as const)(
    'concurrent runtime read locks (FOR SHARE) allow other admissions in same call to progress while blocking %s writer',
    async (targetTable) => {
      let client1: ClientConnection | undefined;
      let client2: ClientConnection | undefined;
      let writerClient: pg.PoolClient | undefined;
      let writerPromise: Promise<void> | undefined;
      let rpcBarrierPromise: Promise<void> | undefined;
      let rpcReleaseFn: (() => void) | undefined;
      let barrierReleased = false;
      let rpcHitCount = 0;

      const sfu = await startFakeSfu({
        onGetParticipant: async () => {
          rpcHitCount++;
          if (rpcBarrierPromise) {
            await rpcBarrierPromise;
          }
        },
      });
      const gw = await startGateway(sfu.url);

      try {
        // 1. Seed two distinct admissions in the SAME call group & room using distinct synthetic IDs per variant
        const user1 = await seedCallAdmission(pool, `shared-${targetTable}-user-1`, game.id);
        const user2 = await seedSecondMemberInCall(pool, user1, `shared-${targetTable}-user-2`, game.id);

        // Grant screen share quota slot for user1 so screen addTrack triggers native GetParticipant
        await pool.query(
          'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, is_call_active, created_at) VALUES($1, $2, $3, 1, true, now())',
          [randomUUID(), user1.callGroupId, user1.userId]
        );

        // 2. Both clients already joined BEFORE opening barrier
        const token1 = await createClientToken(user1.admissionId, user1.roomName);
        const token2 = await createClientToken(user2.admissionId, user2.roomName);
        client1 = await connectClient(gw.wsUrl, token1);
        client2 = await connectClient(gw.wsUrl, token2);

        expect(client1.closed).toBe(false);
        expect(client2.closed).toBe(false);

        // 3. Setup explicit native RPC barrier
        rpcBarrierPromise = new Promise<void>((resolve) => {
          rpcReleaseFn = () => {
            barrierReleased = true;
            resolve();
          };
        });

        // 4. Client 1 sends screen addTrack -> triggers lockedLease(FOR SHARE) and halts at GetParticipant barrier
        const screenTrack = new SignalRequest({
          message: {
            case: 'addTrack',
            value: {
              cid: `cid-screen-shared-${targetTable}`,
              name: 'Screen Shared Track',
              type: TrackType.VIDEO,
              source: TrackSource.SCREEN_SHARE,
            },
          },
        });
        client1.ws.send(Buffer.from(screenTrack.toBinary()), { binary: true });

        // Wait until Client 1 reaches GetParticipant barrier (holding FOR SHARE)
        await eventually(() => rpcHitCount > 0, 2000);
        expect(barrierReleased).toBe(false);
        expect(client1.closed).toBe(false);

        // 5. While Client 1 holds FOR SHARE and barrier is unreleased, Client 2 sends PING in same call
        const pingVal = targetTable === 'rooms' ? 888n : 999n;
        const ping = new SignalRequest({
          message: {
            case: 'ping',
            value: pingVal,
          },
        });
        client2.ws.send(Buffer.from(ping.toBinary()), { binary: true });

        // Require PONG within 1500ms while barrier is unreleased and client 1 is still open
        let pongReceivedBeforeRelease = false;
        const pongStart = Date.now();
        await eventually(() => {
          if (client2!.pongs.includes(pingVal)) {
            pongReceivedBeforeRelease = !barrierReleased && !client1!.closed;
            return true;
          }
          return false;
        }, 1500);

        const pongElapsed = Date.now() - pongStart;
        expect(pongElapsed).toBeLessThanOrEqual(1500);
        expect(pongReceivedBeforeRelease).toBe(true);
        expect(barrierReleased).toBe(false);
        expect(client1.closed).toBe(false);

        // 6. Concurrently, external writer attempts canonical FOR UPDATE lock
        writerClient = await pool.connect();
        const writerPid = (await writerClient.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        let writerFinished = false;

        writerPromise = (async () => {
          await writerClient!.query('BEGIN');
          if (targetTable === 'call_groups') {
            // For group probe: lock room FOR SHARE, then call_group FOR UPDATE so probe targets the group
            await writerClient!.query('SELECT id FROM rooms WHERE id=$1 FOR SHARE', [user1.roomId]);
            await writerClient!.query('SELECT id FROM call_groups WHERE id=$1 FOR UPDATE', [user1.callGroupId]);
          } else {
            await writerClient!.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [user1.roomId]);
          }
          writerFinished = true;
          await writerClient!.query('COMMIT');
        })();
        // Handle immediately; original promise still rejects at its asserted await.
        void writerPromise.catch(() => {});

        // Verify via pg_blocking_pids that writer is blocked while first client remains open + barrier unreleased
        await eventually(async () => {
          const blocked = await pool.query(
            'SELECT pg_blocking_pids($1) AS blockers',
            [writerPid]
          );
          const blockers: number[] = blocked.rows[0]?.blockers ?? [];
          return blockers.length > 0;
        }, 1000);

        expect(writerFinished).toBe(false);
        expect(barrierReleased).toBe(false);
        expect(client1.closed).toBe(false);

        // 7. Release barrier before 3s native RPC deadline
        rpcReleaseFn?.();
        rpcBarrierPromise = undefined;

        // 8. On release: first addTrack actually forwards to upstream SFU
        await eventually(() =>
          sfu.receivedRequests.some((r) => r.message.case === 'addTrack' && r.message.value.cid === `cid-screen-shared-${targetTable}`),
          2500
        );

        // First connection stays open
        expect(client1.closed).toBe(false);

        // Writer finishes
        await writerPromise;
        expect(writerFinished).toBe(true);

        // Retain PONG before release proof
        expect(pongReceivedBeforeRelease).toBe(true);
      } finally {
        // Release RPC FIRST so any thread stalled at GetParticipant can proceed and not hang
        if (rpcReleaseFn && !barrierReleased) {
          rpcReleaseFn();
        }
        if (client1?.ws) {
          client1.ws.terminate();
        }
        if (client2?.ws) {
          client2.ws.terminate();
        }
        if (writerPromise) {
          await writerPromise.catch(() => {});
        }
        if (writerClient) {
          try {
            await writerClient.query('ROLLBACK');
          } catch {
            // ignore rollback error if already committed/closed
          }
          try {
            writerClient.release();
          } catch {
            // ignore release error
          }
        }

        await gw?.close();
        await sfu?.close();
      }
    }
  );

  it('external writer holding room FOR UPDATE blocks runtime forwarding, then committed policy change is immediately enforced', async () => {
    let client: ClientConnection | undefined;
    let locker: pg.PoolClient | undefined;
    let lockerPid: number | undefined;
    const sfu = await startFakeSfu();
    const gw = await startGateway(sfu.url);

    try {
      const user = await seedCallAdmission(pool, 'writer-blocks-user', game.id);

      // Grant screen quota slot initially
      await pool.query(
        'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, is_call_active, created_at) VALUES($1, $2, $3, 1, true, now())',
        [randomUUID(), user.callGroupId, user.userId]
      );

      const token = await createClientToken(user.admissionId, user.roomName);
      client = await connectClient(gw.wsUrl, token);

      // 1. External writer begins transaction and locks room then call_group FOR UPDATE (canonical exclusive)
      locker = await pool.connect();
      lockerPid = (await locker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await locker.query('BEGIN');
      await locker.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [user.roomId]);
      await locker.query('SELECT id FROM call_groups WHERE id=$1 FOR UPDATE', [user.callGroupId]);

      // 2. Client sends screen addTrack. Runtime processBatch needs FOR SHARE on room, so it blocks on locker
      const screenTrack = new SignalRequest({
        message: {
          case: 'addTrack',
          value: {
            cid: 'cid-screen-blocked-by-writer',
            name: 'Screen Blocked By Writer',
            type: TrackType.VIDEO,
            source: TrackSource.SCREEN_SHARE,
          },
        },
      });
      client.ws.send(Buffer.from(screenTrack.toBinary()), { binary: true });

      // 3. Verify via pg_blocking_pids that gateway processBatch is blocked waiting on locker
      await eventually(async () => {
        const blocked = await pool.query(
          'SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
          [lockerPid]
        );
        return (blocked.rowCount ?? 0) > 0;
      }, 5000);

      // While runtime is blocked, upstream SFU has NOT received addTrack
      expect(sfu.receivedRequests.some((r) => r.message.case === 'addTrack')).toBe(false);

      // 4. Locker mutates policy under lock: revoke screen quota slot
      await locker.query(
        'DELETE FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2',
        [user.callGroupId, user.userId]
      );

      // 5. Locker commits and releases the lock
      await locker.query('COMMIT');
      locker.release();
      locker = undefined;

      // 6. Gateway unblocks, fresh publicationPermission under transaction observes revocation, and denies addTrack:
      // In processClientFrame, !permission.canPublishSources.includes(track.source) triggers FIRST,
      // returning 'Current publication source denied' with RequestResponse_Reason.NOT_ALLOWED
      await eventually(() => client!.responses.some((r) => r.message.case === 'requestResponse'), 8000);
      const denyResponse = client.responses.find((r) => r.message.case === 'requestResponse');
      expect(denyResponse).toBeDefined();
      if (denyResponse && denyResponse.message.case === 'requestResponse') {
        expect(denyResponse.message.value.reason).toBe(RequestResponse_Reason.NOT_ALLOWED);
        expect(denyResponse.message.value.message).toBe('Current publication source denied');
      }

      // Upstream SFU NEVER received the denied track
      expect(sfu.receivedRequests.some((r) => r.message.case === 'addTrack')).toBe(false);
    } finally {
      if (client?.ws) {
        client.ws.terminate();
      }
      if (locker) {
        await locker.query('ROLLBACK').catch(() => {});
        locker.release();
      }
      await gw.close();
      await sfu.close();
    }
  });

  it.each(['list', 'participants'] as const)(
    'CallsService.%s executes concurrently under shared read locks while gateway runtime holds FOR SHARE and blocks FOR UPDATE writer',
    async (method) => {
      let client1: ClientConnection | undefined;
      let client2: ClientConnection | undefined;
      let writerClient: pg.PoolClient | undefined;
      let writerPromise: Promise<void> | undefined;
      let rpcBarrierPromise: Promise<void> | undefined;
      let rpcReleaseFn: (() => void) | undefined;
      let barrierReleased = false;
      let rpcHitCount = 0;
      let originalApiPromise: Promise<any> | undefined;

      const sfu = await startFakeSfu({
        onGetParticipant: async () => {
          rpcHitCount++;
          if (rpcBarrierPromise) {
            await rpcBarrierPromise;
          }
        },
      });
      const gw = await startGateway(sfu.url);

      try {
        // Seed two admissions in one call
        const user1 = await seedCallAdmission(pool, `calls-shared-${method}-user-1`, game.id);
        const user2 = await seedSecondMemberInCall(pool, user1, `calls-shared-${method}-user-2`, game.id);

        // Grant screen share quota slot for user1 so screen addTrack triggers GetParticipant
        await pool.query(
          'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, is_call_active, created_at) VALUES($1, $2, $3, 1, true, now())',
          [randomUUID(), user1.callGroupId, user1.userId]
        );

        // Both clients join before opening barrier
        const token1 = await createClientToken(user1.admissionId, user1.roomName);
        const token2 = await createClientToken(user2.admissionId, user2.roomName);
        client1 = await connectClient(gw.wsUrl, token1);
        client2 = await connectClient(gw.wsUrl, token2);

        expect(client1.closed).toBe(false);
        expect(client2.closed).toBe(false);

        // Setup barrier
        rpcBarrierPromise = new Promise<void>((resolve) => {
          rpcReleaseFn = () => {
            barrierReleased = true;
            resolve();
          };
        });

        // Client 1 sends screen addTrack -> holds room/group FOR SHARE and halts at barrier
        const screenTrack = new SignalRequest({
          message: {
            case: 'addTrack',
            value: {
              cid: `cid-screen-calls-${method}`,
              name: 'Screen Track',
              type: TrackType.VIDEO,
              source: TrackSource.SCREEN_SHARE,
            },
          },
        });
        client1.ws.send(Buffer.from(screenTrack.toBinary()), { binary: true });

        await eventually(() => rpcHitCount > 0, 2000);
        expect(barrierReleased).toBe(false);
        expect(client1.closed).toBe(false);

        // While gateway runtime holds room/group FOR SHARE and barrier is unreleased,
        // actual CallsService.list / participants completes within 1500ms before barrier release and both sockets still open!
        let apiTimer: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          apiTimer = setTimeout(
            () => reject(new Error(`CallsService.${method} exceeded 1500ms concurrent deadline`)),
            1500
          );
        });

        originalApiPromise = method === 'list'
          ? callsService.list(user2.userId, user2.sessionId, user1.roomId)
          : callsService.participants(user2.userId, user2.sessionId, user1.callGroupId);
        void originalApiPromise.catch(() => {});

        let readResult: any;
        try {
          readResult = await Promise.race([originalApiPromise, timeoutPromise]);
        } finally {
          if (apiTimer) {
            clearTimeout(apiTimer);
          }
        }

        if (method === 'list') {
          expect(readResult).toHaveLength(1);
          expect(readResult[0].id).toBe(user1.callGroupId);
          expect(readResult[0].roomId).toBe(user1.roomId);
          expect(readResult[0].participantCount).toBe(2);
          expect(readResult[0].publisherCount).toBe(1);
        } else {
          expect(readResult).toHaveLength(2);
          const userIds = readResult.map((p: any) => p.userId).sort();
          expect(userIds).toEqual([user1.userId, user2.userId].sort());
          const mediaIds = readResult.map((p: any) => p.mediaIdentity).sort();
          expect(mediaIds).toEqual([user1.admissionId, user2.admissionId].sort());
          expect(readResult.every((p: any) => p.callId === user1.callGroupId)).toBe(true);

          const p1 = readResult.find((p: any) => p.userId === user1.userId);
          const p2 = readResult.find((p: any) => p.userId === user2.userId);
          expect(p1?.isPublishing).toBe(true);
          expect(p2?.isPublishing).toBe(false);
        }

        expect(barrierReleased).toBe(false);
        expect(client1.closed).toBe(false);
        expect(client2.closed).toBe(false);

        // Independent canonical FOR UPDATE writer must still be blocked per pg_blocking_pids
        writerClient = await pool.connect();
        const writerPid = (await writerClient.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        let writerFinished = false;

        writerPromise = (async () => {
          await writerClient!.query('BEGIN');
          await writerClient!.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [user1.roomId]);
          writerFinished = true;
          await writerClient!.query('COMMIT');
        })();
        void writerPromise.catch(() => {});

        await eventually(async () => {
          const blocked = await pool.query(
            'SELECT pg_blocking_pids($1) AS blockers',
            [writerPid]
          );
          const blockers: number[] = blocked.rows[0]?.blockers ?? [];
          return blockers.length > 0;
        }, 1000);

        expect(writerFinished).toBe(false);
        expect(barrierReleased).toBe(false);
        expect(client1.closed).toBe(false);
        expect(client2.closed).toBe(false);

        // Release barrier before native RPC 3s and forward first track
        rpcReleaseFn?.();
        rpcBarrierPromise = undefined;

        await eventually(() =>
          sfu.receivedRequests.some((r) => r.message.case === 'addTrack' && r.message.value.cid === `cid-screen-calls-${method}`),
          2500
        );

        expect(client1.closed).toBe(false);
        await writerPromise;
        expect(writerFinished).toBe(true);
      } finally {
        if (rpcReleaseFn && !barrierReleased) {
          rpcReleaseFn();
        }
        if (client1?.ws) {
          client1.ws.terminate();
        }
        if (client2?.ws) {
          client2.ws.terminate();
        }
        if (originalApiPromise) {
          await originalApiPromise.catch(() => {});
        }
        if (writerPromise) {
          await writerPromise.catch(() => {});
        }
        if (writerClient) {
          try {
            await writerClient.query('ROLLBACK');
          } catch {}
          try {
            writerClient.release();
          } catch {}
        }
        await gw?.close();
        await sfu?.close();
      }
    }
  );

  describe('CallsService negative principal authorization on read methods', () => {
    it.each([
      'outsider',
      'expired_session',
      'deleted_session',
      'banned',
      'no_onboarding',
    ] as const)(
      'list and participants reject %s with exact security errors against real database',
      async (condition) => {
        const owner = await seedCallAdmission(pool, `neg-owner-${condition}`, game.id);

        const targetUserId = `neg-user-${condition}`;
        const targetSessionId = `sess-${targetUserId}`;
        const targetSessionToken = `tok-${targetUserId}`;

        await pool.query(
          'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1,$1,$2,true,now(),now()) ON CONFLICT (id) DO NOTHING',
          [targetUserId, `${targetUserId}@fixture.invalid`]
        );
        await pool.query(
          'INSERT INTO profiles(user_id, display_name) VALUES($1, $1) ON CONFLICT (user_id) DO NOTHING',
          [targetUserId]
        );

        if (condition !== 'no_onboarding') {
          await pool.query(
            'INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
            [randomUUID(), targetUserId, game.id]
          );
        }

        const sessionExpiry = condition === 'expired_session' ? "now() - interval '1 hour'" : "now() + interval '1 day'";
        await pool.query(
          `INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at) VALUES($1, $2, $3, ${sessionExpiry}, now(), now()) ON CONFLICT (id) DO NOTHING`,
          [targetSessionId, targetUserId, targetSessionToken]
        );

        if (condition === 'deleted_session') {
          await pool.query('DELETE FROM session WHERE id=$1', [targetSessionId]);
        }

        if (condition === 'banned') {
          await pool.query(
            "INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, 'admin-actor', $2, 'BAN', 'Security ban test', clock_timestamp())",
            [randomUUID(), targetUserId]
          );
        }

        if (condition !== 'outsider') {
          await pool.query(
            "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, $3, 'MEMBER', now())",
            [randomUUID(), owner.roomId, targetUserId]
          );
        }

        let expectedStatus: number;
        let expectedCode: ErrorCode;
        let expectedMessage: string;

        switch (condition) {
          case 'expired_session':
          case 'deleted_session':
            expectedStatus = 401;
            expectedCode = ErrorCode.LOGIN_REQUIRED;
            expectedMessage = 'Session expired or revoked';
            break;
          case 'banned':
            expectedStatus = 403;
            expectedCode = ErrorCode.FORBIDDEN;
            expectedMessage = 'Account is banned';
            break;
          case 'no_onboarding':
            expectedStatus = 403;
            expectedCode = ErrorCode.FORBIDDEN;
            expectedMessage = 'Onboarding required';
            break;
          case 'outsider':
            expectedStatus = 403;
            expectedCode = ErrorCode.FORBIDDEN;
            expectedMessage = 'Current room membership required';
            break;
        }

        // Test list
        let listError: any;
        try {
          await callsService.list(targetUserId, targetSessionId, owner.roomId);
        } catch (err) {
          listError = err;
        }
        expect(listError).toBeInstanceOf(HttpException);
        expect(listError.getStatus()).toBe(expectedStatus);
        const listResp = listError.getResponse();
        expect(typeof listResp).toBe('object');
        expect(listResp.code).toBe(expectedCode);
        expect(listResp.message).toBe(expectedMessage);

        // Test participants
        let partsError: any;
        try {
          await callsService.participants(targetUserId, targetSessionId, owner.callGroupId);
        } catch (err) {
          partsError = err;
        }
        expect(partsError).toBeInstanceOf(HttpException);
        expect(partsError.getStatus()).toBe(expectedStatus);
        const partsResp = partsError.getResponse();
        expect(typeof partsResp).toBe('object');
        expect(partsResp.code).toBe(expectedCode);
        expect(partsResp.message).toBe(expectedMessage);
      }
    );
  });
});
