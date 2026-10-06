import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {RoomSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try{
 const a=await h.context('native-a'),b=await h.context('native-b');
 const created=await a.request.post(`${h.base}/api/v1/rooms`,{headers:{Origin:h.base},data:{name:'Reconnect fixture room',gameId:h.games[0].id,gameTitle:h.games[0].title,visibility:'PRIVATE'}});assert.equal(created.status(),200);
 const room=RoomSchema.parse(await created.json());
 await h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'native-b','MEMBER')",[randomUUID(),room.id]);
 const sent=await a.request.post(`${h.base}/api/v1/conversations/${room.conversationId}/messages`,{headers:{Origin:h.base},data:{content:'Before disconnect anchor',clientMessageId:randomUUID()}});assert.equal(sent.status(),201);
 p=await b.newPage();await p.goto(`${h.base}/rooms/${room.id}`);await expect(p.getByText('Before disconnect anchor',{exact:true})).toBeVisible();
 await expect(p.getByText('● Trực tuyến',{exact:true})).toBeVisible();await b.setOffline(true);await expect(p.getByText('○ Ngoại tuyến',{exact:true})).toBeVisible();
 // Explicit owned PostgreSQL fixtures: persisted history while viewer is offline, beyond one 50-row page.
 for(let i=1;i<=75;i++)await h.pool.query("INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id,created_at) VALUES($1,$2,'native-a',$3,$4,clock_timestamp())",[randomUUID(),room.conversationId,`Offline gap ${i}`,randomUUID()]);
 await b.setOffline(false);await expect(p.getByText('● Trực tuyến',{exact:true})).toBeVisible({timeout:20000});
 await expect(p.getByText('Offline gap 1',{exact:true})).toHaveCount(1,{timeout:15000});
 await expect(p.getByText('Offline gap 75',{exact:true})).toHaveCount(1);await expect(p.getByText('Before disconnect anchor',{exact:true})).toHaveCount(1);
 const live=await a.request.post(`${h.base}/api/v1/conversations/${room.conversationId}/messages`,{headers:{Origin:h.base},data:{content:'Real socket after recovery',clientMessageId:randomUUID()}});assert.equal(live.status(),201);
 await expect(p.getByText('Real socket after recovery',{exact:true})).toHaveCount(1,{timeout:15000});
 await p.screenshot({path:`${shots}/reconnect.png`,fullPage:true});
 console.log(JSON.stringify({realCompiledApi:true,realBuiltWeb:true,realPostgres:true,realWebSocket:true,checks:['offline/online actual socket','75 persisted missing messages recovered across pages','anchor retained','exactly one live event'],screenshots:shots}));
}catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned reconnect browser fixture cleaned.');}
