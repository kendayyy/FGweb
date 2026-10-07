import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T00-REBASE-VISIBILITY2',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const commands=['audit-2','lint-1','diff-1'].map(l=>JSON.parse(fs.readFileSync(`${dir}/codex-${l}.json`)));for(const r of commands){assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
fs.appendFileSync(`${dir}/review.md`,'\nPASS: actual six-source/frozen historical evidence audit, lint and whitespace checks recorded exit0. No business source or test changed in this checkpoint.\n');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const evidence=walk(dir),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T00-REBASE-VISIBILITY2');
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands,evidencePaths:evidence,outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(['quality/spec-baseline.json','AGENTS.md',...evidence].map(f=>[f,hash(f)]))}});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');fs.appendFileSync('quality/spec-coverage.md','| Latest TEST-VISIBILITY-01 revision: headed real UI/E2E only; background DB/API allowed | T00-REBASE-VISIBILITY2 | six baselines/historic frozen audit;lint/diff | PASS (process only) |\n');
