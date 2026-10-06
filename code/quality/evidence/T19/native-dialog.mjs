import fs from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {RoomSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try{
 const a=await h.context('native-a');const created=await a.request.post(`${h.base}/api/v1/rooms`,{headers:{Origin:h.base},data:{name:'Keyboard dialog room',gameId:h.games[0].id,gameTitle:h.games[0].title}});assert.equal(created.status(),200);
 const room=RoomSchema.parse(await created.json());p=await a.newPage();await p.goto(`${h.base}/rooms/${room.id}`);
 const trigger=p.getByTestId('room-header-settings-btn');await expect(trigger).toBeVisible();await trigger.click();
 const settings=p.getByRole('dialog',{name:/Cài đặt phòng.*Thành viên/i});await expect(settings).toBeVisible();
 await expect(settings.locator(':focus')).toHaveCount(1);
 const count=await settings.locator('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]').count();
 for(let i=0;i<count+2;i++){await p.keyboard.press('Tab');await expect(settings.locator(':focus')).toHaveCount(1);}
 await settings.getByRole('button',{name:/Giải thể phòng này/i}).click();
 const confirm=p.getByRole('dialog',{name:'Xác nhận giải thể phòng',exact:true});await expect(confirm).toBeVisible();await expect(confirm.getByRole('button',{name:'Hủy',exact:true})).toBeFocused();
 let deletes=0;p.on('request',r=>{if(r.method()==='DELETE'&&r.url().endsWith(`/rooms/${room.id}`))deletes++;});
 await p.keyboard.press('Escape');await expect(confirm).toHaveCount(0);await expect(settings).toBeVisible();assert.equal(deletes,0);
 await expect(settings.getByRole('button',{name:/Giải thể phòng này/i})).toBeFocused();
 await p.keyboard.press('Escape');await expect(settings).toHaveCount(0);await expect(trigger).toBeFocused();
 await p.screenshot({path:`${shots}/keyboard.png`,fullPage:true});console.log(JSON.stringify({realApi:true,realBuiltWeb:true,checks:['initial focus','Tab trap','safe cancel focused','top-only Escape','no cancel DELETE','nested and outer restoration'],screenshots:shots}));
}catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned keyboard browser fixture cleaned.');}
