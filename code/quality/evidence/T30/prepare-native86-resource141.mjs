import fs from 'node:fs';import assert from 'node:assert/strict';const d='quality/evidence/T30',read=n=>fs.readFileSync(d+'/'+n,'utf8'),write=(n,s)=>fs.writeFileSync(d+'/'+n,s,{flag:'wx'});
write('supabase-test-resource141.mjs',read('supabase-test-resource138.mjs').replaceAll('resource138','resource141'));
write('enter-native86-build26-web3-reviewed1.mjs',read('enter-native85-build26-web3-reviewed2.mjs').replaceAll('native85','native86'));
let s=read('run-native85-build26-web3-driver2.mjs').replaceAll('native85','native86').replaceAll('native-85','native-86').replaceAll('resource138','resource141').replaceAll('stop-138','stop-141').replaceAll('restore-138','restore-141').replaceAll('enter-native86-build26-web3-reviewed2.mjs','enter-native86-build26-web3-reviewed1.mjs');
const anchor="['t30-native86-service-health-2',";assert(s.includes(anchor));s=s.replace(anchor,"['t30-docker-page-cache-reclaim-1',['node',d+'/reclaim-docker-page-cache1.mjs']],"+anchor);write('run-native86-build26-web3-driver1.mjs',s);
console.log('Prepared same compiled API26/web3/frozen E2E after measured Docker cache pressure; resource141 finally restores exact10.');
