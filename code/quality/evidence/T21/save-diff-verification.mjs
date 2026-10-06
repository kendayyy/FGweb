import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir='quality/evidence/T21',r=JSON.parse(fs.readFileSync(`${dir}/codex-diff-final-1.json`));assert.equal(r.exitCode,0);
const p='quality/tasks.json',l=JSON.parse(fs.readFileSync(p)),t=l.tasks.find(t=>t.id==='T21');assert.equal(t.status,'BLOCKED');t.commands.push(r);t.evidencePaths.push(r.evidencePath);fs.writeFileSync(p,JSON.stringify(l,null,2)+'\n');
const f=`${dir}/component-verification.json`,v=JSON.parse(fs.readFileSync(f));v.checks.push(r);fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
