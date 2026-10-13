"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashFgPassword = hashFgPassword;
exports.verifyFgPassword = verifyFgPassword;
const node_crypto_1 = require("node:crypto");
const prefix = 'fgscrypt-v1';
const derive = (password, salt) => new Promise((resolve, reject) => {
    (0, node_crypto_1.scrypt)(password, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 }, (error, key) => error ? reject(error) : resolve(key));
});
async function hashFgPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(16).toString('hex'), key = await derive(password, salt);
    return `${prefix}:${salt}:${key.toString('hex')}`;
}
async function verifyFgPassword({ hash, password }) {
    const raw = hash.startsWith(`${prefix}:`), parts = hash.split(':');
    if (parts.length !== (raw ? 3 : 2))
        return false;
    const [salt, key] = raw ? parts.slice(1) : parts;
    if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(key))
        return false;
    const actual = await derive(raw ? password : password.normalize('NFKC'), salt);
    return (0, node_crypto_1.timingSafeEqual)(actual, Buffer.from(key, 'hex'));
}
//# sourceMappingURL=auth-password.js.map