import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30',write=(p,s)=>fs.writeFileSync(d+'/'+p,s,{flag:'wx'});
write('snapshot-api-build21.mjs',fs.readFileSync(d+'/snapshot-api-build20.mjs','utf8').replaceAll('before-20','before-21'));
let adopt=fs.readFileSync(d+'/adopt-api-build-20-reviewed2.mjs','utf8').replaceAll('api-build-20','api-build-21').replaceAll('before-20','before-21').replaceAll('Build20','Build21').replaceAll('review2','review1').replaceAll('manifest2','manifest1').replaceAll('declaration-scope-review1','sync-init-declaration-scope-review1').replaceAll('auth-pool-source-review1.json','auth-sync-init-source-review1.json');
adopt=adopt.replace("old.split('onModuleInit(): void;')","old.split('onModuleInit(): Promise<void>;')").replace("old.replace('onModuleInit(): void;','onModuleInit(): Promise<void>;')","old.replace('onModuleInit(): Promise<void>;','onModuleInit(): Promise<void> | undefined;')");
adopt=adopt.replaceAll('void-to-Promise','Promise-to-Promise-or-undefined').replaceAll('onlyVoidToPromise','onlyPromiseOrUndefined').replaceAll('only Auth JS/maps and onModuleInit Promise declarations changed','only Auth JS/maps and synchronous hook Promise-or-undefined declaration changed');
write('adopt-api-build-21-reviewed1.mjs',adopt);
write('supabase-test-resource88.mjs',fs.readFileSync(d+'/supabase-test-resource87.mjs','utf8').replaceAll('resource87','resource88'));
let runner=fs.readFileSync(d+'/run-build20-auth-root-regressions1.mjs','utf8');const anchor='env:{...process.env,...env,TEMP:temp,TMP:temp}';assert(runner.includes(anchor));runner=runner.replace(anchor,"env:{...process.env,...env,...(names.includes('auth')?{PUBLIC_ORIGIN:'http://localhost:5173',BETTER_AUTH_URL:'http://localhost:5173'}:{}),TEMP:temp,TMP:temp}");write('run-build21-auth-root-regressions1.mjs',runner);
let driver=fs.readFileSync(d+'/run-api-build20-resource1.mjs','utf8').replaceAll('resource86','resource88').replaceAll('stop-86','stop-88').replaceAll('restore-86','restore-88').replaceAll('build20','build21').replaceAll('build-20','build-21').replaceAll('adopt-api-build-20-reviewed1','adopt-api-build-21-reviewed1');
const end="if(result===0)result=run('t30-api-build-adoption-21-1',['node',d+'/adopt-api-build-21-reviewed1.mjs']);";assert(driver.includes(end));driver=driver.replace(end,end+`
if(result===0)result=run('t30-auth-pool-reuse-build21-green-1',['node',d+'/auth-pool-reuse-control1.mjs','green21']);
if(result===0)result=run('t30-auth-pool-startup-fault-build21-1',['node',d+'/auth-pool-startup-fault-control1.mjs']);
if(result===0)result=run('t30-auth-security-build21-alone-1',['node',d+'/run-build21-auth-root-regressions1.mjs','auth']);
if(result===0)result=run('t30-auth-email-build21-alone-1',['node',d+'/run-build21-auth-root-regressions1.mjs','auth-email']);
if(result===0)result=run('t30-auth-admin-build21-alone-1',['node',d+'/run-build21-auth-root-regressions1.mjs','auth-admin']);`);
// Reuse control takes only red/green and writes immutable output; clone a new output prefix.
write('auth-pool-reuse-control2.mjs',fs.readFileSync(d+'/auth-pool-reuse-control1.mjs','utf8').replaceAll('auth-pool-reuse-control1','auth-pool-reuse-control2'));
driver=driver.replace("d+'/auth-pool-reuse-control1.mjs','green21'","d+'/auth-pool-reuse-control2.mjs','green'");
write('auth-pool-startup-fault-control2.mjs',fs.readFileSync(d+'/auth-pool-startup-fault-control1.mjs','utf8').replaceAll('auth-pool-startup-fault-review1','auth-pool-startup-fault-review2'));
driver=driver.replace("d+'/auth-pool-startup-fault-control1.mjs'","d+'/auth-pool-startup-fault-control2.mjs'");write('run-api-build21-resource1.mjs',driver);
console.log('Build21 drivers prepared; only synthetic auth-suite origin overridden; assertions and deadlines unchanged.');
