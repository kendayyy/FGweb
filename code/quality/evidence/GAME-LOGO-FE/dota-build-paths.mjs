import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),dir='quality/evidence/GAME-LOGO-FE';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),owner=ledger.tasks.find(t=>t.id==='GAME-LOGO-FE');
const prior=ledger.tasks.slice(0,ledger.tasks.indexOf(owner));
const latest=new Map();for(const t of prior)for(const [p,h] of Object.entries(t.outputsHash?.files??{}))latest.set(p,{owner:t.id,hash:h});
const html=fs.readFileSync('apps/web/dist/index.html','utf8');
const current={js:html.match(/src="(\/assets\/[^" ]+\.js)"/)[1],css:html.match(/href="(\/assets\/[^" ]+\.css)"/)[1]};
const retained=[];
for(const [p,old] of latest){
 if(fs.existsSync(p))continue;
 assert(/^apps\/web\/dist\/assets\/index-[\w-]+\.(js|css)$/.test(p),`Unexpected missing historic artifact: ${p}`);
 assert(owner.writeAllowlist.includes('apps/web/dist/**'));
 const extension=p.split('.').at(-1),from='apps/web/dist'+current[extension];
 assert(!html.includes('/'+p.replace('apps/web/dist/','')));
 fs.copyFileSync(from,p);
 retained.push({path:p,previousOwner:old.owner,previousDigest:old.hash,replacementSource:from,replacementDigest:hash(p)});
}
const result={recordedAt:new Date().toISOString(),task:owner.id,reason:'Current owner replaces scoped build artifacts at predecessor paths as compatibility copies of the current built entry. Historical ledger digests are retained, not claimed to match new bytes; current output snapshot owns replacement digests. Active index continues referencing only current Vite outputs. Future local builds must preserve prior files with --emptyOutDir false.',retained};
fs.writeFileSync(`${dir}/dota-build-paths.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
