/* global window */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,build} from '../../../apps/web/node_modules/vite/dist/node/index.js';
import {chromium} from '@playwright/test';
const dir='quality/evidence/T02-FIX3',root=path.resolve(`.runtime/chatcrypto-setup/browser-${randomUUID()}`);
assert(root.startsWith(path.resolve('.runtime/chatcrypto-setup')+path.sep));
fs.mkdirSync(root,{recursive:true});
const run=randomUUID();
fs.writeFileSync(`${root}/index.html`, `<!doctype html><html lang="vi"><meta charset="utf-8"><title>FG — kiểm thử WASM thật</title><style>body{background:#212830;color:#d9e1eb;font:20px system-ui;padding:40px}h1{font-size:28px}</style><h1>FG — kiểm thử crypto trên trình duyệt</h1><p id="status">Đang khởi tạo Matrix WASM và IndexedDB thật…</p><script type="module" src="/probe.js"></script></html>`);
fs.writeFileSync(`${root}/probe.js`, `import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
window.probe={done:false,passed:false};
const machines=[];
try{
 await sdk.initAsync();
 const key='fg-setup-${run}';
 let passphrase=sessionStorage.getItem(key+'-pass');
 if(!passphrase){passphrase=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');sessionStorage.setItem(key+'-pass',passphrase);}
 for(const device of ['A','B'])machines.push(await sdk.OlmMachine.initialize(new sdk.UserId('@browser:fg.invalid'),new sdk.DeviceId(device),key+device,passphrase));
 const identities=machines.map(m=>m.identityKeys.ed25519.toBase64());
 if(identities[0]===identities[1])throw new Error('Device identities must differ');
 const old=sessionStorage.getItem(key+'-ids');
 if(old&&old!==JSON.stringify(identities))throw new Error('Encrypted IndexedDB persistence failed');
 sessionStorage.setItem(key+'-ids',JSON.stringify(identities));
 for(const m of machines){const requests=await m.outgoingRequests();if(!requests.some(r=>r.type===sdk.RequestType.KeysUpload))throw new Error('Native signed upload missing');}
 const names=(await indexedDB.databases()).map(d=>d.name);
 if(!names.some(n=>n.includes(key+'A'))||!names.some(n=>n.includes(key+'B')))throw new Error('Native IndexedDB stores missing');
 window.probe={done:true,passed:true,reloaded:!!old,independentDevices:true,persistentStores:2};
 document.getElementById('status').textContent=old?'PASS — WASM thật; hai thiết bị độc lập; khóa giữ nguyên sau reload.':'PASS — WASM thật và hai crypto stores IndexedDB. Đang kiểm reload…';
}catch(error){window.probe={done:true,passed:false,errorName:error.name};document.getElementById('status').textContent='FAIL — kiểm thử chưa đạt';}
finally{for(const m of machines)m.close();}
`);
const config={configFile:false,root,logLevel:'error',cacheDir:path.resolve('.cache/chatcrypto-setup/vite'),server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd()]}},build:{outDir:`${root}/dist`}};
let server,browser;
try{
 await build(config);
 server=await createServer(config);await server.listen();
 browser=await chromium.launch({headless:false});
 const context=await browser.newContext({viewport:{width:1100,height:700}});
 const page=await context.newPage();await page.goto(server.resolvedUrls.local[0]);
 await page.waitForFunction(()=>window.probe?.done,{},{timeout:30000});
 const initial=await page.evaluate(()=>window.probe);assert.equal(initial.passed,true,JSON.stringify(initial));assert.equal(initial.reloaded,false);
 await page.reload();await page.waitForFunction(()=>window.probe?.done,{},{timeout:30000});
 const restored=await page.evaluate(()=>window.probe);assert.equal(restored.passed,true,JSON.stringify(restored));assert.equal(restored.reloaded,true);
 await page.screenshot({path:`${dir}/browser-wasm.png`});
 const report={recordedAt:new Date().toISOString(),headed:true,sdk:'18.6.0',vite:'8.3.2',wasmBrowserBuild:true,initial,restored,fgFeatureImplemented:false};
 fs.writeFileSync(`${dir}/browser-result.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 await context.close();
}finally{if(browser)await browser.close();if(server)await server.close();assert(root.startsWith(path.resolve('.runtime/chatcrypto-setup')+path.sep));fs.rmSync(root,{recursive:true,force:true});}
