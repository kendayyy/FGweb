import fs from 'node:fs';import assert from 'node:assert/strict';const d='quality/evidence/T30',write=(p,s)=>fs.writeFileSync(d+'/'+p,s,{flag:'wx'});
write('auth-pool-reuse-control2.mjs',fs.readFileSync(d+'/auth-pool-reuse-control1.mjs','utf8').replaceAll('auth-pool-reuse-control1','auth-pool-reuse-control2'));
write('auth-pool-startup-fault-control2.mjs',fs.readFileSync(d+'/auth-pool-startup-fault-control1.mjs','utf8').replaceAll('auth-pool-startup-fault-review1','auth-pool-startup-fault-review2'));
let driver=fs.readFileSync(d+'/run-api-build20-resource1.mjs','utf8').replaceAll('resource86','resource88').replaceAll('stop-86','stop-88').replaceAll('restore-86','restore-88').replaceAll('build20','build21').replaceAll('build-20','build-21').replaceAll('adoption-20','adoption-21');
const end="if(result===0)result=run('t30-api-build-adoption-21-1',['node',d+'/adopt-api-build-21-reviewed1.mjs']);";assert(driver.includes(end));
driver=driver.replace(end,end+`
if(result===0)result=run('t30-auth-pool-reuse-build21-green-1',['node',d+'/auth-pool-reuse-control2.mjs','green']);
if(result===0)result=run('t30-auth-pool-startup-fault-build21-1',['node',d+'/auth-pool-startup-fault-control2.mjs']);
if(result===0)result=run('t30-auth-security-build21-alone-1',['node',d+'/run-build21-auth-root-regressions1.mjs','auth']);
if(result===0)result=run('t30-auth-email-build21-alone-1',['node',d+'/run-build21-auth-root-regressions1.mjs','auth-email']);
if(result===0)result=run('t30-auth-admin-build21-alone-1',['node',d+'/run-build21-auth-root-regressions1.mjs','auth-admin']);`);
write('run-api-build21-resource1.mjs',driver);
fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+new Date().toISOString()+': Build21 prepare1 exit1 driver-label anchor assertion before build/tests; generated snapshot/adoption/resource88/isolatedOrigin driver retained. Prepare2 completes exact labels plus separate original Auth/email/admin processes, unchanged test5000ms. Source adoption1 exit0. Next nonincrementalBuild21 and realPG controls. No cockpit/noT31.\n');
