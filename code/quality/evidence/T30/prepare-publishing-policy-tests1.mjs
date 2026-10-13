import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',draft=d+'/antigravity-publishing-fresh-policy-1/t30-publishing-fresh-policy.integration.spec.ts';
let text=fs.readFileSync(draft,'utf8');const replace=(from,to)=>{assert(text.includes(from),from.slice(0,100));text=text.replace(from,to);};
replace("  beforeEach(() => {\n    observedUpdates = [];\n  });",`  beforeEach(async () => {
    observedUpdates = [];
    await pool.query('DELETE FROM rooms');
    await pool.query("DELETE FROM conversations WHERE kind='ROOM'");
    await pool.query("UPDATE session SET expires_at=now()+interval '1 day'");
  });`);
replace("      await client.query('COMMIT');\n      return { roomId, callId, ownerId: 'owner', peer1, peer2 };",`      await client.query('COMMIT');
      await client.query('BEGIN');
      await client.query("SET LOCAL TIME ZONE 'UTC'");
      await client.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[roomId]);
      await client.query('SELECT id FROM call_groups WHERE id=$1 FOR UPDATE',[callId]);
      return { roomId, callId, ownerId: 'owner', peer1, peer2 };`);
text=text.replaceAll('        client.release();',"        await client.query('ROLLBACK');client.release();");
replace('    cleanup.envRestored = process.env.DATABASE_URL === originalDbUrl;',"    cleanup.envRestored = JSON.stringify(Object.entries(process.env).sort()) === JSON.stringify(Object.entries(savedEnv).sort());");
replace("    if (errors.length) {\n      throw new AggregateError(errors, 'Publishing fresh policy teardown failed');\n    }",`    for(const key of ['schemaRemoved','poolEnded','prototypesRestored','envRestored','appClosed'] as const) expect(cleanup[key]).toBe(true);
    if (errors.length) throw new AggregateError(errors, 'Publishing fresh policy teardown failed');`);
// Deliberately unsafe old flags make every matrix case require a correction, including empty-source policy.
replace("          // Invoke reconcileWithin with peer\n          await publishingService.reconcileWithin",`          peerInfo.permission!.canPublishData=true;
          peerInfo.permission!.canUpdateMetadata=true;
          peerInfo.permission!.canSubscribe=false;
          // Invoke reconcileWithin with peer
          await publishingService.reconcileWithin`);
replace('          expect(observedUpdates[0].permission.canPublishSources).toEqual(expectedSources);',`          expect(observedUpdates[0].permission).toEqual({canSubscribe:true,canPublish:expectedCanPublish,canPublishSources:expectedSources,canPublishData:false,canUpdateMetadata:false});`);
replace("      const client1 = await pool.connect();\n      const client2 = await pool.connect();",`      const client1 = await pool.connect();
      const secondPool = new pg.Pool({connectionString:dbUrl,max:1,connectionTimeoutMillis:5000,statement_timeout:15000});
      const client2 = await secondPool.connect();`);
replace("        observedUpdates = [];\n        await publishingService.reconcileWithin(client2",`        // Commit own fixture, then acquire the same canonical locks on a distinct pool.
        await client1.query('COMMIT');
        await client2.query('BEGIN');
        await client2.query("SET LOCAL TIME ZONE 'UTC'");
        await client2.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[fixture.roomId]);
        await client2.query('SELECT id FROM call_groups WHERE id=$1 FOR UPDATE',[fixture.callId]);
        observedUpdates = [];
        await publishingService.reconcileWithin(client2`);
replace('        client1.release();\n        client2.release();',"        await client1.query('ROLLBACK');client1.release();\n        await client2.query('ROLLBACK');client2.release();\n        await secondPool.end();expect((secondPool as unknown as {ended:boolean}).ended).toBe(true);");
const start=text.indexOf("    it('RED-1:");const end=text.indexOf("    it('RED-2:",start);assert(start>0&&end>start);text=text.slice(0,start)+text.slice(end);
const tests=d+'/publishing-policy-tests1';fs.mkdirSync(tests);
fs.writeFileSync(tests+'/t30-publishing-fresh-policy.integration.spec.ts',text,{flag:'wx'});
let config=fs.readFileSync(d+'/frame-lease-policy-jest3.config.cjs','utf8').replaceAll('frame-lease-policy-tests3','publishing-policy-tests1').replaceAll('jest-frame-lease-policy3','jest-publishing-policy1');
fs.writeFileSync(d+'/publishing-policy-jest1.config.cjs',config,{flag:'wx'});
let runner=fs.readFileSync(d+'/run-frame-lease-policy3.mjs','utf8').replaceAll('frame-lease-policy-jest3','publishing-policy-jest1').replaceAll('frame-lease-policy-tests3/t30-frame-lease-policy.integration.spec.ts','publishing-policy-tests1/t30-publishing-fresh-policy.integration.spec.ts').replace("const names=['frame-lease-policy'];","const names=['publishing-fresh-policy'];");
fs.writeFileSync(d+'/run-publishing-policy1.mjs',runner,{flag:'wx'});
const recordedAt=new Date().toISOString();
fs.writeFileSync(d+'/publishing-policy-test-review1.json',JSON.stringify({recordedAt,draftSha256:createHash('sha256').update(fs.readFileSync(draft)).digest('hex'),reviewedSha256:createHash('sha256').update(text).digest('hex'),corrections:['Reset own fixtures between tests','Actual canonical room/group transaction locks','Require correction of all permission flags for empty policy case','Full environment comparison and actual cleanup flag assertions','Distinct pool and ordered transaction transfer','Remove implementation-existence test; behavioral query contracts only'],sourceAdopted:false,testsExecuted:false},null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — publishing policy test review '+recordedAt+': fixed-model proposal actualexit0; Codex fixes fixture active-seat isolation/session reset, actual canonical room/group locks, empty-policy oldflag correction/fullpermission parity, distinct actualpool and lock transfer, fullenv/cleanup assertions. Removes implementation-existence test, retains two real behavioral query contracts. Source draft extra SQL quote change rejected; no application adoption yet. Evidence code/quality/evidence/T30/publishing-policy-test-review1.json; actual RED pending/IN_PROGRESS/80priorPASS unchanged/no Anti2/no T31.\n');
console.log('Reviewed isolated publishing policy tests prepared; application source unchanged.');
