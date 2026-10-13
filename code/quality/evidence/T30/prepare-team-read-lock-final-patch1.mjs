import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',from=d+'/antigravity-team-read-lock-review-1',to=d+'/team-read-lock-final-patch1';assert(!fs.existsSync(to));fs.mkdirSync(to);
for(const name of ['teams.service.ts','play-sessions.service.ts'])fs.copyFileSync(from+'/'+name,to+'/'+name);
let test=fs.readFileSync(from+'/t30-team-read-lock.integration.spec.ts','utf8');
assert(test.includes("await db.query('ROLLBACK').catch(() => {});"));
test=test.replace("await db.query('ROLLBACK').catch(() => {});", "try { await db.query('ROLLBACK'); } catch (rollbackError) { throw new AggregateError([error, rollbackError], 'Fixture seed and rollback failed'); }");
test=test.replaceAll('await barrier.promise;',"await awaitWithTimeout(barrier.promise, 3000, 'controlled reader barrier release');");
const install='      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;\n\n      const writerClient = await pool.connect();';assert.equal(test.split(install).length-1,3);
test=test.replaceAll(install,'      const writerClient = await pool.connect();\n      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;');
const attach='        throw err;\n      });';assert.equal(test.split(attach).length-1,3);test=test.replaceAll(attach,attach+'\n      void apiPromise.catch(() => undefined);');
const freshStart=test.indexOf("  describe('Fresh Checks After Waiting");assert(freshStart>0);
let fresh=test.slice(freshStart);
const wrongPid='        if (!readerIntercepted) {';assert.equal(fresh.split(wrongPid).length-1,3);
fresh=fresh.replaceAll(wrongPid,"        const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';\n        if (!readerIntercepted && this !== blockerClient && queryText.includes('FROM rooms WHERE id=$1')) {");
fresh=fresh.replaceAll("readerPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);", "readerPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);\n        void readerPromise.catch(() => undefined);");
fresh=fresh.replaceAll("readerPromise = playSessionsService.requests('helper', 'sess-helper', fixture.playSessionId);", "readerPromise = playSessionsService.requests('helper', 'sess-helper', fixture.playSessionId);\n        void readerPromise.catch(() => undefined);");
fresh=fresh.replaceAll('await pool.query("UPDATE session', 'await blockerClient.query("UPDATE session').replaceAll("await pool.query('DELETE FROM room_members", "await blockerClient.query('DELETE FROM room_members").replaceAll("await pool.query('DELETE FROM permission_grants", "await blockerClient.query('DELETE FROM permission_grants");
test=test.slice(0,freshStart)+fresh;
// Add an independent play writer proof for the requests API, retaining the room proof.
const begin=test.indexOf("    it('playSessionsService.requests holds canonical FOR SHARE lock on room,"),end=test.indexOf("    it('teamsService.snapshot reader holds FOR SHARE on play_sessions",begin);assert(begin>0&&end>begin);
let extra=test.slice(begin,end).replace("holds canonical FOR SHARE lock on room, blocking independent writer FOR UPDATE", "holds canonical FOR SHARE lock on play, blocking independent play writer FOR UPDATE").replace(".query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [fixture.roomId])", ".query('SELECT id FROM play_sessions WHERE id=$1 FOR UPDATE', [fixture.playSessionId])").replace('requests room writer exclusion test','requests play writer exclusion test');assert(extra.includes(".query('SELECT id FROM play_sessions WHERE id=$1 FOR UPDATE', [fixture.playSessionId])"));test=test.slice(0,end)+extra+test.slice(end);
// A missing arbitrary ID is not evidence of deleting an existing session.
for(const [api,user] of [['teamsService.snapshot','member'],['playSessionsService.requests','owner']]){
 const marker=`        () => ${api}('${user}', 'sess-${user}', fixture.playSessionId),\n        401,\n        ErrorCode.LOGIN_REQUIRED,\n        'Session expired or revoked',\n      );`;
 const pos=test.indexOf(marker);assert(pos>0);const boundary=pos+marker.length;
 test=test.slice(0,boundary)+`\n      await pool.query("DELETE FROM session WHERE id='sess-${user}'");\n      await expectHttpError(\n        () => ${api}('${user}', 'sess-${user}', fixture.playSessionId),\n        401, ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked',\n      );`+test.slice(boundary);
}
fs.writeFileSync(to+'/t30-team-read-lock.integration.spec.ts',test,{flag:'wx'});
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(d+'/team-read-lock-final-patch1-review.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',sourceUnchangedFromRound2:true,proposalTestSha256:hash(from+'/t30-team-read-lock.integration.spec.ts'),reviewedTestSha256:hash(to+'/t30-team-read-lock.integration.spec.ts'),fixes:['Fresh reader PID captured only on actual room SQL excluding blocker client, writer commits revocation in its own transaction.','Immediate rejection handlers retain original API rejection without unhandled promises.','Reader barrier release bounded3000ms; failed seed rollback errors propagate.','Install query wrapper only after writer client acquired.','Add requests play-row writer exclusion; exact original reader PID required.','Actually delete existing sessions after expiry assertion.'],sourceAdoptionPending:true,executionPending:true},null,2)+'\n',{flag:'wx'});
console.log('Reviewed fixture correction snapshot prepared; application source unchanged.');
