import assert from 'node:assert/strict';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();
try{
 const guest=await h.context(null); const page=await guest.newPage();
 await page.goto(h.base); await page.getByRole('heading',{name:/Lobby.*Liên Minh/}).waitFor();
 const a=await h.context('native-a'); const p=await a.newPage();await p.goto(h.base);
 const me=await p.request.get(`${h.base}/api/v1/me`); assert.equal(me.status(),200);
 const data=await me.json(); assert.equal(data.id,'native-a');
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM "user"')).rows[0].n,3);
 console.log(JSON.stringify({realCompiledApi:true,realBuiltWeb:true,realPostgres:true,syntheticActors:3,authenticatedMe:true,scope:'Fixture/setup smoke only; does not establish T17-FE behavior.'}));
}finally{await h.cleanup(); console.log('Owned harness cleaned.');}
