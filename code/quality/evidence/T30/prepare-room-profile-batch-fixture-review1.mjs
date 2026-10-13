import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',p=d+'/antigravity-room-profile-batch-review-1/t30-room-profile-batch.integration.spec.ts';let s=fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
s=s.replace("      expect(writerPid).toBeTruthy();\n",'');s=s.replace('      const cleanupErrors: unknown[] = [];','      const cleanupErrors: unknown[] = [];\n      let testError: unknown;');s=s.replace('      try {\n        // Start listRoomMembers in background','      try {\n        expect(writerPid).toBeTruthy();\n        // Start listRoomMembers in background');
const start=s.indexOf('      } finally {\n        // Always release barrier');assert(start>0);const end=s.indexOf('\n    });',start);
s=s.slice(0,start)+`      } catch (error) {
        testError = error;
      } finally {
        releaseBarrier.resolve();
        pg.Client.prototype.query = originalClientQuery;
        // Settle the reader first so its held room lock is released before the writer.
        if (listPromise) {
          try { await awaitWithTimeout(listPromise, 3000, 'reader cleanup'); }
          catch (error) { cleanupErrors.push(error); }
        }
        if (writerPromise) {
          try { await awaitWithTimeout(writerPromise, 3000, 'writer cleanup'); }
          catch (error) { cleanupErrors.push(error); }
        }
        if (writerBegan && !writerCommitted) {
          try { await writerClient.query('ROLLBACK'); }
          catch (error) { cleanupErrors.push(error); }
        }
        try { writerClient.release(); }
        catch (error) { cleanupErrors.push(error); }
      }
      if (testError !== undefined || cleanupErrors.length) {
        throw new AggregateError([...(testError === undefined ? [] : [testError]), ...cleanupErrors],
          'Writer exclusion assertion or cleanup failed', { cause: testError });
      }`+s.slice(end);
s=s.replace("throw new AggregateError([seedErr, rbErr], 'Seed failed and rollback failed');","throw new AggregateError([seedErr, rbErr], 'Seed failed and rollback failed', { cause: seedErr });");
s=s.replace("      expect(ownerProfile.gameProfiles[0].rank).toBe('Radiant');",`      expect(ownerProfile.gameProfiles[0]).toMatchObject({ gameId: valorantGame.id,
        gameTitle: 'Valorant', inGameName: 'OwnerVal#123', rank: 'Radiant', role: 'Duelist',
        playHours: 500, playStyle: 'Aggressive' });`);
const dir=d+'/room-profile-batch-final-patch1';fs.mkdirSync(dir);fs.writeFileSync(dir+'/t30-room-profile-batch.integration.spec.ts',s,{flag:'wx'});
fs.mkdirSync(d+'/room-profile-batch-tests');const target=d+'/room-profile-batch-tests/t30-room-profile-batch.integration.spec.ts';fs.writeFileSync(target,s.replaceAll("'../src/modules/","'../../../../apps/api/src/modules/"),{flag:'wx'});
const config=fs.readFileSync(d+'/profile-query-jest.config.cjs','utf8').replaceAll('profile-query-tests','room-profile-batch-tests').replaceAll('jest-profile-query','jest-room-profile-batch');fs.writeFileSync(d+'/room-profile-batch-jest.config.cjs',config,{flag:'wx'});
const runner=fs.readFileSync(d+'/run-public-profile-query.mjs','utf8').replaceAll('public-profile-query','room-profile-batch').replaceAll('profile-query-jest','room-profile-batch-jest').replaceAll('profile-query-tests','room-profile-batch-tests');fs.writeFileSync(d+'/run-room-profile-batch.mjs',runner,{flag:'wx'});
const hash=x=>createHash('sha256').update(fs.readFileSync(x)).digest('hex');
for(const name of ['profiles','rooms'])assert.equal(hash(d+'/antigravity-room-profile-batch-1/'+name+'.service.ts'),hash(d+'/antigravity-room-profile-batch-review-1/'+name+'.service.ts'));
fs.writeFileSync(d+'/room-profile-batch-fixture-review-1.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',original:p,originalSha256:hash(p),patched:dir+'/t30-room-profile-batch.integration.spec.ts',patchedSha256:hash(dir+'/t30-room-profile-batch.integration.spec.ts'),testPath:target,testSha256:hash(target),sourceCopiesByteExact:true,changes:['Protect PID assertion inside try/finally','Settle reader and writer before rollback and release; bounded cleanup and AggregateError preserves original cause','Full game-field assertions','Seed rollback preserves caught cause'],actualExecutionPending:true},null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md',`\n- Coding and build 2 — T30 — revised batch fixture review ${new Date().toISOString()}: Agy review completed2026-10-11T00:16:02.414Z exit0, source copies byte-identical. Codex reviewed real SQL counter/structural adapter, fresh fixtures, NULL versus empty-avatar semantics, bare user, missing-order/invalid-catalog/session deletion and callback-aware Room-PID writer instrumentation. Before execution patched writer cleanup to settle actual reader/writer before rollback/release and propagate assertion plus cleanup causes; added full game fields, seed rollback cause. Evidence code/${d}/room-profile-batch-fixture-review-1.json; fixture lint/RED/GREEN pending, source unadopted,80priorPASS unchanged/IN_PROGRESS/no Anti2.\n`);
console.log('Reviewed fixture prepared; source unchanged.');
