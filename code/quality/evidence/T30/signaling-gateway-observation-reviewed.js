"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSignalingGateway = createSignalingGateway;
const node_http_1 = require("node:http");
const node_https_1 = require("node:https");
const node_perf_hooks_1 = require("node:perf_hooks");
const pg_1 = require("pg");
const ws_1 = require("ws");
const livekit_server_sdk_1 = require("livekit-server-sdk");
const protocol_1 = require("@livekit/protocol");
const lease_store_js_1 = require("./lease-store.js");
const methods = new Set(['CreateRoom', 'DeleteRoom', 'ListRooms', 'ListParticipants', 'RemoveParticipant', 'UpdateParticipant', 'GetParticipant', 'MutePublishedTrack']);
class AdmissionDenied extends Error {
    status;
    constructor(status) {
        super('Media admission denied');
        this.status = status;
    }
}
const FG_T30_GATEWAY_OBSERVATION = 'FG_T30_GATEWAY_OBSERVATION';
let observationWriteFailures = 0;
function recordObservationFailure() {
    observationWriteFailures += 1;
    try { process.stderr.write(FG_T30_GATEWAY_OBSERVATION + ' ' + JSON.stringify({ type: 'writeFailure', count: observationWriteFailures }) + '\n'); } catch {}
}
function logObservation(record) {
    try {
        process.stdout.write(FG_T30_GATEWAY_OBSERVATION + ' ' + JSON.stringify(record) + '\n');
    }
    catch {
        recordObservationFailure();
    }
}
function extractTaxonomy(error) {
    const pgCode = (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) ? error.code : 'other';
    const admissionStatus = (error instanceof AdmissionDenied && typeof error.status === 'number') ? error.status : 0;
    const allowedNames = ['Error', 'TypeError', 'RangeError', 'AdmissionDenied', 'AbortError', 'TimeoutError', 'AggregateError', 'DatabaseError'];
    const errorName = (typeof error?.name === 'string' && allowedNames.includes(error.name)) ? error.name : 'other';
    return { errorName, pgCode, admissionStatus };
}
function createSignalingGateway(options) {
    const target = new URL(options.upstreamURL), origin = new URL(options.origin).origin;
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) {
        throw Error('Invalid private SFU endpoint');
    }
    const pool = new pg_1.Pool({ connectionString: options.databaseURL, min: 16, max: 16, connectionTimeoutMillis: 2000, statement_timeout: 3000 });
    const verifier = new livekit_server_sdk_1.TokenVerifier(options.key, options.secret);
    const native = new livekit_server_sdk_1.RoomServiceClient(target.href, options.key, options.secret, { requestTimeout: 3 });
    const sockets = new Set();
    const pendingRemoval = new Map();
    const wss = new ws_1.WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
    const pendingPublications = new Map();
    let ticking = false, closing = false;
    const perfHistogram = (0, node_perf_hooks_1.monitorEventLoopDelay)({ resolution: 20 });
    perfHistogram.enable();
    let prevWall = process.hrtime.bigint();
    let prevCpu = process.cpuUsage();
    function samplePerf() {
        try {
        const nowWall = process.hrtime.bigint();
        const wallMs = Number(nowWall - prevWall) / 1e6;
        prevWall = nowWall;
        const currentCpu = process.cpuUsage();
        const cpuUserUs = currentCpu.user - prevCpu.user;
        const cpuSysUs = currentCpu.system - prevCpu.system;
        prevCpu = currentCpu;
        const mem = process.memoryUsage();
        logObservation({
            type: 'perf',
            at: new Date().toISOString(),
            wallMs: Number(wallMs.toFixed(3)),
            meanMs: Number((perfHistogram.mean / 1e6).toFixed(3)),
            maxMs: Number((perfHistogram.max / 1e6).toFixed(3)),
            p99Ms: Number((perfHistogram.percentile(99) / 1e6).toFixed(3)),
            cpuUserUs,
            cpuSysUs,
            rss: mem.rss,
            heapTotal: mem.heapTotal,
            heapUsed: mem.heapUsed,
        });
        perfHistogram.reset();
        } catch { recordObservationFailure(); }
    }
    const perfTimer = setInterval(samplePerf, 1000);
    perfTimer.unref();
    let perfStopped = false;
    function stopPerformanceTiming() {
        if (perfStopped)
            return;
        perfStopped = true;
        clearInterval(perfTimer);
        samplePerf();
        try {
            perfHistogram.disable();
        }
        catch { recordObservationFailure(); }
    }
    const readyPromise = (async () => {
        const acquirePromises = [];
        for (let i = 0; i < 16; i++) {
            acquirePromises.push(pool.connect());
        }
        const settled = await Promise.allSettled(acquirePromises);
        const clients = [];
        let firstError;
        let failed = false;
        for (const res of settled) {
            if (res.status === 'fulfilled') {
                clients.push(res.value);
            }
            else if (!failed) {
                failed = true;
                firstError = res.reason;
            }
        }
        for (const client of clients) {
            try {
                client.release();
            }
            catch (error) {
                if (!failed) {
                    failed = true;
                    firstError = error;
                }
            }
        }
        if (failed)
            throw firstError;
    })();
    void readyPromise.catch(() => { });
    const cors = (req, res) => {
        if (req.headers.origin === origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        res.setHeader('Cache-Control', 'no-store');
    };
    const pathFor = (req) => {
        const url = new URL(req.url ?? '/', 'http://gateway.invalid');
        if (url.pathname.startsWith('/api/media/'))
            url.pathname = url.pathname.slice('/api/media'.length);
        return url;
    };
    function checkOrigin(req) {
        if (req.headers.origin && req.headers.origin !== origin)
            throw new AdmissionDenied(403);
    }
    async function claims(req, url) {
        const query = url.searchParams.getAll('access_token'), bearer = req.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
        if (query.length > 1 || (query[0] && bearer && query[0] !== bearer))
            throw new AdmissionDenied(401);
        const token = query[0] ?? bearer;
        if (!token || token.length > 16384)
            throw new AdmissionDenied(401);
        try {
            return await verifier.verify(token, 0);
        }
        catch {
            throw new AdmissionDenied(401);
        }
    }
    async function remove(id, room) {
        pendingRemoval.set(id, room);
        try {
            await native.removeParticipant(room, id);
            pendingRemoval.delete(id);
        }
        catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'not_found')
                pendingRemoval.delete(id);
        }
    }
    async function invalidate(id, room) {
        await pool.query('UPDATE call_admissions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1', [id]);
        for (const binding of sockets) {
            if (binding.lease.id === id) {
                closeBinding(binding);
            }
        }
        for (const key of [...pendingPublications.keys()]) {
            if (key.startsWith(id + ':'))
                pendingPublications.delete(key);
        }
        await remove(id, room);
    }
    async function lockedLease(id, run, mode = 'FOR UPDATE') {
        const db = await pool.connect();
        try {
            await db.query('BEGIN');
            await db.query("SET LOCAL TIME ZONE 'UTC'");
            const initial = await (0, lease_store_js_1.liveLease)(db, id);
            if (!initial)
                throw new AdmissionDenied(403);
            const lockClause = mode === 'FOR SHARE' ? 'FOR SHARE' : 'FOR UPDATE';
            await db.query(`SELECT id FROM rooms WHERE id=$1 ${lockClause}`, [initial.room_id]);
            await db.query(`SELECT id FROM call_groups WHERE id=$1 ${lockClause}`, [initial.call_group_id]);
            const current = await (0, lease_store_js_1.liveLease)(db, id);
            if (!current)
                throw new AdmissionDenied(403);
            const result = await run(db, current);
            await db.query('COMMIT');
            return result;
        }
        catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
        finally {
            db.release();
        }
    }
    async function authorize(req, url) {
        checkOrigin(req);
        const c = await claims(req, url);
        if (!c.sub || !c.video?.roomJoin || !c.video.room)
            throw new AdmissionDenied(403);
        const expiry = Number(c.exp);
        if (!Number.isFinite(expiry) || expiry <= Date.now() / 1000)
            throw new AdmissionDenied(401);
        try {
            return await lockedLease(c.sub, async (db, lease) => {
                if (lease.room_name !== c.video.room)
                    throw new AdmissionDenied(403);
                const sources = await (0, lease_store_js_1.publicationSources)(db, lease);
                const token = new livekit_server_sdk_1.AccessToken(options.key, options.secret, {
                    identity: lease.id,
                    ttl: Math.max(1, Math.min(60, Math.floor(expiry - Date.now() / 1000))),
                });
                token.addGrant({
                    roomJoin: true,
                    room: lease.room_name,
                    canSubscribe: true,
                    canPublish: sources.length > 0,
                    canPublishSources: sources,
                    canPublishData: false,
                    canUpdateOwnMetadata: false,
                });
                const fresh = await token.toJwt();
                url.searchParams.set('access_token', fresh);
                if (req.headers.authorization)
                    req.headers.authorization = 'Bearer ' + fresh;
                return lease;
            });
        }
        catch (error) {
            if (error instanceof AdmissionDenied && error.status === 403)
                await invalidate(c.sub, c.video.room);
            throw error;
        }
    }
    async function live(binding) {
        try {
            return await lockedLease(binding.lease.id, async (db, lease) => {
                if (lease.room_name !== binding.lease.room_name)
                    throw new AdmissionDenied(403);
                const permission = await (0, lease_store_js_1.publicationPermission)(db, lease);
                const key = permission.canPublishSources.join(',');
                if (key !== binding.policyKey) {
                    await native.updateParticipant(lease.room_name, lease.id, { permission });
                    binding.policyKey = key;
                }
                for (const source of [protocol_1.TrackSource.SCREEN_SHARE, protocol_1.TrackSource.SCREEN_SHARE_AUDIO]) {
                    if (!permission.canPublishSources.includes(source))
                        pendingPublications.delete(lease.id + ':' + source);
                }
                return true;
            }, 'FOR SHARE');
        }
        catch (error) {
            if (error instanceof AdmissionDenied && error.status === 403) {
                await invalidate(binding.lease.id, binding.lease.room_name);
                return false;
            }
            throw error;
        }
    }
    function bytesOf(data) {
        return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
    }
    function observePublication(binding, data, binary) {
        let response;
        try {
            const bytes = bytesOf(data);
            response = binary ? protocol_1.SignalResponse.fromBinary(bytes) : protocol_1.SignalResponse.fromJsonString(bytes.toString('utf8'));
        }
        catch {
            return;
        }
        if (response.message.case === 'trackPublished') {
            const value = response.message.value;
            const source = value.track?.source;
            if (source === protocol_1.TrackSource.SCREEN_SHARE || source === protocol_1.TrackSource.SCREEN_SHARE_AUDIO) {
                const pending = pendingPublications.get(binding.lease.id + ':' + source);
                if (pending?.cid === value.cid)
                    pending.sid = value.track?.sid;
            }
        }
        if (response.message.case === 'trackUnpublished') {
            const sid = response.message.value.trackSid;
            for (const [key, value] of pendingPublications) {
                if (key.startsWith(binding.lease.id + ':') && value.sid === sid)
                    pendingPublications.delete(key);
            }
        }
    }
    function send(to, data, binary) {
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
        if (bytes.byteLength > 1024 * 1024 || to.bufferedAmount > 2 * 1024 * 1024) {
            to.terminate();
            return;
        }
        if (to.readyState === ws_1.WebSocket.OPEN)
            to.send(bytes, { binary });
    }
    function closeBinding(binding) {
        if (binding.closed)
            return;
        binding.closed = true;
        binding.queue.length = 0;
        binding.queueBytes = 0;
        sockets.delete(binding);
        binding.peer.terminate();
        binding.upstream.terminate();
        if (![...sockets].some((s) => s.lease.id === binding.lease.id)) {
            for (const key of [...pendingPublications.keys()]) {
                if (key.startsWith(binding.lease.id + ':'))
                    pendingPublications.delete(key);
            }
        }
        if (!closing && ![...sockets].some((s) => s.lease.id === binding.lease.id)) {
            void pool
                .query('UPDATE call_admissions SET disconnected_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL', [
                binding.lease.id,
            ])
                .catch(() => { });
        }
    }
    async function processClientFrame(db, binding, lease, permission, data, binary) {
        const bytes = bytesOf(data);
        let request;
        try {
            request = binary ? protocol_1.SignalRequest.fromBinary(bytes) : protocol_1.SignalRequest.fromJsonString(bytes.toString('utf8'));
        }
        catch {
            throw new AdmissionDenied(400);
        }
        if (request.message.case !== 'addTrack') {
            send(binding.upstream, data, binary);
            return;
        }
        const track = request.message.value;
        const deny = (reason, message) => {
            const response = new protocol_1.SignalResponse({
                message: { case: 'requestResponse', value: { reason, message, request: { case: 'addTrack', value: track } } },
            });
            send(binding.peer, binary ? Buffer.from(response.toBinary()) : Buffer.from(response.toJsonString()), binary);
        };
        const screen = track.source === protocol_1.TrackSource.SCREEN_SHARE;
        const audio = track.source === protocol_1.TrackSource.MICROPHONE || track.source === protocol_1.TrackSource.SCREEN_SHARE_AUDIO;
        if (!track.cid ||
            track.cid.length > 256 ||
            (!screen && !audio) ||
            (screen ? track.type !== protocol_1.TrackType.VIDEO : track.type !== protocol_1.TrackType.AUDIO) ||
            !permission.canPublishSources.includes(track.source)) {
            deny(protocol_1.RequestResponse_Reason.NOT_ALLOWED, 'Current publication source denied');
            return;
        }
        if (track.source === protocol_1.TrackSource.SCREEN_SHARE || track.source === protocol_1.TrackSource.SCREEN_SHARE_AUDIO) {
            const slot = (await db.query('SELECT id FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2', [
                lease.call_group_id,
                lease.user_id,
            ])).rows[0];
            if (!slot) {
                deny(protocol_1.RequestResponse_Reason.NOT_ALLOWED, 'Current screen quota required');
                return;
            }
            const key = lease.id + ':' + track.source;
            const peer = await native.getParticipant(lease.room_name, lease.id);
            const existing = peer.tracks.filter((t) => t.source === track.source);
            let pending = pendingPublications.get(key);
            if (pending?.slotId !== slot.id) {
                pendingPublications.delete(key);
                pending = undefined;
            }
            const sameNative = Boolean(track.sid && existing.some((t) => t.sid === track.sid));
            if (!sameNative && (existing.length > 0 || (pending && pending.cid !== track.cid))) {
                deny(protocol_1.RequestResponse_Reason.LIMIT_EXCEEDED, 'One native track per screen quota/source');
                return;
            }
            if (!sameNative && !pending)
                pendingPublications.set(key, { slotId: slot.id, cid: track.cid });
        }
        send(binding.upstream, data, binary);
    }
    async function processBatch(binding, batch) {
        if (binding.closed || batch.length === 0)
            return;
        await lockedLease(binding.lease.id, async (db) => {
            for (const frame of batch) {
                if (binding.closed)
                    return;
                const current = await (0, lease_store_js_1.liveLease)(db, binding.lease.id);
                if (!current || current.room_name !== binding.lease.room_name) {
                    throw new AdmissionDenied(403);
                }
                binding.lease = current;
                const permission = await (0, lease_store_js_1.publicationPermission)(db, current);
                const policyKey = permission.canPublishSources.join(',');
                if (policyKey !== binding.policyKey) {
                    await native.updateParticipant(current.room_name, current.id, { permission });
                    binding.policyKey = policyKey;
                }
                for (const source of [protocol_1.TrackSource.SCREEN_SHARE, protocol_1.TrackSource.SCREEN_SHARE_AUDIO]) {
                    if (!permission.canPublishSources.includes(source)) {
                        pendingPublications.delete(current.id + ':' + source);
                    }
                }
                if (frame.dir === 'inbound') {
                    observePublication(binding, frame.data, frame.binary);
                    send(binding.peer, frame.data, frame.binary);
                }
                else {
                    await processClientFrame(db, binding, current, permission, frame.data, frame.binary);
                }
            }
        }, 'FOR SHARE');
    }
    function scheduleDrain(binding) {
        if (binding.draining || binding.closed || binding.queue.length === 0)
            return;
        binding.draining = true;
        binding.drainPromise = binding.drainPromise
            .then(async () => {
            while (binding.queue.length > 0 && !binding.closed) {
                const batch = binding.queue.splice(0, Math.min(8, binding.queue.length));
                for (const item of batch) {
                    binding.queueBytes -= item.byteLength;
                }
                await processBatch(binding, batch);
            }
        })
            .catch((error) => {
            try {
            logObservation({
                type: 'error',
                site: 'scheduleDrain',
                at: new Date().toISOString(),
                ...extractTaxonomy(error),
                bindingClosed: Boolean(binding.closed),
            });
            } catch { recordObservationFailure(); }
            if (!binding.closed) {
                if (error instanceof AdmissionDenied && error.status === 403) {
                    closeBinding(binding);
                    void invalidate(binding.lease.id, binding.lease.room_name).catch(() => { });
                }
                else {
                    closeBinding(binding);
                    void remove(binding.lease.id, binding.lease.room_name).catch(() => { });
                }
            }
        })
            .finally(() => {
            binding.draining = false;
            if (binding.queue.length > 0 && !binding.closed) {
                scheduleDrain(binding);
            }
        });
    }
    function enqueue(binding, dir, data, binary) {
        if (binding.closed)
            return;
        const byteLength = Array.isArray(data)
            ? data.reduce((n, b) => n + b.length, 0)
            : data.byteLength;
        if (binding.queue.length >= 256 || binding.queueBytes + byteLength > 1024 * 1024) {
            closeBinding(binding);
            return;
        }
        binding.queue.push({ dir, data, binary, byteLength });
        binding.queueBytes += byteLength;
        scheduleDrain(binding);
    }
    function proxy(req, res, url) {
        const upstream = new URL(url.pathname + url.search, target);
        const request = upstream.protocol === 'https:' ? node_https_1.request : node_http_1.request;
        const headers = {};
        for (const h of ['authorization', 'content-type', 'content-length']) {
            if (typeof req.headers[h] === 'string')
                headers[h] = req.headers[h];
        }
        const outgoing = request(upstream, { method: req.method, headers, timeout: 5000 }, (response) => {
            res.statusCode = response.statusCode ?? 502;
            if (response.headers['content-type'])
                res.setHeader('Content-Type', response.headers['content-type']);
            response.pipe(res);
            response.on('error', () => res.destroy());
        });
        let size = 0;
        req.on('data', (bytes) => {
            size += bytes.length;
            if (size > 1024 * 1024) {
                outgoing.destroy();
                res.destroy();
            }
        });
        outgoing.on('timeout', () => outgoing.destroy());
        outgoing.on('error', () => {
            if (!res.headersSent) {
                res.statusCode = 502;
                res.end('Media service unavailable');
            }
            else
                res.destroy();
        });
        req.on('aborted', () => outgoing.destroy());
        req.pipe(outgoing);
    }
    const server = (0, node_http_1.createServer)((req, res) => {
        cors(req, res);
        void (async () => {
            const url = pathFor(req);
            checkOrigin(req);
            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
                res.end();
                return;
            }
            await readyPromise;
            if (req.method === 'GET' && url.pathname === '/health') {
                await pool.query('SELECT 1 FROM call_admissions LIMIT 1');
                res.end('OK');
                return;
            }
            if (req.method === 'GET' && /^\/rtc(?:\/v1)?\/validate$/.test(url.pathname)) {
                await authorize(req, url);
                proxy(req, res, url);
                return;
            }
            const service = url.pathname.match(/^\/twirp\/livekit\.RoomService\/([A-Za-z]+)$/);
            if (req.method === 'POST' && service && methods.has(service[1])) {
                const c = await claims(req, url);
                if (!c.video?.roomCreate && !c.video?.roomAdmin && !c.video?.roomList)
                    throw new AdmissionDenied(403);
                proxy(req, res, url);
                return;
            }
            throw new AdmissionDenied(404);
        })().catch((error) => {
            try {
            logObservation({
                type: 'error',
                site: 'httpHandler',
                at: new Date().toISOString(),
                ...extractTaxonomy(error),
                headersSent: Boolean(res.headersSent),
            });
            } catch { recordObservationFailure(); }
            if (!res.headersSent) {
                res.statusCode = error instanceof AdmissionDenied ? error.status : 503;
                res.end('Media admission denied');
            }
            else
                res.destroy();
        });
    });
    server.on('upgrade', (req, socket, head) => {
        let phase = 'init';
        const start = Date.now();
        void (async () => {
            const url = pathFor(req);
            if (!/^\/rtc(?:\/v1)?$/.test(url.pathname))
                throw new AdmissionDenied(404);
            checkOrigin(req);
            phase = 'readyPromise';
            await readyPromise;
            phase = 'authorize';
            const lease = await authorize(req, url);
            const upstreamURL = new URL(url.pathname + url.search, target);
            upstreamURL.protocol = upstreamURL.protocol === 'https:' ? 'wss:' : 'ws:';
            const upstream = new ws_1.WebSocket(upstreamURL, {
                handshakeTimeout: 5000,
                maxPayload: 1024 * 1024,
                perMessageDeflate: false,
                headers: { Origin: origin },
            });
            const queued = [];
            let queueBytes = 0;
            let binding;
            let joinedResolve;
            const joined = new Promise((resolve) => {
                joinedResolve = resolve;
            });
            const isJoin = (data, binary) => {
                try {
                    const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
                    return (binary ? protocol_1.SignalResponse.fromBinary(bytes) : protocol_1.SignalResponse.fromJsonString(bytes.toString('utf8'))).message.case === 'join';
                }
                catch {
                    return false;
                }
            };
            upstream.on('message', (data, binary) => {
                if (isJoin(data, binary))
                    joinedResolve();
                if (!binding) {
                    queueBytes += Array.isArray(data) ? data.reduce((n, b) => n + b.length, 0) : data.byteLength;
                    if (queueBytes > 1024 * 1024)
                        upstream.terminate();
                    else
                        queued.push({ data, binary });
                    return;
                }
                enqueue(binding, 'inbound', data, binary);
            });
            phase = 'upstream-open';
            await new Promise((resolve, reject) => {
                upstream.once('open', resolve);
                upstream.once('error', () => reject(new AdmissionDenied(502)));
                upstream.once('unexpected-response', (_r, response) => {
                    response.resume();
                    reject(new AdmissionDenied(response.statusCode === 404 ? 404 : 502));
                });
            });
            try {
                let joinTimer;
                try {
                    phase = 'join';
                    await Promise.race([
                        joined,
                        new Promise((_, reject) => {
                            joinTimer = setTimeout(() => reject(new AdmissionDenied(502)), 5000);
                        }),
                    ]);
                }
                finally {
                    clearTimeout(joinTimer);
                }
                phase = 'lockedLease';
                await lockedLease(lease.id, async (db, current) => {
                    if (current.room_name !== lease.room_name)
                        throw new AdmissionDenied(403);
                    const permission = await (0, lease_store_js_1.publicationPermission)(db, current);
                    await native.updateParticipant(current.room_name, current.id, { permission });
                    await db.query('UPDATE call_admissions SET connected_at=COALESCE(connected_at,clock_timestamp()),disconnected_at=NULL,expires_at=$2 WHERE id=$1 AND revoked_at IS NULL', [lease.id, current.session_expires_at]);
                    if (!(await (0, lease_store_js_1.liveLease)(db, lease.id)))
                        throw new AdmissionDenied(403);
                    wss.handleUpgrade(req, socket, head, (peer) => {
                        binding = {
                            lease: current,
                            peer,
                            upstream,
                            policyKey: permission.canPublishSources.join(','),
                            queue: [],
                            queueBytes: 0,
                            draining: false,
                            drainPromise: Promise.resolve(),
                            closed: false,
                        };
                        sockets.add(binding);
                        const own = binding;
                        for (const frame of queued)
                            send(peer, frame.data, frame.binary);
                        queued.length = 0;
                        peer.on('message', (data, binary) => {
                            enqueue(own, 'outbound', data, binary);
                        });
                        const ended = () => {
                            closeBinding(own);
                        };
                        peer.once('close', ended);
                        upstream.once('close', ended);
                        peer.on('error', () => closeBinding(own));
                        upstream.on('error', () => closeBinding(own));
                    });
                });
            }
            catch (error) {
                upstream.terminate();
                await remove(lease.id, lease.room_name);
                throw error;
            }
        })().catch((error) => {
            try {
            logObservation({
                type: 'error',
                site: 'upgrade',
                phase,
                durationMs: Date.now() - start,
                at: new Date().toISOString(),
                ...extractTaxonomy(error),
                socketDestroyed: Boolean(socket.destroyed),
            });
            } catch { recordObservationFailure(); }
            const status = error instanceof AdmissionDenied ? error.status : 503;
            const client = socket;
            if (!client.destroyed)
                client.end(`HTTP/1.1 ${status} Media Admission Denied\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
        });
    });
    const timer = setInterval(() => {
        if (ticking || closing)
            return;
        ticking = true;
        void (async () => {
            for (const binding of [...sockets]) {
                try {
                    await live(binding);
                }
                catch {
                    binding.peer.terminate();
                    binding.upstream.terminate();
                    await remove(binding.lease.id, binding.lease.room_name);
                }
            }
            for (const [id, room] of [...pendingRemoval])
                await remove(id, room);
        })().finally(() => {
            ticking = false;
        });
    }, 1000);
    timer.unref();
    async function close() {
        closing = true;
        clearInterval(timer);
        stopPerformanceTiming();
        for (const binding of [...sockets]) {
            closeBinding(binding);
        }
        await new Promise((resolve) => server.close(() => resolve()));
        await new Promise((resolve) => wss.close(() => resolve()));
        await readyPromise.catch(() => { });
        await pool.end();
    }
    return { server, close };
}
//# sourceMappingURL=signaling-gateway.js.map
