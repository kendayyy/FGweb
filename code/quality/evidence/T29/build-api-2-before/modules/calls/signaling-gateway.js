"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSignalingGateway = createSignalingGateway;
const node_http_1 = require("node:http");
const node_https_1 = require("node:https");
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
function createSignalingGateway(options) {
    const target = new URL(options.upstreamURL), origin = new URL(options.origin).origin;
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash)
        throw Error('Invalid private SFU endpoint');
    const pool = new pg_1.Pool({ connectionString: options.databaseURL, max: 16, connectionTimeoutMillis: 2000, statement_timeout: 3000 }), verifier = new livekit_server_sdk_1.TokenVerifier(options.key, options.secret), native = new livekit_server_sdk_1.RoomServiceClient(target.href, options.key, options.secret, { requestTimeout: 3 });
    const sockets = new Set(), pendingRemoval = new Map(), wss = new ws_1.WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
    let ticking = false, closing = false;
    const cors = (req, res) => { if (req.headers.origin === origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    } res.setHeader('Cache-Control', 'no-store'); };
    const pathFor = (req) => { const url = new URL(req.url ?? '/', 'http://gateway.invalid'); if (url.pathname.startsWith('/api/media/'))
        url.pathname = url.pathname.slice('/api/media'.length); return url; };
    function checkOrigin(req) { if (req.headers.origin && req.headers.origin !== origin)
        throw new AdmissionDenied(403); }
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
    async function remove(id, room) { pendingRemoval.set(id, room); try {
        await native.removeParticipant(room, id);
        pendingRemoval.delete(id);
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'not_found')
            pendingRemoval.delete(id);
    } }
    async function invalidate(id, room) {
        await pool.query('UPDATE call_admissions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1', [id]);
        for (const binding of sockets)
            if (binding.lease.id === id) {
                binding.peer.terminate();
                binding.upstream.terminate();
            }
        await remove(id, room);
    }
    async function lockedLease(id, run) {
        const db = await pool.connect();
        try {
            await db.query('BEGIN');
            await db.query("SET LOCAL TIME ZONE 'UTC'");
            const initial = await (0, lease_store_js_1.liveLease)(db, id);
            if (!initial)
                throw new AdmissionDenied(403);
            await db.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [initial.room_id]);
            await db.query('SELECT id FROM call_groups WHERE id=$1 FOR UPDATE', [initial.call_group_id]);
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
            return await lockedLease(c.sub, async (db, lease) => { if (lease.room_name !== c.video.room)
                throw new AdmissionDenied(403); const sources = await (0, lease_store_js_1.publicationSources)(db, lease), token = new livekit_server_sdk_1.AccessToken(options.key, options.secret, { identity: lease.id, ttl: Math.max(1, Math.min(60, Math.floor(expiry - Date.now() / 1000))) }); token.addGrant({ roomJoin: true, room: lease.room_name, canSubscribe: true, canPublish: sources.length > 0, canPublishSources: sources, canPublishData: false, canUpdateOwnMetadata: false }); const fresh = await token.toJwt(); url.searchParams.set('access_token', fresh); if (req.headers.authorization)
                req.headers.authorization = 'Bearer ' + fresh; return lease; });
        }
        catch (error) {
            if (error instanceof AdmissionDenied && error.status === 403)
                await invalidate(c.sub, c.video.room);
            throw error;
        }
    }
    async function live(binding) {
        try {
            return await lockedLease(binding.lease.id, async (db, lease) => { if (lease.room_name !== binding.lease.room_name)
                throw new AdmissionDenied(403); const permission = await (0, lease_store_js_1.publicationPermission)(db, lease), key = permission.canPublishSources.join(','); if (key !== binding.policyKey) {
                await native.updateParticipant(lease.room_name, lease.id, { permission });
                binding.policyKey = key;
            } return true; });
        }
        catch (error) {
            if (error instanceof AdmissionDenied && error.status === 403) {
                await invalidate(binding.lease.id, binding.lease.room_name);
                return false;
            }
            throw error;
        }
    }
    function send(to, data, binary) { const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data); if (bytes.byteLength > 1024 * 1024 || to.bufferedAmount > 2 * 1024 * 1024) {
        to.terminate();
        return;
    } if (to.readyState === ws_1.WebSocket.OPEN)
        to.send(bytes, { binary }); }
    function proxy(req, res, url) {
        const upstream = new URL(url.pathname + url.search, target), request = upstream.protocol === 'https:' ? node_https_1.request : node_http_1.request;
        const headers = {};
        for (const h of ['authorization', 'content-type', 'content-length'])
            if (typeof req.headers[h] === 'string')
                headers[h] = req.headers[h];
        const outgoing = request(upstream, { method: req.method, headers, timeout: 5000 }, response => {
            res.statusCode = response.statusCode ?? 502;
            if (response.headers['content-type'])
                res.setHeader('Content-Type', response.headers['content-type']);
            response.pipe(res);
            response.on('error', () => res.destroy());
        });
        let size = 0;
        req.on('data', bytes => { size += bytes.length; if (size > 1024 * 1024) {
            outgoing.destroy();
            res.destroy();
        } });
        outgoing.on('timeout', () => outgoing.destroy());
        outgoing.on('error', () => { if (!res.headersSent) {
            res.statusCode = 502;
            res.end('Media service unavailable');
        }
        else
            res.destroy(); });
        req.on('aborted', () => outgoing.destroy());
        req.pipe(outgoing);
    }
    const server = (0, node_http_1.createServer)((req, res) => {
        cors(req, res);
        void (async () => {
            const url = pathFor(req);
            checkOrigin(req);
            if (req.method === 'GET' && url.pathname === '/health') {
                await pool.query('SELECT 1 FROM call_admissions LIMIT 1');
                res.end('OK');
                return;
            }
            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
                res.end();
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
        })().catch(error => { if (!res.headersSent) {
            res.statusCode = error instanceof AdmissionDenied ? error.status : 503;
            res.end('Media admission denied');
        }
        else
            res.destroy(); });
    });
    server.on('upgrade', (req, socket, head) => {
        void (async () => {
            const url = pathFor(req);
            if (!/^\/rtc(?:\/v1)?$/.test(url.pathname))
                throw new AdmissionDenied(404);
            const lease = await authorize(req, url);
            const upstreamURL = new URL(url.pathname + url.search, target);
            upstreamURL.protocol = upstreamURL.protocol === 'https:' ? 'wss:' : 'ws:';
            const upstream = new ws_1.WebSocket(upstreamURL, { handshakeTimeout: 5000, maxPayload: 1024 * 1024, perMessageDeflate: false, headers: { Origin: origin } });
            const queued = [];
            let queueBytes = 0, binding;
            let joinedResolve;
            const joined = new Promise(resolve => { joinedResolve = resolve; });
            const isJoin = (data, binary) => { try {
                const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
                return (binary ? protocol_1.SignalResponse.fromBinary(bytes) : protocol_1.SignalResponse.fromJsonString(bytes.toString('utf8'))).message.case === 'join';
            }
            catch {
                return false;
            } };
            let incoming = Promise.resolve(), outgoing = Promise.resolve();
            upstream.on('message', (data, binary) => { if (isJoin(data, binary))
                joinedResolve(); if (!binding) {
                queueBytes += Array.isArray(data) ? data.reduce((n, b) => n + b.length, 0) : data.byteLength;
                if (queueBytes > 1024 * 1024)
                    upstream.terminate();
                else
                    queued.push({ data, binary });
                return;
            } const current = binding; incoming = incoming.then(async () => { if (await live(current))
                send(current.peer, data, binary); }).catch(() => { current.peer.terminate(); current.upstream.terminate(); void remove(current.lease.id, current.lease.room_name); }); });
            await new Promise((resolve, reject) => { upstream.once('open', resolve); upstream.once('error', () => reject(new AdmissionDenied(502))); upstream.once('unexpected-response', (_r, response) => { response.resume(); reject(new AdmissionDenied(response.statusCode === 404 ? 404 : 502)); }); });
            try {
                let joinTimer;
                try {
                    await Promise.race([joined, new Promise((_, reject) => { joinTimer = setTimeout(() => reject(new AdmissionDenied(502)), 5000); })]);
                }
                finally {
                    clearTimeout(joinTimer);
                }
                await lockedLease(lease.id, async (db, current) => {
                    if (current.room_name !== lease.room_name)
                        throw new AdmissionDenied(403);
                    const permission = await (0, lease_store_js_1.publicationPermission)(db, current);
                    await native.updateParticipant(current.room_name, current.id, { permission });
                    await db.query('UPDATE call_admissions SET connected_at=COALESCE(connected_at,clock_timestamp()),disconnected_at=NULL,expires_at=$2 WHERE id=$1 AND revoked_at IS NULL', [lease.id, current.session_expires_at]);
                    if (!await (0, lease_store_js_1.liveLease)(db, lease.id))
                        throw new AdmissionDenied(403);
                    wss.handleUpgrade(req, socket, head, peer => {
                        binding = { lease: current, peer, upstream, policyKey: permission.canPublishSources.join(',') };
                        sockets.add(binding);
                        const own = binding;
                        for (const frame of queued)
                            send(peer, frame.data, frame.binary);
                        queued.length = 0;
                        peer.on('message', (data, binary) => { outgoing = outgoing.then(async () => { if (await live(own))
                            send(upstream, data, binary); }).catch(() => { peer.terminate(); upstream.terminate(); void remove(own.lease.id, own.lease.room_name); }); });
                        const ended = () => { sockets.delete(own); peer.terminate(); upstream.terminate(); if (!closing && ![...sockets].some(s => s.lease.id === own.lease.id))
                            void pool.query('UPDATE call_admissions SET disconnected_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL', [own.lease.id]).catch(() => { }); };
                        peer.once('close', ended);
                        upstream.once('close', ended);
                        peer.on('error', () => peer.terminate());
                        upstream.on('error', () => upstream.terminate());
                    });
                });
            }
            catch (error) {
                upstream.terminate();
                await remove(lease.id, lease.room_name);
                throw error;
            }
        })().catch(error => { const status = error instanceof AdmissionDenied ? error.status : 503; const client = socket; if (!client.destroyed)
            client.end(`HTTP/1.1 ${status} Media Admission Denied\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); });
    });
    const timer = setInterval(() => {
        if (ticking || closing)
            return;
        ticking = true;
        void (async () => {
            for (const binding of [...sockets])
                try {
                    await live(binding);
                }
                catch {
                    binding.peer.terminate();
                    binding.upstream.terminate();
                    await remove(binding.lease.id, binding.lease.room_name);
                }
            for (const [id, room] of [...pendingRemoval])
                await remove(id, room);
        })().finally(() => { ticking = false; });
    }, 1000);
    timer.unref();
    async function close() { closing = true; clearInterval(timer); for (const binding of sockets) {
        binding.peer.terminate();
        binding.upstream.terminate();
    } await new Promise(resolve => server.close(() => resolve())); await new Promise(resolve => wss.close(() => resolve())); await pool.end(); }
    return { server, close };
}
//# sourceMappingURL=signaling-gateway.js.map