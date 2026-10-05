import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const original=fs.readFileSync('apps/api/test/presence.integration.spec.ts','utf8');
let copy=original.replaceAll("'../src/","'../../../apps/api/src/").replaceAll("'./test-cookie-helper.js'","'../../../apps/api/test/test-cookie-helper.js'");
const extra=`
  it('Codex review: revoked session removes lease before TTL', async () => {
    const s = await connectPresenceSocket(base, cookieUser1);
    try {
      expect((await s.timeout(5000).emitWithAck('presence.subscribe', {conversationId:gameALobby})).ok).toBe(true);
      await pool.query('DELETE FROM "session" WHERE id=$1',['sess-1']);
      expect((await s.timeout(5000).emitWithAck('presence.heartbeat', {conversationId:gameALobby})).ok).toBe(false);
      const res=await request(base).get('/api/v1/games/'+gameAId+'/online').set('Origin',origin);
      expect(res.status).toBe(200);
      expect(res.body.items.some((u: {id:string})=>u.id==='user1')).toBe(false);
    } finally {
      s.disconnect();
      await pool.query(\`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('sess-1','user1','token-user1',now()+interval '1 day',now(),now()) ON CONFLICT DO NOTHING\`);
    }
  });
`;
const end=copy.lastIndexOf('});');assert(end>0);copy=copy.slice(0,end)+extra+copy.slice(end);
fs.writeFileSync('quality/evidence/T16/independent-review.spec.ts',copy);
const config=require('../../../apps/api/jest.config.js');
config.rootDir='../../..';config.testRegex='quality/evidence/T16/independent-review\\.spec\\.ts$';
config.moduleNameMapper['^@fg/database$']='<rootDir>/packages/database/dist/index.js';
config.moduleNameMapper['^@fg/contracts$']='<rootDir>/packages/contracts/dist/index.js';
config.cacheDirectory='<rootDir>/.cache/jest-t16-review';
fs.writeFileSync('quality/evidence/T16/independent-jest.config.cjs','module.exports='+JSON.stringify(config,null,2)+';\n');
console.log('Prepared isolated Codex review copy; original source/tests unchanged.');
