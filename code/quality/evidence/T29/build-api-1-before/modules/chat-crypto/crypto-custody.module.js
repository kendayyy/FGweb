"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoCustodyModule = exports.CryptoCustodyConfig = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_https_1 = __importDefault(require("node:https"));
const openbao_transit_js_1 = require("./openbao-transit.js");
const lobby_cipher_js_1 = require("./lobby-cipher.js");
const crypto_reports_service_js_1 = require("./crypto-reports.service.js");
const policies = { lobby: 'fg-lobby-app', writer: 'fg-report-writer', reader: 'fg-report-reader' };
let CryptoCustodyConfig = class CryptoCustodyConfig {
    address = process.env.FG_BAO_ADDRESS;
    caFile = process.env.FG_BAO_CA_FILE;
    files = { lobby: process.env.FG_BAO_LOBBY_TOKEN_FILE, writer: process.env.FG_BAO_REPORT_WRITER_TOKEN_FILE, reader: process.env.FG_BAO_REPORT_READER_TOKEN_FILE };
    retention = process.env.FG_REPORT_RETENTION_SECONDS;
    async readFile(input, maximum) {
        let handle, bytes;
        try {
            if (!node_path_1.default.isAbsolute(input))
                throw new Error();
            const file = node_path_1.default.resolve(input), before = await fs.lstat(file);
            if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > maximum || await fs.realpath(file) !== file)
                throw new Error();
            handle = await fs.open(file, 'r');
            const opened = await handle.stat();
            if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs)
                throw new Error();
            bytes = Buffer.alloc(opened.size + 1);
            let used = 0;
            while (used < bytes.length) {
                const result = await handle.read(bytes, used, bytes.length - used, used);
                if (!result.bytesRead)
                    break;
                used += result.bytesRead;
            }
            const after = await handle.stat(), current = await fs.lstat(file);
            if (used !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || current.dev !== opened.dev || current.ino !== opened.ino || current.size !== opened.size || current.mtimeMs !== opened.mtimeMs || await fs.realpath(file) !== file)
                throw new Error();
            return bytes.subarray(0, used);
        }
        catch {
            bytes?.fill(0);
            throw new openbao_transit_js_1.TransitFailure('CONFIGURATION');
        }
        finally {
            await handle?.close();
        }
    }
    async checkedToken(role, ca) {
        const bytes = await this.readFile(this.files[role], 16386);
        let token;
        try {
            token = bytes.toString('utf8').replace(/\r?\n$/, '');
            if (!/^[A-Za-z0-9._-]{8,16384}$/.test(token))
                throw new openbao_transit_js_1.TransitFailure('AUTHORIZATION');
        }
        finally {
            bytes.fill(0);
        }
        await new Promise((resolve, reject) => {
            let length = 0;
            const chunks = [];
            const fail = (reason) => reject(new openbao_transit_js_1.TransitFailure(reason));
            const req = node_https_1.default.request(new URL('/v1/auth/token/lookup-self', this.address), { method: 'GET', agent: false, ca, rejectUnauthorized: true, headers: { 'X-Vault-Token': token } }, res => {
                res.on('data', (chunk) => { length += chunk.length; if (length > 65536) {
                    req.destroy();
                    fail('UNAVAILABLE');
                    return;
                } chunks.push(chunk); });
                res.on('error', () => fail('UNAVAILABLE'));
                res.on('end', () => { try {
                    if (res.statusCode !== 200)
                        throw new Error();
                    const result = JSON.parse(Buffer.concat(chunks).toString('utf8')).data, granted = result?.policies;
                    if (!Array.isArray(granted) || !granted.includes(policies[role]) || granted.some((policy) => policy !== policies[role] && policy !== 'default') || typeof result.ttl !== 'number' || result.ttl <= 0)
                        throw new Error();
                    resolve();
                }
                catch {
                    fail('AUTHORIZATION');
                }
                finally {
                    for (const chunk of chunks)
                        chunk.fill(0);
                } });
            });
            const deadline = setTimeout(() => req.destroy(), 5000);
            req.on('close', () => clearTimeout(deadline));
            req.on('error', () => fail('UNAVAILABLE'));
            req.setTimeout(5000, () => req.destroy());
            req.end();
        });
        return token;
    }
    async custody(role) {
        if (!this.files[role])
            return undefined;
        try {
            if (!this.address || !this.caFile)
                throw new Error();
            const ca = await this.readFile(this.caFile, 131072);
            if (!ca.includes(Buffer.from('-----BEGIN CERTIFICATE-----')))
                throw new Error();
            const transit = new openbao_transit_js_1.OpenBaoTransit({ address: this.address, ca, token: () => this.checkedToken(role, ca) });
            if (role !== 'writer')
                return { transit };
            if (!this.retention || !/^\d+$/.test(this.retention))
                throw new Error();
            const retentionSeconds = Number(this.retention);
            if (!Number.isSafeInteger(retentionSeconds) || retentionSeconds < 1 || retentionSeconds > 2147483647)
                throw new Error();
            return { transit, retentionSeconds };
        }
        catch {
            throw new common_1.ServiceUnavailableException('Chat custody configuration unavailable');
        }
    }
};
exports.CryptoCustodyConfig = CryptoCustodyConfig;
exports.CryptoCustodyConfig = CryptoCustodyConfig = __decorate([
    (0, common_1.Injectable)()
], CryptoCustodyConfig);
let CryptoCustodyModule = class CryptoCustodyModule {
};
exports.CryptoCustodyModule = CryptoCustodyModule;
exports.CryptoCustodyModule = CryptoCustodyModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ providers: [CryptoCustodyConfig, { provide: lobby_cipher_js_1.LOBBY_CUSTODY, inject: [CryptoCustodyConfig], useFactory: (config) => config.custody('lobby') }, { provide: crypto_reports_service_js_1.REPORT_CUSTODY, inject: [CryptoCustodyConfig], useFactory: (config) => config.custody('writer') }, { provide: crypto_reports_service_js_1.REPORT_READER, inject: [CryptoCustodyConfig], useFactory: (config) => config.custody('reader') }], exports: [lobby_cipher_js_1.LOBBY_CUSTODY, crypto_reports_service_js_1.REPORT_CUSTODY, crypto_reports_service_js_1.REPORT_READER] })
], CryptoCustodyModule);
//# sourceMappingURL=crypto-custody.module.js.map