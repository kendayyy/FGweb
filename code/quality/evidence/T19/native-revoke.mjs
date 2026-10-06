import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {RoomSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try {
 const a=await h.context('native-a'), b=await h.context('native-b');
 const created=await a.request.post(`${h.base}/api/v1/rooms`,{headers:{Origin:h.base},data:{name:'Membership private room',gameId:h.games[0].id,gameTitle:h.games[0].title,visibility:'PRIVATE'}});
 assert.equal(created.status(),200);const room=RoomSchema.parse(await created.json());
 await h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'native-b','MEMBER')",[randomUUID(),room.id]);
 const content=`Private fixture before revoke ${randomUUID()}`;
 const sent=await a.request.post(`${h.base}/api/v1/conversations/${room.conversationId}/messages`,{headers:{Origin:h.base},data:{content,clientMessageId:randomUUID()}});assert.equal(sent.status(),201);
 p=await b.newPage();await p.goto(`${h.base}/rooms/${room.id}`);await expect(p.getByText(content,{exact:true})).toBeVisible({timeout:15000});
 const removed=await a.request.delete(`${h.base}/api/v1/rooms/${room.id}/members/native-b`,{headers:{Origin:h.base}});assert.equal(removed.status(),200);
 const denied=p.waitForResponse(r=>r.url().endsWith(`/api/v1/rooms/${room.id}`)&&r.request().method()==='GET');
 // Standard browser visibility event revalidates existing TanStack stale queries without a page reload.
 await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 assert.equal((await denied).status(),403,'Server confirms completed membership revocation');
 await expect(p.getByText(content,{exact:true})).toHaveCount(0,{timeout:10000});
 await expect(p.getByRole('alert')).toContainText(/không có quyền/i);
 await expect(p.getByRole('textbox',{name:/tin nhắn|nhắn vào/i})).toHaveCount(0);
 await p.screenshot({path:`${shots}/revoked.png`,fullPage:true});
 console.log(JSON.stringify({realCompiledApi:true,realBuiltWeb:true,realPostgres:true,checks:['Existing displayed private history clears after real membership removal and GET403 revalidation; composer gone'],screenshots:shots}));
} catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned membership-revocation browser fixture cleaned.');}
