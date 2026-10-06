import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {RoomSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try{
 const a=await h.context('native-a'),b=await h.context('native-b');const create=await a.request.post(`${h.base}/api/v1/rooms`,{headers:{Origin:h.base},data:{name:'Owner actions room',gameId:h.games[0].id,gameTitle:h.games[0].title}});assert.equal(create.status(),200);const room=RoomSchema.parse(await create.json());
 await h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'native-b','MEMBER')",[randomUUID(),room.id]);
 p=await a.newPage();await p.goto(`${h.base}/rooms/${room.id}`);await p.getByTestId('room-header-settings-btn').click();
 const settings=p.getByRole('dialog',{name:/Cài đặt phòng.*Thành viên/i});await settings.getByLabel(/Tên phòng/).fill('Owner settings renamed');
 const saved=p.waitForResponse(r=>r.url().endsWith(`/rooms/${room.id}/settings`)&&r.request().method()==='PATCH');
 await settings.getByRole('button',{name:/Lưu cài đặt/i}).click();assert.equal((await saved).status(),200);await expect(p.getByRole('heading',{name:'Owner settings renamed',exact:true})).toBeVisible();
 await settings.locator('select').last().selectOption('native-b');await settings.getByRole('button',{name:'Chuyển quyền chủ phòng',exact:true}).click();
 const transfer=p.getByRole('dialog',{name:'Xác nhận chuyển quyền chủ phòng',exact:true});await expect(transfer).toBeVisible();
 let transferred=0;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/transfer-owner'))transferred++;});
 await transfer.getByRole('button',{name:'Hủy',exact:true}).click();assert.equal(transferred,0);await expect(settings).toBeVisible();
 await settings.getByRole('button',{name:'Chuyển quyền chủ phòng',exact:true}).click();const committed=p.waitForResponse(r=>r.url().endsWith(`/rooms/${room.id}/transfer-owner`)&&r.request().method()==='POST');
 await transfer.getByRole('button',{name:'Chuyển quyền',exact:true}).click();const owned=await committed;assert.equal(owned.status(),200);assert.equal(RoomSchema.parse(await owned.json()).ownerId,'native-b');
 await expect(transfer).toHaveCount(0);await expect(p.getByTestId('room-header-settings-btn')).toHaveCount(0);
 await p.keyboard.press('Escape');await expect(settings).toHaveCount(0);
 await p.getByRole('button',{name:'Rời phòng',exact:true}).click();const leave=p.getByRole('dialog',{name:/Xác nhận rời phòng/i});await expect(leave).toBeVisible();
 const left=p.waitForResponse(r=>r.url().endsWith(`/rooms/${room.id}/members/native-a`)&&r.request().method()==='DELETE');await leave.getByRole('button',{name:'Rời phòng',exact:true}).click();assert.equal((await left).status(),200);
 assert.equal((await h.pool.query("SELECT id FROM room_members WHERE room_id=$1 AND user_id='native-a'",[room.id])).rowCount,0);
 const next=await b.newPage();await next.goto(`${h.base}/rooms/${room.id}`);await next.getByTestId('room-header-settings-btn').click();await next.getByRole('dialog',{name:/Cài đặt phòng.*Thành viên/i}).getByRole('button',{name:'Giải thể phòng này',exact:true}).click();
 const dissolved=next.waitForResponse(r=>r.url().endsWith(`/rooms/${room.id}`)&&r.request().method()==='DELETE');await next.getByRole('dialog',{name:'Xác nhận giải thể phòng',exact:true}).getByRole('button',{name:'Giải thể phòng',exact:true}).click();assert.equal((await dissolved).status(),200);
 assert.equal((await h.pool.query('SELECT id FROM rooms WHERE id=$1',[room.id])).rowCount,0);
 await next.screenshot({path:`${shots}/management.png`,fullPage:true});console.log(JSON.stringify({realApi:true,realPostgres:true,checks:['settings PATCH commit','transfer cancel no API','transfer real owner','old owner no owner action','member leave commit','new owner dissolve commit'],screenshots:shots}));
}catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned management browser fixture cleaned.');}
