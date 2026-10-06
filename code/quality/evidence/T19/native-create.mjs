import fs from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {RoomSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try {
 const a=await h.context('native-a');p=await a.newPage();await p.goto(`${h.base}/rooms`);
 await p.getByRole('button',{name:/Tạo phòng/i}).first().click();
 const dialog=p.getByRole('dialog',{name:/Tạo phòng mới/i});await expect(dialog).toBeVisible();
 await dialog.getByLabel(/Tên phòng/).fill('FG native created room');
 const gameSelect=dialog.getByLabel(/Chọn Game/i);await expect(gameSelect.locator('option')).toHaveCount(7);
 await gameSelect.selectOption({label:h.games[0].title});
 const result=p.waitForResponse(r=>r.url().endsWith('/api/v1/rooms')&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Tạo phòng',exact:true}).click();
 const res=await result;const payload=res.request().postDataJSON();
 assert.equal(payload.gameId,h.games[0].id,'UI create must send real game catalog UUID');
 assert.equal(res.status(),200);const room=RoomSchema.parse(await res.json());
 await expect(dialog).toHaveCount(0);await expect(p.getByRole('heading',{name:room.name,exact:true})).toBeVisible();
 await p.reload();await expect(p.getByRole('heading',{name:room.name,exact:true})).toBeVisible();
 const composer=p.getByRole('textbox',{name:'Tin nhắn phòng',exact:true});await composer.fill('FG real UI message');
 const sent=p.waitForResponse(r=>r.url().endsWith(`/conversations/${room.conversationId}/messages`)&&r.request().method()==='POST');
 await p.getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();assert.equal((await sent).status(),201);
 await expect(p.getByText('FG real UI message',{exact:true})).toBeVisible();
 for(const viewport of [{width:1440,height:900},{width:1280,height:800},{width:390,height:844},{width:360,height:800}]){
  await p.setViewportSize(viewport);await p.evaluate(()=>document.fonts.ready);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal page overflow');
  await expect(composer).toBeVisible();
  await p.screenshot({path:`${shots}/room-${viewport.width}x${viewport.height}.png`,fullPage:true});
 }
 console.log(JSON.stringify({realCompiledApi:true,realBuiltWeb:true,realPostgres:true,checks:['seven real games','create catalog UUID','reload deep link','canonical conversation send201','four viewports no overflow'],screenshots:shots}));
}catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned create browser fixture cleaned.');}
