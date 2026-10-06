import fs from 'node:fs';
import assert from 'node:assert/strict';
const p='quality/evidence/T19/native-harness.mjs';assert(!fs.existsSync(p));
let text=fs.readFileSync('quality/evidence/T17-FE/native-harness.mjs','utf8');
text=text.replaceAll('t17_fe','t19_fe').replaceAll('t17-fe-owned','t19-fe-owned').replaceAll('native-t17-lobby','native-t19-lobby');
text=text.replace(" const env=parseEnv(fs.readFileSync('.env.local','utf8'));"," const savedEnv={...process.env};\n const env=parseEnv(fs.readFileSync('.env.local','utf8'));");
text=text.replace("  if(errors.length)throw new AggregateError(errors,'Owned native cleanup failed');","  process.env=savedEnv;\n  if(errors.length)throw new AggregateError(errors,'Owned native cleanup failed');");
text=text.replace('NestFactory.create(AppModule,{logger:false})','NestFactory.create(AppModule,{logger:false,abortOnError:false})');
fs.writeFileSync(p,text);console.log('Owned T19 native harness prepared from frozen real browser/API/PG/Redis fixture; cleanup/environment restoration retained.');
