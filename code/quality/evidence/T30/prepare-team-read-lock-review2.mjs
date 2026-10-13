import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const dir='quality/evidence/T30',proposal=dir+'/antigravity-team-read-lock-review-1',sandbox=dir+'/team-read-lock-type-sandbox-2';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const entries=[['teams','TeamsService',['room','play','snapshot']],['play-sessions','PlaySessionsService',['play','context','requests']]];
function methods(text,name){const f=ts.createSourceFile('s.ts',text,ts.ScriptTarget.Latest,true);const c=f.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text===name);assert(c);return new Map(c.members.map(m=>[m.name?.getText(f)??m.kind,m.getText(f).replaceAll('\r\n','\n')]));}
const reviews=[];
assert(!fs.existsSync(sandbox));
for(const [module,name,expected] of entries){
 const before='apps/api/src/modules/'+module+'/'+module+'.service.ts',after=proposal+'/'+module+'.service.ts';
 const a=methods(fs.readFileSync(before,'utf8'),name),b=methods(fs.readFileSync(after,'utf8'),name);
 assert.deepEqual([...a.keys()],[...b.keys()]);
 const changed=[...a.keys()].filter(k=>a.get(k)!==b.get(k));assert.deepEqual(changed,expected);
 const text=fs.readFileSync(after,'utf8');assert(!text.includes('${mode}'));assert(text.includes("mode==='FOR SHARE'?'FOR SHARE':'FOR UPDATE'"));
 reviews.push({before,after,beforeSha256:hash(before),afterSha256:hash(after),changedMethods:changed,unchangedOtherMethods:a.size-changed.length});
}
fs.mkdirSync(sandbox);fs.cpSync('apps/api/src',sandbox+'/src',{recursive:true});
for(const [module] of entries)fs.copyFileSync(proposal+'/'+module+'.service.ts',sandbox+'/src/modules/'+module+'/'+module+'.service.ts');
fs.writeFileSync(sandbox+'/tsconfig.json',JSON.stringify({extends:path.resolve('apps/api/tsconfig.json'),compilerOptions:{noEmit:true,incremental:false,baseUrl:path.resolve('apps/api'),outDir:path.resolve(sandbox+'/dist')},include:['src/**/*']},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(dir+'/team-read-lock-round2-source-review.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',reviews,boundedPrivateLockClauses:true,sourceAdoptionPending:true,fixtureReviewPending:true,antigravityCompletionTrackedSeparately:true,nativeAcceptance:false},null,2)+'\n',{flag:'wx'});
console.log('Verified only six private/read methods changed; unchanged application source; sandbox prepared.');
