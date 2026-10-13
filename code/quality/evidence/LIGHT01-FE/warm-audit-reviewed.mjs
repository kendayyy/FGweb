import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const dir='quality/evidence/LIGHT01-FE';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
const task=ledger.tasks.find(task=>task.id==='LIGHT01-FE');
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
const selection=JSON.parse(fs.readFileSync(`${dir}/warm-selection.json`));
assert.equal(hash(selection.reference),selection.referenceSha256);
assert.equal(hash('../.doc/mockups/08-light-warm-ivory.png'),selection.referenceSha256);
for(const source of JSON.parse(fs.readFileSync(`${dir}/warm-metadata-review.json`)).sources)assert.equal(hash(source.file),source.sha256);
for(const [key,file] of Object.entries({mockupLobbySha256:'01-lobby-desktop-mobile.png',mockupCallSha256:'02-group-call-live.png',mockupFeedSha256:'03-community-feed-desktop-mobile.png',mockupAuthSha256:'04-login-desktop-mobile.png',mockupAdminSha256:'05-admin-support-desktop.png'}))assert.equal(hash(`../.doc/mockups/${file}`),baseline.hashes[key]);
const allow=file=>task.writeAllowlist.some(pattern=>pattern.endsWith('/**')?file.startsWith(pattern.slice(0,-2)):file===pattern)||['quality/tasks.json','quality/spec-coverage.md'].includes(file);
const readonly=JSON.parse(fs.readFileSync(`${dir}/readonly.json`));
let readonlyChecked=0;for(const [file,sha] of Object.entries(readonly)){if(selection.paths.includes(file))continue;assert.equal(hash(file),sha,file);readonlyChecked++;}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files)if(!allow(file))assert(file in readonly,`New code file outside task ${file}`);
const latest=new Map();for(const previous of ledger.tasks.slice(0,ledger.tasks.indexOf(task))){assert.equal(previous.status,'PASS');for(const [file,sha] of Object.entries(previous.outputsHash?.files??{}))latest.set(file,sha);}
let frozen=0;for(const [file,sha] of latest)if(!allow(file)){assert.equal(hash(file),sha,file);frozen++;}
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const admin=parseEnv(fs.readFileSync('.runtime/auth-admin/admin-input.env','utf8'));
assert.equal(env.PUBLIC_ORIGIN,'http://localhost:18080');assert.equal(env.BETTER_AUTH_URL,env.PUBLIC_ORIGIN);
const other=Object.fromEntries(Object.entries(env).filter(([key])=>!['PUBLIC_ORIGIN','BETTER_AUTH_URL'].includes(key)));
assert.equal(createHash('sha256').update(JSON.stringify(other)).digest('hex'),ledger.tasks.find(task=>task.id==='T02-OAUTH-FIX1').inputsHash.otherEnvFields);
const sensitive=[...Object.entries(env).filter(([key])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(key)).map(([,value])=>value),...Object.values(admin)].filter(value=>value&&value.length>=8);
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${directory}/${entry.name}`):[`${directory}/${entry.name}`]);
for(const file of [...walk(dir),...walk('apps/web/dist'),...files.filter(file=>allow(file)&&file.startsWith('apps/web/src'))])assert(!sensitive.some(value=>fs.readFileSync(file).includes(Buffer.from(value))),'Private value leaked; path omitted');
console.log(JSON.stringify({baselineAligned:false,metadataMigrationPending:true,approvedWarmSelectionVerified:true,originalMockupsPreserved:5,readonlyChecked,addedOwnerColorPaths:selection.paths.length,frozenOutsideOwnerFiles:frozen,configurationAndAdminPreserved:true,privateValuesLeaked:false}));
