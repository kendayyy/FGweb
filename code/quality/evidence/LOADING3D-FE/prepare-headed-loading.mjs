import fs from 'node:fs';import {createHash} from 'node:crypto';
const dir='quality/evidence/LOADING3D-FE',original='quality/evidence/CHATCRYPTO-QA/headed-csp-applied.mjs';
let source=fs.readFileSync(original,'utf8').replaceAll('crypto_qa_','loading_fe_').replaceAll('chatcrypto-qa','loading3d-fe').replaceAll('quality/evidence/CHATCRYPTO-QA',dir).replaceAll('headed-csp-applied-proof-','headed-loading-native-proof-');
const block=`
  const loadingShots=[];
  const delayedRequest=async route=>{await new Promise(r=>setTimeout(r,route.request().url().endsWith('/me')?1200:2000));await route.continue();};
  await a.route('**/api/v1/me',delayedRequest);await a.route('**/api/v1/games',delayedRequest);
  for(const theme of ['dark','light'])for(const [width,height]of [[1440,900],[1280,800],[390,844],[360,800]]){
    await a.setViewportSize({width,height});await a.bringToFront();
    await a.addInitScript(value=>localStorage.setItem('fg.theme',value),theme);
    await a.goto(origin+'/');
    await expect(a.getByRole('progressbar',{name:'Đang kiểm tra phiên làm việc'})).toBeVisible();
    await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toBeVisible();
    assert.equal(await a.locator('.fg-loading-turn').evaluate(el=>getComputedStyle(el).animationDuration),'6s');
    assert.equal(await a.getByRole('progressbar',{name:'Đang tải các game',exact:true}).getAttribute('aria-valuenow'),null);
    assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    assert.equal(await a.evaluate(()=>document.documentElement.dataset.theme),theme);
    const file='${dir}/loading-'+theme+'-'+width+'x'+height+'-'+owned+'.png';await a.screenshot({path:file});loadingShots.push({theme,width,height,path:file,sha256:hash(file)});
    await expect(a.getByRole('heading',{name:/Lobby/})).toBeVisible();
  }
  await a.emulateMedia({reducedMotion:'reduce'});await a.goto(origin+'/');await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toBeVisible();assert.equal(await a.locator('.fg-loading-turn').evaluate(el=>getComputedStyle(el).animationName),'none');
  await a.unroute('**/api/v1/me',delayedRequest);await a.unroute('**/api/v1/games',delayedRequest);await a.emulateMedia({reducedMotion:'no-preference'});
  let rejected=false;const failOnce=async route=>{if(!rejected){rejected=true;await route.abort('failed');}else await route.continue();};
  await a.route('**/api/v1/games',failOnce);await a.goto(origin+'/');await expect(a.getByRole('alert').filter({hasText:'Không tải được danh sách game'})).toBeVisible();await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toHaveCount(0);await a.getByRole('button',{name:'Thử lại',exact:true}).first().click();await expect(a.getByRole('heading',{name:/Lobby/})).toBeVisible();await a.unroute('**/api/v1/games',failOnce);
  await a.route('**/api/v1/games',delayedRequest);await a.goto(origin+'/');await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toBeVisible();await a.evaluate(()=>{history.pushState(null,'','/login');dispatchEvent(new PopStateEvent('popstate'));});await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toHaveCount(0);await a.unroute('**/api/v1/games',delayedRequest);
  fs.writeFileSync('${dir}/headed-loading-boundary-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,realApiDb:true,networkDelayedNotSuccessMocked:true,bootstrapAndLobby:true,actualNetworkErrorRetry:true,cancelNavigationRemovesLoader:true,reducedMotionStatic:true,indeterminateProgress:true,rotationSeconds:6,loadingShots,buildHashes},null,2)+'\\n',{flag:'wx'});
`;
source=source.replace('  await unlock(a); await unlock(b);',block+'\n  await unlock(a); await unlock(b);');
fs.writeFileSync(dir+'/headed-loading.mjs',source,{flag:'wx'});
fs.writeFileSync(dir+'/headed-source-review.json',JSON.stringify({recordedAt:new Date().toISOString(),source:original,sha256:createHash('sha256').update(fs.readFileSync(original)).digest('hex'),retained:'All native SAS/Megolm/XSS/transport/storage/logout assertions; separate owned UUID schema/runtime; additional real pending/network-error/retry/cancel/theme/viewport checks. No success payload mocked.'},null,2)+'\n',{flag:'wx'});console.log('Prepared headed current-build real API/DB loader and retained native regression.');
