import fs from 'node:fs';const dir='quality/evidence/LOADING3D-FE';let source=fs.readFileSync(dir+'/headed-natural-loading-round6.mjs','utf8');
source=source.replaceAll('await route.continue();','await continueIfLive(route);');
source=source.replace('  const loadingShots=[];',`  const cancelledRouteProof=[];
  async function continueIfLive(route){
    const failure=route.request().failure();
    if(failure&&failure.errorText==='net::ERR_ABORTED'){cancelledRouteProof.push({path:new URL(route.request().url()).pathname,actualFailure:failure.errorText});return;}
    try{await route.continue();}catch(problem){const aborted=route.request().failure();if(aborted?.errorText!=='net::ERR_ABORTED')throw problem;cancelledRouteProof.push({path:new URL(route.request().url()).pathname,actualFailure:aborted.errorText});}
  }
  const loadingShots=[];`);
source=source.replace("  await a.unroute('**/api/v1/me',delayedRequest);", "  await expect(a.getByRole('heading',{name:/Lobby/,level:1})).toBeVisible();\n  await a.unroute('**/api/v1/me',delayedRequest);");
source=source.replace("await a.evaluate(()=>{history.pushState(null,'','/login');", "const actualCancel=a.waitForEvent('requestfailed',{predicate:request=>new URL(request.url()).pathname==='/api/v1/games'});await a.evaluate(()=>{history.pushState(null,'','/login');");
source=source.replace("dispatchEvent(new PopStateEvent('popstate'));});await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toHaveCount(0);", "dispatchEvent(new PopStateEvent('popstate'));});const canceledRequest=await actualCancel;assert.equal(canceledRequest.failure()?.errorText,'net::ERR_ABORTED');await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toHaveCount(0);");
source=source.replace('actualNetworkErrorRetry:true,cancelNavigationRemovesLoader:true','actualNetworkErrorRetry:true,cancelNavigationRemovesLoader:true,actualCancelledRouteFailures:cancelledRouteProof');
fs.writeFileSync(dir+'/headed-natural-loading-round7.mjs',source,{flag:'wx'});console.log('Preserved RED6; only actual net::ERR_ABORTED callbacks stop continuation, all other errors still throw. Wait ready before removing normal delay routes; explicit navigation cancellation asserts native requestfailed.');
