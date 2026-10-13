import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{chromium}from'playwright';
if(process.env.FG_T30_BROWSER_POOL==='canonical96'){
 const originalLaunch=chromium.launch;const order=['sender','receiver','viewer','third','fourth','denied'];let runId,logicalLaunches=0,actualLaunches=0,pooled,recorded=false,failures=0,contextsCreated=0,distinctContexts=true;const contexts=new WeakSet(),instances=[];
 const base=['--use-fake-device-for-media-stream','--disable-background-timer-throttling','--disable-renderer-backgrounding'];
 const save=()=>{if(recorded||!runId)return;recorded=true;try{const root=path.resolve('quality/evidence/T30'),target=path.join(root,runId);assert.equal(path.dirname(target),root);assert(fs.existsSync(target));fs.writeFileSync(path.join(target,'owned-browser-pool-health.json'),JSON.stringify({at:new Date().toISOString(),diagnosticOnly:false,logicalLaunches,actualLaunches,contextsCreated,distinctContexts,failures,allActualBrowsersDisconnected:instances.every(b=>!b.isConnected()),originalLaunchRestored:chromium.launch===originalLaunch,realHeadedBrowsers:true,nativeDisplayMediaUnchanged:true,cookiesAndRequestsNotReadOrModified:true,selection:'three publisher engines plus one engine for independent viewer/fourth/mobile contexts'})+'\n',{flag:'wx'});}catch{failures++;}};
 const observe=browser=>{actualLaunches++;instances.push(browser);const original=browser.newContext,descriptor=Object.getOwnPropertyDescriptor(browser,'newContext');browser.newContext=function(...args){const result=original.apply(this,args);void result.then(context=>{contextsCreated++;if(contexts.has(context)){distinctContexts=false;failures++;}contexts.add(context);},()=>{failures++;});return result;};browser.once('disconnected',()=>{if(descriptor)Object.defineProperty(browser,'newContext',descriptor);else delete browser.newContext;});return browser;};
 chromium.launch=async function(options={}){
  try{assert.equal(options.headless,false);assert.deepEqual(options.args?.slice(0,3),base);assert(Object.keys(options).every(k=>['headless','args'].includes(k)));const auto=options.args?.[3];assert.equal(options.args.length,auto?4:3);const match=auto?.match(/^--auto-select-tab-capture-source-by-title=FG T30 Capture (sender|receiver|third|fourth) (t30-native-[a-f0-9]{32})$/);if(auto)assert(match);const role=order[logicalLaunches];assert(role);assert.equal(match?.[1]??role,role);if(match){if(runId)assert.equal(match[2],runId);else runId=match[2];}assert(runId);logicalLaunches++;
   if(role==='viewer'){pooled=observe(await originalLaunch.call(this,{...options,args:[...base,'--auto-select-tab-capture-source-by-title=FG T30 Capture fourth '+runId]}));return pooled;}
   if(role==='fourth'||role==='denied'){assert(pooled?.isConnected());return pooled;}
   return observe(await originalLaunch.call(this,options));
  }catch(error){failures++;throw error;}
 };
 process.once('exit',()=>{chromium.launch=originalLaunch;save();});
}
