import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import ts from 'typescript';
const d='quality/evidence/T30',proposal=d+'/antigravity-public-profile-query-1',out=d+'/public-profile-query-final-patch1',h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');fs.mkdirSync(out);
const src=fs.readFileSync(proposal+'/profiles.service.ts','utf8'),orig=fs.readFileSync('apps/api/src/modules/profiles/profiles.service.ts','utf8');function methods(s){const f=ts.createSourceFile('s.ts',s,ts.ScriptTarget.Latest,true);const c=f.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='ProfilesService');assert(c);return new Map(c.members.map(m=>[m.name?.getText(f)??m.kind,m.getText(f).replaceAll('\r\n','\n')]));}const a=methods(orig),b=methods(src);assert.deepEqual([...a.keys()],[...b.keys()]);const changed=[...a.keys()].filter(k=>a.get(k)!==b.get(k));assert.deepEqual(changed,['getPublicProfile']);
fs.writeFileSync(out+'/profiles.service.ts',src,{flag:'wx'});let test=fs.readFileSync(proposal+'/t30-public-profile-query.integration.spec.ts','utf8');
const start=test.indexOf('  afterAll(async () => {'),end=test.indexOf("  it('fetches normal",start);assert(start>0&&end>start);
test=test.slice(0,start)+`  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      try { await service?.onModuleDestroy(); } catch (error) { errors.push(error); }
      try {
        if (created) {
          expect(owned).toMatch(/^t30_profile_[a-f0-9]{32}$/);
          await pool.query(\`DROP SCHEMA "\${owned}" CASCADE\`);
          expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [owned])).rowCount).toBe(0);
        }
      } catch (error) { errors.push(error); }
    } finally {
      if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
      else delete process.env.DATABASE_URL;
      pg.Client.prototype.query = originalClientQuery;
      try { await pool?.end(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Owned public-profile query cleanup failed');
  });

`+test.slice(end);
test=test.replaceAll('const parsed: ProfileDTO = PublicProfileSchema.parse(result);','const parsed: ProfileDTO = PublicProfileSchema.parse(result);\n    expect(result).toStrictEqual(parsed);');
fs.writeFileSync(out+'/t30-public-profile-query.integration.spec.ts',test,{flag:'wx'});
const sandbox=d+'/profile-type-sandbox-1';fs.mkdirSync(sandbox);fs.cpSync('apps/api/src',sandbox+'/src',{recursive:true});fs.writeFileSync(sandbox+'/src/modules/profiles/profiles.service.ts',src);fs.writeFileSync(sandbox+'/tsconfig.json',JSON.stringify({extends:path.resolve('apps/api/tsconfig.json'),compilerOptions:{noEmit:true,incremental:false,baseUrl:path.resolve('apps/api'),outDir:path.resolve(sandbox+'/dist')},include:['src/**/*']},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(d+'/public-profile-query-round1-review.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',sourceBeforeSha256:h('apps/api/src/modules/profiles/profiles.service.ts'),proposalSourceSha256:h(out+'/profiles.service.ts'),onlyChangedMethod:changed,unchangedOtherMethods:a.size-1,testSnapshotSha256:h(proposal+'/t30-public-profile-query.integration.spec.ts'),reviewedTestSha256:h(out+'/t30-public-profile-query.integration.spec.ts'),reviewFixes:['No swallowed destroy/drop/pool errors; always restore pg/env and attempt full owned cleanup, propagate AggregateError.','Strict result equals parsed public contract to catch unknown/private output fields.'],installedDrizzleNullableJoinMappingInspected:true,sourceAdoptionPending:true,antigravityCompletionTrackedSeparately:true,nativeAcceptance:false},null,2)+'\n',{flag:'wx'});console.log('Only public-profile method changed; reviewed test cleanup/contracts, sandbox prepared.');
