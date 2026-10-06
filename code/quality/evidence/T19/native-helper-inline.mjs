import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {RoomSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try{
 const a=await h.context('native-a'),b=await h.context('native-b');const create=await a.request.post(`${h.base}/api/v1/rooms`,{headers:{Origin:h.base},data:{name:'Helper permissions room',gameId:h.games[0].id,gameTitle:h.games[0].title}});assert.equal(create.status(),200);const room=RoomSchema.parse(await create.json());
 for(const id of ['native-b','native-c'])await h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER')",[randomUUID(),room.id,id]);
 const grant=await a.request.patch(`${h.base}/api/v1/rooms/${room.id}/helpers/native-b`,{headers:{Origin:h.base},data:{permissions:['MANAGE_MEMBERS']}});assert.equal(grant.status(),200);
 p=await b.newPage();await p.goto(`${h.base}/rooms/${room.id}`);
 const modal=p.getByTestId('mobile-members-panel');await expect(modal).toBeVisible();
 await expect(modal.getByRole('button',{name:/Chuyển quyền chủ phòng|Giải thể phòng/i})).toHaveCount(0);
 const owner=modal.locator('.fg-room-member-settings-item').filter({hasText:'Nam'});await expect(owner).toHaveCount(1);await expect(owner.getByRole('button',{name:'Xóa',exact:true})).toHaveCount(0);
 const target=modal.locator('.fg-room-member-settings-item').filter({hasText:'Hải'});await expect(target).toHaveCount(1);const removed=p.waitForResponse(r=>r.url().endsWith(`/rooms/${room.id}/members/native-c`)&&r.request().method()==='DELETE');
 await target.getByRole('button',{name:'Xóa',exact:true}).click();assert.equal((await removed).status(),200);await expect(target).toHaveCount(0);
 assert.equal((await h.pool.query("SELECT id FROM room_members WHERE room_id=$1 AND user_id='native-c'",[room.id])).rowCount,0);
 await p.screenshot({path:`${shots}/helper.png`,fullPage:true});console.log(JSON.stringify({realApi:true,realPostgres:true,checks:['helper MANAGE_MEMBERS actual entry/action','no owner transfer/dissolve','cannot remove owner','server committed member removal'],screenshots:shots}));
}catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned helper browser fixture cleaned.');}
