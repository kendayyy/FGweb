import fs from 'node:fs';const dir='quality/evidence/LOADING3D-FE';
let source=fs.readFileSync(dir+'/headed-loading.mjs','utf8').replaceAll("getByRole('heading',{name:/Lobby/})","getByRole('heading',{name:/Lobby/,level:1})");
source=source.replace('  const delayedRequest=async route=>','  let gamesDelay=2000;\n  const delayedRequest=async route=>').replace("endsWith('/me')?1200:2000","endsWith('/me')?1200:gamesDelay");
const marker="  await a.emulateMedia({reducedMotion:'reduce'});";
source=source.replace(marker,`  gamesDelay=10000;await a.goto(origin+'/');await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toBeVisible();
  const otherTab=await context.newPage();await otherTab.goto(origin+'/login');await otherTab.bringToFront();await expect.poll(()=>a.evaluate(()=>document.hidden)).toBe(true);await expect(a.locator('.fg-initial-loading')).toHaveAttribute('data-hidden','true');assert.equal(await a.locator('.fg-loading-turn').evaluate(el=>getComputedStyle(el).animationPlayState),'paused');await a.bringToFront();await expect.poll(()=>a.evaluate(()=>document.hidden)).toBe(false);await expect(a.locator('.fg-initial-loading')).toHaveAttribute('data-hidden','false');assert.equal(await a.locator('.fg-loading-turn').evaluate(el=>getComputedStyle(el).animationPlayState),'running');await otherTab.close();gamesDelay=2000;
`+marker);
source=source.replace('reducedMotionStatic:true,indeterminateProgress:true','reducedMotionStatic:true,actualHiddenTabPauseResume:true,indeterminateProgress:true');
fs.writeFileSync(dir+'/headed-loading-round2.mjs',source,{flag:'wx'});console.log('Preserved failed fixture; exact level1 heading selector and actual tab hide/pause/resume assertions added.');
