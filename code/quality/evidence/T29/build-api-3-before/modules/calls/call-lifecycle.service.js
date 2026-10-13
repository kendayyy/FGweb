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
var CallLifecycleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallLifecycleService = void 0;
const publishing_service_js_1 = require("./publishing.service.js");
const livekit_server_sdk_1 = require("livekit-server-sdk");
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const node_crypto_1 = require("node:crypto");
const livekit_server_sdk_2 = require("livekit-server-sdk");
const protocol_1 = require("@livekit/protocol");
const calls_service_js_1 = require("./calls.service.js");
const lease_store_js_1 = require("./lease-store.js");
const roomName = /^fg-call_([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
const gone = (error) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'not_found');
let CallLifecycleService = CallLifecycleService_1 = class CallLifecycleService {
    calls;
    publishing;
    pool;
    clock = () => Date.now();
    timer;
    running;
    closing = false;
    logger = new common_1.Logger(CallLifecycleService_1.name);
    constructor(calls, publishing) {
        this.calls = calls;
        this.publishing = publishing;
    }
    setClock(fn) { this.clock = fn ?? (() => Date.now()); }
    onModuleInit() {
        this.pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
        this.calls.setAfterLeave(id => this.closeIfEmpty(id));
        this.timer = setInterval(() => { if (this.closing || this.running || !this.configured())
            return; this.running = this.sweep().catch(() => this.logger.warn('Call lifecycle unavailable; persisted state will be retried')).finally(() => { this.running = undefined; }); }, 1000);
        this.timer.unref();
    }
    async onModuleDestroy() { this.closing = true; clearInterval(this.timer); this.calls.setAfterLeave(undefined); await this.running; await this.pool?.end(); }
    configured() { return Boolean(process.env.LIVEKIT_SERVER_URL && process.env.LIVEKIT_ADMISSION_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET); }
    native() { if (!this.configured())
        throw Error('Private media configuration required'); return new livekit_server_sdk_2.RoomServiceClient(process.env.LIVEKIT_SERVER_URL, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { requestTimeout: 3 }); }
    async transaction(run) { const db = await this.pool.connect(); try {
        await db.query('BEGIN');
        await db.query("SET LOCAL TIME ZONE 'UTC'");
        const result = await run(db);
        await db.query('COMMIT');
        return result;
    }
    catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
    finally {
        db.release();
    } }
    async lock(db, id) {
        const group = (await db.query('SELECT room_id FROM call_groups WHERE id=$1', [id])).rows[0];
        if (!group)
            return;
        await db.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [group.room_id]);
        return (await db.query('SELECT id,room_id,state FROM call_groups WHERE id=$1 FOR UPDATE', [id])).rows[0];
    }
    async release(db, ids, time) {
        if (!ids.length)
            return;
        await db.query('UPDATE call_admissions SET revoked_at=COALESCE(revoked_at,$2) WHERE call_member_id=ANY($1::text[])', [ids, time]);
        await db.query('DELETE FROM call_publish_slots WHERE (call_group_id,user_id) IN(SELECT call_group_id,user_id FROM call_members WHERE id=ANY($1::text[]))', [ids]);
        await db.query('UPDATE call_members SET left_at=COALESCE(left_at,$2) WHERE id=ANY($1::text[])', [ids, time]);
    }
    async closeLocked(db, id, time) {
        if ((await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL LIMIT 1', [id])).rowCount)
            return false;
        await db.query("UPDATE call_groups SET state='CLOSED',ended_at=COALESCE(ended_at,$2) WHERE id=$1 AND state='OPEN'", [id, time]);
        return true;
    }
    async deleteNative(id) {
        const native = this.native(), name = `fg-call_${id}`;
        try {
            await native.deleteRoom(name);
        }
        catch (error) {
            if ((await native.listRooms([name])).length)
                throw error;
        }
    }
    async closeIfEmpty(id) {
        const closed = await this.transaction(async (db) => {
            const group = await this.lock(db, id);
            if (!group || group.state !== 'OPEN')
                return false;
            return this.closeLocked(db, id, new Date(this.clock()));
        });
        if (closed) {
            this.publishing.forget(id);
            await this.deleteNative(id);
        }
    }
    async receive(raw, authorization) {
        let event;
        try {
            event = await new livekit_server_sdk_2.WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET).receive(raw, authorization, false, 0);
        }
        catch {
            throw new common_1.HttpException({ code: 'FORBIDDEN', message: 'Webhook signature denied' }, 401);
        }
        if (!event.id || event.id.length > 128 || !event.event)
            throw new common_1.HttpException({ code: 'INVALID_INPUT', message: 'Invalid webhook event' }, 400);
        const match = event.room?.name?.match(roomName), id = match?.[1];
        const added = await this.transaction(async (db) => {
            if (id)
                await this.lock(db, id);
            return Boolean((await db.query('INSERT INTO webhook_events(id,event_id,event_type,payload) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO NOTHING RETURNING id', [(0, node_crypto_1.randomUUID)(), event.id, event.event, JSON.stringify({ callId: id ?? null })])).rowCount);
        });
        if (id)
            await this.reconcileGroup(id, event.event === 'track_unpublished' && event.track?.source === livekit_server_sdk_1.TrackSource.SCREEN_SHARE && event.participant?.identity ? { identity: event.participant.identity, at: Number(event.createdAt) * 1000 } : undefined);
        return { success: true, duplicate: !added };
    }
    async reconcileGroup(id, ended) {
        const time = new Date(this.clock()), native = this.native();
        let closed = false;
        await this.transaction(async (db) => {
            const group = await this.lock(db, id);
            if (!group)
                return;
            if (group.state === 'CLOSED') {
                this.publishing.forget(id);
                closed = true;
                return;
            }
            const name = `fg-call_${id}`, nativeExists = Boolean((await native.listRooms([name])).length);
            let participants = [];
            if (nativeExists)
                try {
                    participants = await native.listParticipants(name);
                }
                catch (error) {
                    if (!gone(error))
                        throw error;
                }
            const present = new Set(participants.filter(p => p.state !== protocol_1.ParticipantInfo_State.DISCONNECTED).map(p => p.identity));
            const members = (await db.query(`SELECT m.id,m.user_id,a.id AS lease_id,a.connected_at,a.disconnected_at,a.expires_at,a.revoked_at
    FROM call_members m LEFT JOIN call_admissions a ON a.call_member_id=m.id AND a.revoked_at IS NULL WHERE m.call_group_id=$1 AND m.left_at IS NULL FOR UPDATE OF m`, [id])).rows;
            const released = [];
            for (const member of members) {
                if (!member.lease_id || !await (0, lease_store_js_1.liveLease)(db, member.lease_id)) {
                    released.push(member.id);
                    continue;
                }
                if (present.has(member.lease_id)) {
                    await db.query('UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL', [member.lease_id, time]);
                    continue;
                }
                if (member.connected_at) {
                    if (!member.disconnected_at)
                        await db.query('UPDATE call_admissions SET disconnected_at=$2 WHERE id=$1 AND disconnected_at IS NULL AND revoked_at IS NULL', [member.lease_id, time]);
                    else if (time.getTime() - member.disconnected_at.getTime() >= 30000)
                        released.push(member.id);
                }
                else if (member.expires_at.getTime() <= time.getTime())
                    released.push(member.id);
            }
            await this.release(db, released, time);
            await this.publishing.reconcileWithin(db, id, participants, time, ended);
            if (!nativeExists || (await db.query('SELECT id FROM call_members WHERE call_group_id=$1 LIMIT 1', [id])).rowCount)
                closed = await this.closeLocked(db, id, time);
        });
        if (closed)
            await this.deleteNative(id);
    }
    async sweep() {
        if (!this.configured())
            return;
        const groups = (await this.pool.query("SELECT id FROM call_groups WHERE state='OPEN' ORDER BY room_id,id")).rows;
        for (const group of groups)
            await this.reconcileGroup(group.id);
        await this.calls.reconcile();
        for (const room of await this.native().listRooms()) {
            const id = room.name.match(roomName)?.[1];
            if (!id)
                continue;
            const group = (await this.pool.query('SELECT state FROM call_groups WHERE id=$1', [id])).rows[0];
            if (group?.state === 'CLOSED' || (!group && Number(room.creationTime) * 1000 <= this.clock() - 60000))
                await this.deleteNative(id);
        }
    }
};
exports.CallLifecycleService = CallLifecycleService;
exports.CallLifecycleService = CallLifecycleService = CallLifecycleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [calls_service_js_1.CallsService, publishing_service_js_1.PublishingService])
], CallLifecycleService);
//# sourceMappingURL=call-lifecycle.service.js.map