import fs from 'node:fs';
const dir='quality/evidence/T03-FIX15';
fs.writeFileSync(`${dir}/record.mjs`,fs.readFileSync('quality/evidence/T27/record.mjs','utf8').replace("const dir = 'quality/evidence/T27';",`const dir = '${dir}';`),{flag:'wx'});
fs.writeFileSync(`${dir}/test-types.json`,JSON.stringify({extends:'../../../packages/contracts/tsconfig.json',compilerOptions:{noEmit:true,rootDir:'../../..'},include:['../../../packages/contracts/src/**/*.ts','../../../packages/contracts/test/call-controls-transport.test.ts']},null,2)+'\n',{flag:'wx'});
