"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoObjectStore = void 0;
exports.lockCryptoObjectWrite = lockCryptoObjectWrite;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = require("node:fs");
async function lockCryptoObjectWrite(db, key) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/.test(key))
        throw new Error('Invalid crypto object key');
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_object',current_schema(),$1::text)::text,0::bigint))", [key]);
}
class CryptoObjectStore {
    maximumBytes;
    directory;
    scan;
    constructor(maximumBytes = 5 * 1024 * 1024) {
        this.maximumBytes = maximumBytes;
        if (![5 * 1024 * 1024, 8 * 1024 * 1024].includes(maximumBytes))
            throw new Error('Invalid crypto object budget');
    }
    async initialize() {
        const cwd = process.cwd(), codeRoot = node_path_1.default.basename(cwd) === 'api' && node_path_1.default.basename(node_path_1.default.dirname(cwd)) === 'apps' ? node_path_1.default.resolve(cwd, '../..') : cwd;
        const runtime = node_path_1.default.join(codeRoot, '.runtime'), requested = node_path_1.default.resolve(process.env.FG_CRYPTO_OBJECTS_DIR ?? node_path_1.default.join(runtime, 'chat-crypto-objects'));
        if (!requested.startsWith(runtime + node_path_1.default.sep))
            throw new Error('Crypto objects must remain in code/.runtime');
        const code = await promises_1.default.realpath(codeRoot);
        await promises_1.default.mkdir(runtime, { recursive: true });
        const root = await promises_1.default.realpath(runtime);
        if (root !== node_path_1.default.join(code, '.runtime'))
            throw new Error('Crypto runtime cannot be redirected');
        let ancestor = requested, resolvedAncestor;
        for (;;) {
            try {
                resolvedAncestor = await promises_1.default.realpath(ancestor);
                break;
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    throw error;
                ancestor = node_path_1.default.dirname(ancestor);
            }
        }
        if (resolvedAncestor !== root && !resolvedAncestor.startsWith(root + node_path_1.default.sep))
            throw new Error('Crypto object storage cannot escape through a link');
        await promises_1.default.mkdir(requested, { recursive: true });
        const resolved = await promises_1.default.realpath(requested);
        if (!resolved.startsWith(root + node_path_1.default.sep))
            throw new Error('Crypto object storage cannot escape through a link');
        this.directory = resolved;
    }
    async location(key) {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/.test(key))
            throw new Error('Invalid crypto object key');
        if (await promises_1.default.realpath(this.directory) !== this.directory)
            throw new Error('Crypto object directory changed');
        return node_path_1.default.join(this.directory, key);
    }
    async put(key, bytes) { if (!bytes.length || bytes.length > this.maximumBytes)
        throw new Error('Invalid crypto object size'); await promises_1.default.writeFile(await this.location(key), bytes, { flag: 'wx', mode: 0o600 }); }
    async read(key) {
        const target = await this.location(key), stat = await promises_1.default.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > this.maximumBytes || await promises_1.default.realpath(target) !== target)
            throw new Error('Invalid crypto object');
        const handle = await promises_1.default.open(target, node_fs_1.constants.O_RDONLY | (node_fs_1.constants.O_NOFOLLOW ?? 0));
        let bytes;
        try {
            const opened = await handle.stat();
            if (!opened.isFile() || opened.size < 1 || opened.size > this.maximumBytes || opened.size !== stat.size || opened.dev !== stat.dev || opened.ino !== stat.ino)
                throw new Error('Invalid crypto object');
            bytes = Buffer.alloc(opened.size + 1);
            let length = 0;
            while (length < bytes.length) {
                const read = await handle.read(bytes, length, bytes.length - length, length);
                if (!read.bytesRead)
                    break;
                length += read.bytesRead;
            }
            const current = await handle.stat(), named = await promises_1.default.lstat(target);
            if (length !== opened.size || current.size !== opened.size || current.dev !== opened.dev || current.ino !== opened.ino || !named.isFile() || named.isSymbolicLink() || named.size !== opened.size || named.dev !== opened.dev || named.ino !== opened.ino || await promises_1.default.realpath(target) !== target)
                throw new Error('Invalid crypto object');
            return bytes.subarray(0, length);
        }
        catch (error) {
            bytes?.fill(0);
            throw error;
        }
        finally {
            await handle.close();
        }
    }
    async remove(key) {
        const target = await this.location(key);
        try {
            await promises_1.default.unlink(target);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    async scanCandidates() {
        if (await promises_1.default.realpath(this.directory) !== this.directory)
            throw new Error('Crypto object directory changed');
        if (!this.scan)
            this.scan = await promises_1.default.opendir(this.directory, { bufferSize: 32 });
        const candidates = [];
        try {
            for (let index = 0; index < 100; index++) {
                const entry = await this.scan.read();
                if (!entry) {
                    await this.closeScan();
                    break;
                }
                if (entry.isFile() && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/.test(entry.name))
                    candidates.push(entry.name);
            }
            return candidates;
        }
        catch (error) {
            await this.closeScan();
            throw error;
        }
    }
    async closeScan() { const scan = this.scan; this.scan = undefined; await scan?.close(); }
}
exports.CryptoObjectStore = CryptoObjectStore;
//# sourceMappingURL=crypto-object-store.js.map