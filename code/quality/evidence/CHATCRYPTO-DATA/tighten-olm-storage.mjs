import fs from 'node:fs';
import assert from 'node:assert/strict';
const file='packages/database/src/schema/chat-crypto.ts';let source=fs.readFileSync(file,'utf8');
const start=source.indexOf("check('chat_crypto_to_device_cipher_check',sql`");const end=source.indexOf('`),index(',start);assert(start>=0&&end>start);
source=source.slice(0,start)+"check('chat_crypto_to_device_cipher_check',sql`chat_crypto_valid_olm(${t.content})"+source.slice(end);fs.writeFileSync(file,source);
const deviceFile='packages/database/src/schema/chat-crypto-devices.ts';source=fs.readFileSync(deviceFile,'utf8');
const keyStart=source.indexOf("check('chat_crypto_otk_public_only_check',sql`");const keyEnd=source.indexOf('`),index(',keyStart);assert(keyStart>=0&&keyEnd>keyStart);
source=source.slice(0,keyStart)+"check('chat_crypto_otk_public_only_check',sql`${t.keyId} ~ '^signed_curve25519:[A-Za-z0-9_.-]+$' AND chat_crypto_valid_one_time_key(${t.signedKey})"+source.slice(keyEnd);fs.writeFileSync(deviceFile,source);
console.log('Route durable Olm and signed one-time key JSON through strict guards.');
