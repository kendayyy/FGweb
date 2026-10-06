import {expect} from '@playwright/test';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();
try{
 const c=await h.context('native-a',{width:390,height:844});const p=await c.newPage();await p.goto(h.base);
 await expect(p.getByRole('heading',{name:/Lobby.*Liên Minh/})).toBeVisible();
 await expect(p.getByRole('button',{name:'Bạn bè',exact:true})).toBeEnabled({timeout:4000});
 await p.getByRole('button',{name:'Bạn bè',exact:true}).click();
 await expect(p.getByRole('heading',{name:'Bạn bè',exact:true})).toBeVisible();
 console.log('Actual authenticated Lobby Friends entry reachable.');
}finally{await h.cleanup();console.log('Owned RED fixture cleaned.');}
