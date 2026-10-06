import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const own='quality/evidence/T18/fresh-repair-refactor1-snapshot.json';
const allowed=new Set(['apps/api/src/modules/rooms/rooms.service.ts']);
const list=()=>execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(f=>f&&!allowed.has(f)&&f!==own&&!f.startsWith('quality/evidence/T18/fresh-repair-run')&&!f.startsWith('quality/evidence/T18/fresh-repair-error')&&!f.startsWith('quality/evidence/T18/fresh-repair-exit'));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const docs=execFileSync('rg',['--files','../.agents/rules','../.doc'],{encoding:'utf8'}).trim().split(/\r?\n/).concat(['../AGENTS.md']);
if(process.argv[2]==='capture') { assert(!fs.existsSync(own));fs.writeFileSync(own,JSON.stringify(Object.fromEntries([...list(),...docs].map(f=>[f,hash(f)])),null,2)+'\n');console.log('Captured readonly repair hashes'); }
else { const old=JSON.parse(fs.readFileSync(own));const current=[...list(),...docs];const extra=current.filter(f=>!(f in old));assert.deepEqual(extra,[],'Unexpected new files');for(const [f,h]of Object.entries(old))assert.equal(hash(f),h,`Readonly repair file changed: ${f}`);console.log(`PASS: ${Object.keys(old).length} readonly file hashes unchanged`); }

