import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const file='../.doc/01-product-spec.md',hash=b=>createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')).hashes.specSha256.toLowerCase();
const original=fs.readFileSync(file);
assert.equal(hash(original),'e09cb0b7dc0953436f9b81b8221610f9b8fc0c7352e1df52a94822071fdeb2cf','External content changed again; preserve it');
const restored=Buffer.from(original.toString('utf8').replace('Ngày cập nhật: 07/10/2026.','Ngày cập nhật: 04/10/2026.'),'utf8');
assert.equal(hash(restored),baseline,'Only restore when the exact approved original bytes are recovered');
// Explicit user decision: “Khôi phục ngày gốc và tiếp tục (đề xuất)”.
fs.writeFileSync(file,restored);assert.equal(hash(fs.readFileSync(file)),baseline);
console.log('User-authorized spec date restoration; exact frozen baseline SHA recovered:',baseline);
