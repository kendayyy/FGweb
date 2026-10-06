import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {RoomSchema,createPageSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try{
 const client=await h.pool.connect();try{
  await client.query('BEGIN');
  for(let i=0;i<51;i++){
   const id=randomUUID(),conv=randomUUID();await client.query("INSERT INTO conversations(id,kind) VALUES($1,'ROOM')",[conv]);
   await client.query("INSERT INTO rooms(id,name,game_id,owner_id,owner_role,visibility,invite_policy,player_capacity,conversation_id,conversation_kind,created_at,updated_at) VALUES($1,$2,$3,'native-a','OWNER','PRIVATE','OWNER_APPROVAL',5,$4,'ROOM',clock_timestamp(),clock_timestamp())",[id,`Paging room ${i}`,h.games[0].id,conv]);
   await client.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'native-a','OWNER')",[randomUUID(),id]);
  }
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 const a=await h.context('native-a');const res=await a.request.get(`${h.base}/api/v1/rooms/own?limit=50`);assert.equal(res.status(),200);
 const first=createPageSchema(RoomSchema).parse(await res.json());assert.equal(first.items.length,50);assert.equal(first.hasMore,true);
 const secondRes=await a.request.get(`${h.base}/api/v1/rooms/own?limit=50&cursor=${encodeURIComponent(first.nextCursor)}`);assert.equal(secondRes.status(),200);
 const second=createPageSchema(RoomSchema).parse(await secondRes.json());assert.equal(second.items.length,1);
 p=await a.newPage();await p.goto(`${h.base}/rooms`);
 const earlier=p.getByRole('button',{name:new RegExp(`^${first.items[0].name}\\b`)});await expect(earlier).toBeVisible();
 await p.getByRole('button',{name:'Tải thêm phòng',exact:true}).click();
 const later=p.getByRole('button',{name:new RegExp(`^${second.items[0].name}\\b`)});await expect(later).toBeVisible();
 await expect(earlier).toHaveCount(1);await later.click();await expect(p.getByRole('heading',{name:second.items[0].name,exact:true})).toBeVisible();
 await earlier.click();await expect(p.getByRole('heading',{name:first.items[0].name,exact:true})).toBeVisible();
 await p.screenshot({path:`${shots}/paging.png`,fullPage:true});console.log(JSON.stringify({realApi:true,realPostgres:true,checks:['51 actual own rooms','opaque cursor second page','load more retains earlier rooms','select room on both pages'],screenshots:shots}));
}catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned paging browser fixture cleaned.');}
