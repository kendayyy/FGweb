import fs from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {RoomSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try{
 const a=await h.context('native-a',{width:390,height:844});const create=await a.request.post(`${h.base}/api/v1/rooms`,{headers:{Origin:h.base},data:{name:'Mobile room controls',gameId:h.games[0].id,gameTitle:h.games[0].title}});assert.equal(create.status(),200);const room=RoomSchema.parse(await create.json());
 p=await a.newPage();await p.goto(`${h.base}/rooms/${room.id}`);const composer=p.getByRole('textbox',{name:'Tin nhắn phòng',exact:true});await expect(composer).toBeVisible();
 await p.getByTestId('mobile-tab-members').click();await expect(p.getByTestId('mobile-members-panel')).toBeVisible();await expect(composer).not.toBeVisible();
 await p.getByTestId('mobile-tab-settings').click();const dialog=p.getByRole('dialog',{name:/Cài đặt phòng.*Thành viên/i});await expect(dialog).toBeVisible();await expect(dialog.getByLabel(/Tên phòng/)).toHaveValue(room.name);
 await p.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await p.getByTestId('mobile-tab-chat').click();await expect(composer).toBeVisible();
 const bounds=await composer.boundingBox();assert(bounds&&bounds.y>=0&&bounds.y+bounds.height<=844,'Composer inside viewport');
 for(const id of ['mobile-tab-chat','mobile-tab-members','mobile-tab-settings']){const r=await p.getByTestId(id).boundingBox();assert(r&&r.width>=44&&r.height>=44,'44px mobile target');}
 await p.screenshot({path:`${shots}/mobile-tabs.png`,fullPage:true});console.log(JSON.stringify({realApi:true,realBuiltWeb:true,checks:['mobile chat visible','members distinct panel','settings tab opens real controls','Escape closes','chat restores','composer viewport','44px tabs'],screenshots:shots}));
}catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned mobile-tabs browser fixture cleaned.');}
