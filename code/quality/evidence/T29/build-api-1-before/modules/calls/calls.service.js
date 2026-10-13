"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallsService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const node_crypto_1 = require("node:crypto");
const livekit_server_sdk_1 = require("livekit-server-sdk");
const contracts_1 = require("@fg/contracts");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const auth_service_js_1 = require("../auth/auth.service.js");
const lease_store_js_1 = require("./lease-store.js");
const alreadyGone = (error) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'not_found');
let CallsService = class CallsService {
    auth;
    rooms;
    pool;
    issuedRooms = new Set();
    afterLeave;
    setAfterLeave(callback) { this.afterLeave = callback; }
    constructor(auth, rooms) {
        this.auth = auth;
        this.rooms = rooms;
    }
    onModuleInit() {
        if (!process.env.DATABASE_URL)
            throw Error('DATABASE_URL required');
        this.pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL, max: 16, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
        if (process.env.LIVEKIT_SERVER_URL && process.env.LIVEKIT_ADMISSION_URL) {
            this.auth.setCallHooks({ before: id => this.revokeSession(id), after: user => this.sessionDeleted(user) });
            this.rooms.setCallRevoker(() => this.reconcile());
        }
    }
    async onModuleDestroy() { this.auth.setCallHooks(undefined); this.rooms.setCallRevoker(undefined); await this.pool?.end(); }
    config() {
        const { LIVEKIT_SERVER_URL: server, LIVEKIT_ADMISSION_URL: admission, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
        if (!server || !admission || !key || !secret)
            throw Error('Private media gateway configuration required');
        const url = new URL(admission);
        if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
            throw Error('Invalid admission URL');
        if (process.env.PUBLIC_ORIGIN?.startsWith('https:') && url.protocol !== 'wss:')
            throw Error('Secure media gateway required');
        return { client: new livekit_server_sdk_1.RoomServiceClient(server, key, secret, { requestTimeout: 10 }), admission, key, secret };
    }
    async transaction(run) {
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN');
            await db.query("SET LOCAL TIME ZONE 'UTC'");
            const result = await run(db);
            await db.query('COMMIT');
            return result;
        }
        catch (error) {
            await db.query('ROLLBACK');
            if (error instanceof common_1.HttpException)
                throw error;
            if (error && typeof error === 'object' && 'code' in error && ['23505', '40001', '40P01'].includes(String(error.code)))
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Concurrent call admission conflict');
            throw error;
        }
        finally {
            db.release();
        }
    }
    async actor(db, user, session) {
        if (!(await db.query('SELECT id FROM session WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE', [session, user])).rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
        const ban = (await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1", [user])).rows[0];
        if (ban?.action === 'BAN')
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Account is banned');
        if (!(await db.query('SELECT user_id FROM profiles p WHERE p.user_id=$1 AND EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=p.user_id) FOR SHARE', [user])).rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Onboarding required');
    }
    async room(db, id, user, session, extra = []) {
        const rooms = await db.query('SELECT id FROM rooms WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [[...new Set([id, ...extra])].sort()]);
        if (!rooms.rows.some(r => r.id === id))
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
        await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [user]);
        await this.actor(db, user, session);
        if (!(await db.query('SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE', [id, user])).rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Current room membership required');
    }
    async dto(db, id) {
        const row = (await db.query(`SELECT c.*,to_char(c.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,
   (SELECT count(*)::int FROM call_members m WHERE m.call_group_id=c.id AND m.left_at IS NULL) AS participants,
   (SELECT count(*)::int FROM call_publish_slots p WHERE p.call_group_id=c.id) AS publishers FROM call_groups c WHERE c.id=$1`, [id])).rows[0];
        if (!row)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Call not found');
        return contracts_1.CallGroupSchema.parse({ id: row.id, roomId: row.room_id, state: row.state, participantCount: row.participants, publisherCount: row.publishers, hasExternalLive: false, createdAt: row.created_iso });
    }
    async create(user, session, roomId) {
        const id = (0, node_crypto_1.randomUUID)(), config = this.config();
        let nativeCreated = false;
        try {
            return await this.transaction(async (db) => {
                await this.room(db, roomId, user, session);
                await db.query('INSERT INTO call_groups(id,room_id) VALUES($1,$2)', [id, roomId]);
                await config.client.createRoom({ name: `fg-call_${id}`, maxParticipants: 10, emptyTimeout: 300, departureTimeout: 30 });
                nativeCreated = true;
                this.issuedRooms.add(`fg-call_${id}`);
                await this.actor(db, user, session);
                return this.dto(db, id);
            });
        }
        catch (error) {
            if (nativeCreated)
                await config.client.deleteRoom(`fg-call_${id}`);
            throw error;
        }
    }
    async list(user, session, roomId) {
        return this.transaction(async (db) => {
            await this.room(db, roomId, user, session);
            const groups = (await db.query('SELECT id FROM call_groups WHERE room_id=$1 AND state=\'OPEN\' ORDER BY created_at,id', [roomId])).rows;
            const result = [];
            for (const g of groups)
                result.push(await this.dto(db, g.id));
            return result;
        });
    }
    async controlsGroup(db, id, user, session) {
        const group = (await db.query('SELECT * FROM call_groups WHERE id=$1', [id])).rows[0];
        if (!group)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Call not found');
        await this.room(db, group.room_id, user, session);
        const current = (await db.query('SELECT * FROM call_groups WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!current || current.state !== 'OPEN')
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.CALL_CLOSED, 'Call is closed');
    }
    async participantDtos(db, id) {
        const rows = (await db.query(`SELECT m.user_id,m.is_muted,p.display_name,p.avatar_url,p.custom_status,a.id AS media_identity,
   to_char(m.joined_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS joined_iso,
   EXISTS(SELECT 1 FROM call_publish_slots ps WHERE ps.call_group_id=m.call_group_id AND ps.user_id=m.user_id) AS publishing,
   EXISTS(SELECT 1 FROM call_restrictions r WHERE r.call_group_id=m.call_group_id AND r.target_user_id=m.user_id AND r.restriction_type='MIC_MUTED') AS restricted
   FROM call_members m JOIN profiles p ON p.user_id=m.user_id
   LEFT JOIN call_admissions a ON a.call_member_id=m.id AND a.revoked_at IS NULL
   WHERE m.call_group_id=$1 AND m.left_at IS NULL ORDER BY m.seat_index,m.user_id`, [id])).rows;
        const result = [];
        for (const row of rows)
            if (row.media_identity && await (0, lease_store_js_1.liveLease)(db, row.media_identity))
                result.push(contracts_1.CallParticipantSchema.parse({ callId: id, userId: row.user_id, user: { id: row.user_id, displayName: row.display_name, avatarUrl: row.avatar_url, customStatus: row.custom_status }, mediaIdentity: row.media_identity, micRestricted: row.restricted, isPublishing: row.publishing, isMuted: row.is_muted, joinedAt: row.joined_iso }));
        return result;
    }
    async participants(user, session, id) { return this.transaction(async (db) => { await this.controlsGroup(db, id, user, session); return this.participantDtos(db, id); }); }
    async selfMic(user, session, id, muted) {
        return this.transaction(async (db) => {
            await this.controlsGroup(db, id, user, session);
            const member = (await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE', [id, user])).rows[0];
            if (!member)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Current call participant required');
            const lease = (await db.query('SELECT id,session_id FROM call_admissions WHERE call_member_id=$1 AND revoked_at IS NULL FOR UPDATE', [member.id])).rows[0];
            if (!lease || lease.session_id !== session || !await (0, lease_store_js_1.liveLease)(db, lease.id))
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Current session-bound call admission required');
            if (!muted && (await db.query("SELECT id FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2 AND restriction_type='MIC_MUTED'", [id, user])).rowCount)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Moderator microphone restriction');
            await db.query('UPDATE call_members SET is_muted=$2 WHERE id=$1', [member.id, muted]);
            const dto = (await this.participantDtos(db, id)).find(p => p.userId === user);
            if (!dto)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Call admission no longer valid');
            return dto;
        });
    }
    async release(db, memberIds) {
        if (!memberIds.length)
            return;
        await db.query('UPDATE call_admissions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE call_member_id=ANY($1::text[])', [memberIds]);
        await db.query('DELETE FROM call_publish_slots WHERE (call_group_id,user_id) IN(SELECT call_group_id,user_id FROM call_members WHERE id=ANY($1::text[]))', [memberIds]);
        await db.query('UPDATE call_members SET left_at=COALESCE(left_at,now()) WHERE id=ANY($1::text[])', [memberIds]);
    }
    async join(user, session, id) {
        const config = this.config();
        return this.transaction(async (db) => {
            const group = (await db.query('SELECT * FROM call_groups WHERE id=$1', [id])).rows[0];
            if (!group)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Call not found');
            const prior = (await db.query('SELECT room_id FROM call_members WHERE user_id=$1 AND left_at IS NULL', [user])).rows[0];
            await this.room(db, group.room_id, user, session, prior ? [prior.room_id] : []);
            const current = (await db.query('SELECT * FROM call_groups WHERE id=$1 FOR UPDATE', [id])).rows[0];
            if (!current || current.state !== 'OPEN')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.CALL_CLOSED, 'Call is closed');
            const stale = (await db.query(`SELECT m.id,m.room_id FROM call_members m WHERE m.left_at IS NULL AND (m.call_group_id=$1 OR m.user_id=$2)
   AND NOT EXISTS(SELECT 1 FROM call_admissions a JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id
    WHERE a.call_member_id=m.id AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp())`, [id, user])).rows;
            if (stale.some(m => m.room_id !== group.room_id && m.room_id !== prior?.room_id))
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Call changed while waiting');
            await this.release(db, stale.map(m => m.id));
            const active = (await db.query('SELECT * FROM call_members WHERE user_id=$1 AND left_at IS NULL FOR UPDATE', [user])).rows[0];
            if (active && active.call_group_id !== id)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Leave the current call first');
            let memberId, identity;
            if (active) {
                const lease = (await db.query('SELECT id,session_id FROM call_admissions WHERE call_member_id=$1 AND revoked_at IS NULL FOR UPDATE', [active.id])).rows[0];
                if (!lease || lease.session_id !== session || !await (0, lease_store_js_1.liveLease)(db, lease.id))
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Call belongs to another session; leave it first');
                identity = lease.id;
            }
            else {
                const occupied = (await db.query('SELECT seat_index FROM call_members WHERE call_group_id=$1 AND left_at IS NULL', [id])).rows.map(m => Number(m.seat_index));
                const seat = Array.from({ length: 10 }, (_, i) => i + 1).find(i => !occupied.includes(i));
                if (!seat)
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.CAPACITY_FULL, 'Call limit is ten including viewers');
                const old = (await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND user_id=$2 FOR UPDATE', [id, user])).rows[0];
                memberId = old?.id ?? (0, node_crypto_1.randomUUID)();
                if (old)
                    await db.query('UPDATE call_members SET seat_index=$2,left_at=NULL,joined_at=now(),is_muted=true WHERE id=$1', [memberId, seat]);
                else
                    await db.query('INSERT INTO call_members(id,call_group_id,room_id,user_id,seat_index) VALUES($1,$2,$3,$4,$5)', [memberId, id, group.room_id, user, seat]);
                identity = `admission_${(0, node_crypto_1.randomUUID)()}`;
                await db.query("INSERT INTO call_admissions(id,call_member_id,session_id,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '60 seconds')", [identity, memberId, session]);
            }
            await config.client.createRoom({ name: `fg-call_${id}`, maxParticipants: 10, emptyTimeout: 300, departureTimeout: 30 });
            const token = new livekit_server_sdk_1.AccessToken(config.key, config.secret, { identity, ttl: 60 });
            token.addGrant({ roomJoin: true, room: `fg-call_${id}`, canSubscribe: true, canPublish: true, canPublishSources: [livekit_server_sdk_1.TrackSource.MICROPHONE], canPublishData: false });
            await this.actor(db, user, session);
            return contracts_1.CallJoinSchema.parse({ callId: id, token: await token.toJwt(), sfuUrl: config.admission, roomName: `fg-call_${id}` });
        });
    }
    async leave(user, session, id) {
        await this.transaction(async (db) => {
            const group = (await db.query('SELECT * FROM call_groups WHERE id=$1', [id])).rows[0];
            if (!group)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Call not found');
            await this.room(db, group.room_id, user, session);
            await db.query('SELECT id FROM call_groups WHERE id=$1 FOR UPDATE', [id]);
            const member = (await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE', [id, user])).rows[0];
            if (!member)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Current call participant required');
            await this.release(db, [member.id]);
        });
        await this.reconcile();
        await this.afterLeave?.(id);
        return { success: true };
    }
    async revokeSession(sessionId) {
        await this.transaction(async (db) => { await db.query('UPDATE call_admissions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE session_id=$1', [sessionId]); });
        await this.reconcile();
    }
    async sessionDeleted(user) {
        await this.transaction(async (db) => {
            const active = (await db.query('SELECT room_id FROM call_members WHERE user_id=$1 AND left_at IS NULL', [user])).rows;
            await db.query('SELECT id FROM rooms WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [active.map(m => m.room_id)]);
            await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [user]);
            const stale = (await db.query(`SELECT m.id FROM call_members m WHERE m.user_id=$1 AND m.left_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM call_admissions a JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id WHERE a.call_member_id=m.id AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp())`, [user])).rows;
            await this.release(db, stale.map(m => m.id));
        });
        await this.reconcile();
    }
    async reconcile() {
        const config = this.config(), owned = new Set([...this.issuedRooms, ...(await this.pool.query('SELECT id FROM call_groups')).rows.map(c => `fg-call_${c.id}`)]);
        for (const room of await config.client.listRooms([...owned]))
            if (owned.has(room.name)) {
                let participants;
                try {
                    participants = await config.client.listParticipants(room.name);
                }
                catch (error) {
                    if (alreadyGone(error))
                        continue;
                    throw error;
                }
                for (const p of participants)
                    if (!await (0, lease_store_js_1.liveLease)(this.pool, p.identity)) {
                        try {
                            await config.client.removeParticipant(room.name, p.identity);
                        }
                        catch (error) {
                            if (!alreadyGone(error))
                                throw error;
                        }
                        await this.afterLeave?.(room.name.slice('fg-call_'.length));
                    }
            }
    }
};
exports.CallsService = CallsService;
exports.CallsService = CallsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_js_1.AuthService, rooms_service_js_1.RoomsService])
], CallsService);
//# sourceMappingURL=calls.service.js.map