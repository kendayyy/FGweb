import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');
const {chromium}=await import('@playwright/test');
const browser=await chromium.launch({headless:false});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto('http://localhost:18080/');
 await page.getByRole('combobox',{name:'Chọn game'}).waitFor();
 const cdp=await page.context().newCDPSession(page),manifest=await cdp.send('Page.getAppManifest');
 assert(manifest.url.endsWith('/manifest.webmanifest'));assert.deepEqual(manifest.errors,[]);
 assert.equal(JSON.parse(manifest.data).icons.length,4);
 fs.writeFileSync('quality/evidence/GAME-LOGO-FE/dota-browser-manifest.json',JSON.stringify({recordedAt:new Date().toISOString(),manifest,phoneInstallationVerified:false},null,2)+'\n');
 for(const mode of ['light','dark']){
  if(await page.locator('html').getAttribute('data-theme')!==mode)await page.getByRole('button',{name:/Chuyển sang/}).click();
  const dota=page.getByRole('navigation',{name:'Chọn game Lobby'}).getByRole('button',{name:'Dota 2',exact:true});
  await dota.click();await page.getByRole('heading',{name:'Lobby · Dota 2 — FG',exact:true}).waitFor();
  const image=dota.locator('img:visible');await image.evaluate(image=>image.decode());
  assert.equal(await image.getAttribute('src'),'/game-logos/dota-2.png');
  await page.screenshot({path:`quality/evidence/GAME-LOGO-FE/dota-main-${mode}.png`,fullPage:true});
 }
 console.log(JSON.stringify({mainOrigin:'http://localhost:18080',headed:true,decodedDotaBothThemes:true,nativeBrowserManifest:true,icons:4,phoneInstallNotifications:'Not verified'}));
}finally{await browser.close();}
