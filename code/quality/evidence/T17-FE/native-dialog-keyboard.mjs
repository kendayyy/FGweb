import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();
try{
 const a=await h.context('native-a');const p=await a.newPage();await p.goto(h.base);
 const friends=p.getByRole('button',{name:'Bạn bè',exact:true});await expect(friends).toBeEnabled();await friends.click();
 const dialog=p.getByTestId('friends-modal');await expect(dialog).toBeVisible();
 await expect.poll(()=>dialog.evaluate(el=>el.contains(globalThis.document.activeElement))).toBe(true);
 for(let i=0;i<12;i++){await p.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(globalThis.document.activeElement)),'Tab escaped friends modal');}
 await p.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(friends).toBeFocused();
 await p.goto(`${h.base}/users/native-b/profile`);const opener=p.getByTestId('btn-open-dm');await expect(opener).toBeEnabled();await opener.click();
 const dm=p.getByTestId('direct-messages-panel');await expect(dm).toBeVisible();
 await expect.poll(()=>dm.evaluate(el=>el.contains(globalThis.document.activeElement))).toBe(true);
 for(let i=0;i<12;i++){await p.keyboard.press('Tab');assert(await dm.evaluate(el=>el.contains(globalThis.document.activeElement)),'Tab escaped direct-message modal');}
 await p.keyboard.press('Escape');await expect(dm).toHaveCount(0);await expect(opener).toBeFocused();
 console.log(JSON.stringify({realBuiltWeb:true,realCompiledApi:true,checks:['Friends modal acquires and traps keyboard focus; Escape restores opener','DM modal acquires and traps keyboard focus; Escape restores opener']}));
}finally{await h.cleanup();console.log('Owned keyboard fixture cleaned.');}
