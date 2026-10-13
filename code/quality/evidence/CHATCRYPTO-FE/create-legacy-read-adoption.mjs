import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('quality/evidence/CHATCRYPTO-FE/adopt-index-stage.mjs','utf8');
const old=".find(p=>Object.entries(JSON.parse(fs.readFileSync(p,'utf8')).buildHashes).every(([file,sha])=>hash(file)===sha))";
assert(source.includes(old));
const next=".filter(p=>JSON.parse(fs.readFileSync(p,'utf8')).actualLegacyRecoveredDeviceHistory===true).sort((a,b)=>JSON.parse(fs.readFileSync(b,'utf8')).recordedAt.localeCompare(JSON.parse(fs.readFileSync(a,'utf8')).recordedAt)).find(p=>Object.entries(JSON.parse(fs.readFileSync(p,'utf8')).buildHashes).every(([file,sha])=>hash(file)===sha))";
fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/adopt-legacy-read-stage.mjs',source.replace(old,next),{flag:'wx'});
