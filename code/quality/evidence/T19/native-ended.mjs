import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {RoomSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try{
 const a=await h.context('native-a');const create=await a.request.post(`${h.base}/api/v1/rooms`,{headers:{Origin:h.base},data:{name:'Permanent room after playing',gameId:h.games[0].id,gameTitle:h.games[0].title}});assert.equal(create.status(),200);const room=RoomSchema.parse(await create.json());
 const send=await a.request.post(`${h.base}/api/v1/conversations/${room.conversationId}/messages`,{headers:{Origin:h.base},data:{content:'History remains after end',clientMessageId:randomUUID()}});assert.equal(send.status(),201);
 const session=randomUUID();await h.pool.query("INSERT INTO play_sessions(id,room_id,host_user_id,player_capacity,timing_type,state) VALUES($1,$2,'native-a',5,'now','ACTIVE')",[session,room.id]);
 p=await a.newPage();await p.goto(`${h.base}/rooms/${room.id}`);await expect(p.getByText('History remains after end',{exact:true})).toBeVisible();
 await h.pool.query("UPDATE play_sessions SET state='ENDED',updated_at=clock_timestamp() WHERE id=$1",[session]);
 await p.reload();await expect(p.getByRole('heading',{name:room.name,exact:true})).toBeVisible();await expect(p.getByText('History remains after end',{exact:true})).toBeVisible();
 assert.equal((await h.pool.query('SELECT state FROM play_sessions WHERE id=$1',[session])).rows[0].state,'ENDED');
 assert.equal((await h.pool.query('SELECT user_id FROM room_members WHERE room_id=$1',[room.id])).rows[0].user_id,'native-a');
 await p.screenshot({path:`${shots}/ended-retains-room.png`,fullPage:true});console.log(JSON.stringify({realApi:true,realPostgres:true,checks:['persisted ACTIVE then ENDED session','permanent membership retained','reload room and chat retained'],screenshots:shots}));
}catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned ended-session browser fixture cleaned.');}
