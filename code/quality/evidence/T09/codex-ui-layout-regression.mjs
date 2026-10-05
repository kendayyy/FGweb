// Explicit UI-only HTTP doubles; this probe does not certify real API/OAuth.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { chromium } from '@playwright/test';
const origin='http://127.0.0.1:5199';
const reservation=net.createServer();
await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(5199,'127.0.0.1',resolve);});
await new Promise(resolve=>reservation.close(resolve));
const server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','5199','--strictPort'],{cwd:path.resolve('apps/web'),stdio:'ignore',shell:false,windowsHide:true});
const exited=once(server,'exit');
let browser;
try {
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){
    if(server.exitCode!==null)throw new Error('Owned preview exited before readiness');
    try{ready=(await fetch(origin)).ok;}catch{/* retry readiness */}
    if(ready)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready,true,'Owned preview readiness');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:360,height:800}});
  await page.route('**/api/**',route=>route.fulfill({status:route.request().url().includes('/sign-in/social')?503:401,contentType:'application/json',body:'{}'}));
  await page.goto(origin+'/login');
  await page.locator('header').getByRole('button',{name:'Đăng nhập bằng Discord'}).click();
  const retry=page.locator('header').getByRole('button',{name:'Thử lại'});
  await retry.waitFor({state:'visible'});
  const bounds=await retry.boundingBox();
  console.log(`UI-only fixture: visible header retry ${bounds.width.toFixed(1)}x${bounds.height.toFixed(1)}px at360x800`);
  assert.ok(bounds.width>=44&&bounds.height>=44,'Header retry must have44px touch target');
  console.log('PASS: visible failure recovery touch target');
} finally {
  if(browser)await browser.close();
  if(server.exitCode===null)server.kill();
  await exited;
}
