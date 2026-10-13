import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');
const browser=await chromium.launch({headless:false});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://localhost:18080');await page.getByRole('combobox',{name:'Chọn game'}).waitFor();
 const response=await page.request.get('http://localhost:18080/api/v1/rooms/check/play-sessions');assert.equal(response.status(),401,'Discovery is wired and requires native authentication');
 await page.getByRole('navigation',{name:'Chọn game Lobby'}).getByRole('button',{name:'Dota 2',exact:true}).click();await page.getByRole('heading',{name:'Lobby · Dota 2 — FG',exact:true}).waitFor();
 const decoded=await page.locator('img[src="/game-logos/dota-2.png"]').evaluateAll(async images=>{await Promise.all(images.map(image=>image.decode()));return images.length>0&&images.every(image=>image.complete&&image.naturalWidth===4000);});assert(decoded);
 fs.mkdirSync('quality/evidence/T25/main',{recursive:true});await page.screenshot({path:'quality/evidence/T25/main/dota-lobby.png',fullPage:true});
 fs.writeFileSync('quality/evidence/T25/main/preview.json',JSON.stringify({recordedAt:new Date().toISOString(),origin:'http://localhost:18080',headed:true,discoveryUnauthenticatedStatus:response.status(),dotaDecoded:decoded},null,2)+'\n');
 console.log(JSON.stringify({origin:'http://localhost:18080',headed:true,discoveryStatus:response.status(),dotaDecoded:decoded}));
}finally{await browser.close();}
