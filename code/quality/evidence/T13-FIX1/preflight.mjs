import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')),index=ledger.tasks.findIndex(t=>t.id==='T13-FIX1');
const mount='apps/web/src/features/lobby/LobbyPage.tsx',pending=fs.readFileSync(mount);
const expected=ledger.tasks.slice(0,index).flatMap(t=>Object.entries(t.outputsHash?.files??{})).filter(([f])=>f===mount).at(-1)[1].toLowerCase();
const original=execFileSync('git',['show','HEAD:code/'+mount],{encoding:'utf8'});
const reversed=pending.toString('utf8').replace(/import \{ OnlineUsers \} from '\.\/OnlineUsers\.js';\r?\n/,'').replace(/<OnlineUsers[^>]*\/>/,'<div className="fg-online-intro"><h2>Cộng đồng</h2><p>Cùng trò chuyện trong Lobby để tìm bạn chơi.</p></div>');
const candidates=[Buffer.from(original),Buffer.from(original.replaceAll('\r\n','\n').replaceAll('\n','\r\n')),Buffer.from(reversed)];
const match=candidates.find(bytes=>createHash('sha256').update(bytes).digest('hex')===expected);assert(match,'Exact predecessor bytes not found');
try {fs.writeFileSync(mount,match);execFileSync('node',['quality/evidence/T13-FIX1/record-check.mjs','preflight','node','scripts/verify-task.mjs','T13-FIX1','apps/web/test/lobby.test.tsx'],{stdio:'inherit'});} finally {fs.writeFileSync(mount,pending);}
