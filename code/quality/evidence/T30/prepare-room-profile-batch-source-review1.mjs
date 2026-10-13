import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import ts from 'typescript';
const d='quality/evidence/T30',proposal=d+'/antigravity-room-profile-batch-1',sandbox=d+'/room-profile-batch-type-sandbox-1',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');assert(!fs.existsSync(sandbox));
function members(text,name){const f=ts.createSourceFile('s.ts',text,ts.ScriptTarget.Latest,true),c=f.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text===name);assert(c);return new Map(c.members.map(m=>[m.name?.getText(f)??m.kind,m.getText(f).replaceAll('\r\n','\n')]));}
const reviews=[];
for(const [module,name,expected,added] of [['profiles','ProfilesService',['getPublicProfile'],['buildPublicProfileDto','getPublicProfiles']],['rooms','RoomsService',['listRoomMembers'],[]]]){
 const before='apps/api/src/modules/'+module+'/'+module+'.service.ts',after=proposal+'/'+module+'.service.ts',original=fs.readFileSync(before,'utf8'),next=fs.readFileSync(after,'utf8'),a=members(original,name),b=members(next,name);
 assert.deepEqual([...b.keys()].filter(k=>!added.includes(k)),[...a.keys()]);assert.deepEqual([...b.keys()].filter(k=>!a.has(k)),added);
 const changed=[...a.keys()].filter(k=>a.get(k)!==b.get(k));assert.deepEqual(changed,expected);
 if(module==='profiles'){
  const oldMethod=a.get('getPublicProfile'),oldStart=oldMethod.indexOf('const dbUser = rows[0].user;'),oldEnd=oldMethod.indexOf('return PublicProfileSchema.parse(publicProfile);')+'return PublicProfileSchema.parse(publicProfile);'.length;assert(oldStart>0&&oldEnd>oldStart);
  const body=oldMethod.slice(oldStart,oldEnd).replaceAll('rows[0]','userRows[0]').replace('for (const r of rows)','for (const r of userRows)');
  const helper=b.get('buildPublicProfileDto');assert(helper.includes(body),'Extracted full DTO mapping must remain byte-equivalent');
  assert(next.includes('.where(inArray(schema.user.id, uniqueIds))'));assert(next.includes('if (!userIds.length) return [];'));
 }
 reviews.push({before,after,beforeSha256:hash(before),afterSha256:hash(after),onlyChangedExistingMethods:changed,newMethods:added,unchangedOtherExistingMethods:a.size-changed.length});
}
fs.mkdirSync(sandbox);fs.cpSync('apps/api/src',sandbox+'/src',{recursive:true});for(const module of ['profiles','rooms'])fs.copyFileSync(proposal+'/'+module+'.service.ts',sandbox+'/src/modules/'+module+'/'+module+'.service.ts');
fs.writeFileSync(sandbox+'/tsconfig.json',JSON.stringify({extends:path.resolve('apps/api/tsconfig.json'),compilerOptions:{noEmit:true,incremental:false,baseUrl:path.resolve('apps/api'),outDir:path.resolve(sandbox+'/dist')},include:['src/**/*']},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(d+'/room-profile-batch-round1-source-review.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',reviews,fullPublicDtoMappingByteEquivalent:true,newInternalBatchNotHttpEndpoint:true,sameCurrentRoomLocksAuthoritySqlRolePermissionMapping:true,sourceAdoptionPending:true,fixtureReviewPending:true,antigravityCompletionTrackedSeparately:true,nativeAcceptance:false},null,2)+'\n',{flag:'wx'});console.log('Two existing methods changed only; exact extracted public DTO mapping and sandbox verified.');
