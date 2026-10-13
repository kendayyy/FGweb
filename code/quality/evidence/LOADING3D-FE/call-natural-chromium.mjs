import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
export async function launchNaturalChromium(chromium,owned){
  assert.match(owned,/^loading_fe_[a-f0-9]{32}$/);
  const root=path.resolve('.cache/loading3d-fe/natural-chromium'),profile=path.join(root,owned);fs.mkdirSync(profile,{recursive:true});assert(fs.realpathSync(profile).startsWith(fs.realpathSync(root)+path.sep));
  const child=spawn(chromium.executablePath(),['--user-data-dir='+profile,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--no-first-run','--no-default-browser-check','--disable-sync','--disable-background-networking','about:blank'],{windowsHide:false,stdio:['ignore','pipe','pipe']});child.stdout.resume();child.stderr.resume();
  let browser;
  try{let port;for(let i=0;i<100;i++){try{const lines=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/);port=Number(lines[0]);if(Number.isInteger(port)&&port>0&&port<65536)break;}catch{}assert(child.exitCode===null,'Owned Chromium exited before readiness');await new Promise(r=>setTimeout(r,100));}assert(Number.isInteger(port),'Owned Chromium endpoint missing');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{noDefaults:true});
  }catch(problem){child.kill();throw problem;}
  const close=async()=>{try{if(browser.isConnected()){const session=await browser.newBrowserCDPSession();await session.send('Browser.close').catch(()=>{});}}finally{if(child.exitCode===null)await Promise.race([new Promise(r=>child.once('close',r)),new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null){child.kill();await new Promise(r=>child.once('close',r));}assert.equal(path.resolve(profile),path.join(root,owned));assert(fs.realpathSync(profile).startsWith(fs.realpathSync(root)+path.sep));fs.rmSync(profile,{recursive:true});}};
  return {browser,context:browser.contexts()[0],close};
}
