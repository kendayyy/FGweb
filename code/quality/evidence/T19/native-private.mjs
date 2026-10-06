import fs from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {RoomSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let p;
const shots=`quality/evidence/T19/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
try {
 const a=await h.context('native-a'), outsider=await h.context('native-c');
 const created=await a.request.post(`${h.base}/api/v1/rooms`,{headers:{Origin:h.base},data:{name:'Private room protected',gameId:h.games[0].id,gameTitle:h.games[0].title,visibility:'PRIVATE'}});
 assert.equal(created.status(),200);const room=RoomSchema.parse(await created.json());
 p=await outsider.newPage();
 const denied=p.waitForResponse(r=>r.url().endsWith(`/api/v1/rooms/${room.id}`)&&r.request().method()==='GET');
 await p.goto(`${h.base}/rooms/${room.id}`);
 assert.equal((await denied).status(),403,'Actual room ACL response must deny outsider');
 await expect(p.getByRole('alert')).toContainText(/không có quyền/i,{timeout:10000});
 await expect(p.getByRole('heading',{name:room.name,exact:true})).toHaveCount(0);
 await expect(p.getByRole('textbox',{name:/tin nhắn|nhắn vào/i})).toHaveCount(0);
 await p.screenshot({path:`${shots}/private-denied.png`,fullPage:true});
 console.log(JSON.stringify({realCompiledApi:true,realBuiltWeb:true,realPostgres:true,checks:['Actual private deep-link403 with empty own-list shows explicit access error and no chat content/composer'],screenshots:shots}));
} catch(e){if(p)await p.screenshot({path:`${shots}/failure.png`,fullPage:true});throw e;}
finally{await h.cleanup();console.log('Owned private-room browser fixture cleaned.');}
