import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {RoomSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try{
 const a=await h.context('native-a'),b=await h.context('native-b');const create=await a.request.post(`${h.base}/api/v1/rooms`,{headers:{Origin:h.base},data:{name:'Send revoked private room',gameId:h.games[0].id,gameTitle:h.games[0].title,visibility:'PRIVATE'}});assert.equal(create.status(),200);const room=RoomSchema.parse(await create.json());
 await h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'native-b','MEMBER')",[randomUUID(),room.id]);
 const content=`Private reply history ${randomUUID()}`;const sent=await a.request.post(`${h.base}/api/v1/conversations/${room.conversationId}/messages`,{headers:{Origin:h.base},data:{content,clientMessageId:randomUUID()}});assert.equal(sent.status(),201);
 p=await b.newPage();await p.goto(`${h.base}/rooms/${room.id}`);await expect(p.getByText(content,{exact:true})).toBeVisible();
 await p.getByRole('button',{name:'Trả lời tin nhắn của Nam',exact:true}).click();await expect(p.getByRole('button',{name:'Hủy trả lời',exact:true})).toBeVisible();
 // Owned SQL fixture removes membership without sending a proactive socket disconnect, isolating the POST ACL path.
 const removed=await h.pool.query("DELETE FROM room_members WHERE room_id=$1 AND user_id='native-b'",[room.id]);assert.equal(removed.rowCount,1);
 await p.getByRole('textbox',{name:'Tin nhắn phòng',exact:true}).fill('Send denied after removal');
 const denied=p.waitForResponse(r=>r.url().endsWith(`/conversations/${room.conversationId}/messages`)&&r.request().method()==='POST');await p.getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();assert.equal((await denied).status(),403);
 await expect(p.getByText(content,{exact:true})).toHaveCount(0,{timeout:10000});await expect(p.getByRole('button',{name:'Hủy trả lời',exact:true})).toHaveCount(0);await expect(p.getByRole('textbox',{name:'Tin nhắn phòng',exact:true})).toHaveCount(0);
 await expect(p.getByRole('alert')).toContainText(/không có quyền/i);
 await p.screenshot({path:`${shots}/send-revoked.png`,fullPage:true});console.log(JSON.stringify({realApi:true,realPostgres:true,checks:['actual send403 after persisted membership removal fixture','history and reply cleared','composer removed','permission alert'],screenshots:shots}));
}catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned send-revocation browser fixture cleaned.');}
