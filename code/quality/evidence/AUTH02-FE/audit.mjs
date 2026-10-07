import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/AUTH02-FE',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='AUTH02-FE');
const allow=f=>task.writeAllowlist.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):f===p)||['quality/tasks.json','quality/spec-coverage.md'].includes(f);
const snapshot=JSON.parse(fs.readFileSync(`${dir}/readonly.json`)),overrides=JSON.parse(fs.readFileSync(`${dir}/producer-override.json`)),producer=ledger.tasks.find(t=>t.id===overrides.owner);assert.equal(producer.status,'PASS');
for(const [f,v]of Object.entries(overrides.files)){assert.equal(snapshot[f],v.previousSha256);assert.equal(producer.outputsHash.files[f],v.currentSha256);}
for(const [f,h]of Object.entries(snapshot))assert.equal(hash(f),overrides.files[f]?.currentSha256??h,f);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);assert(files.every(f=>allow(f)||f in snapshot||f in producer.outputsHash.files));
const amendment=JSON.parse(fs.readFileSync(`${dir}/pending-amendment.json`));assert.equal(amendment.currentCheckpoint,'AUTH02-FE');
for(const source of Object.values(amendment.sources)){assert.equal(hash(source.livePath),source.liveSha256,'Amendment changed again');assert.equal(hash(source.frozenPath),source.frozenSha256,'Historical source changed');}
assert.equal(hash(amendment.approvedNextMockup.path),amendment.approvedNextMockup.sha256);
assert.equal(checkBaselines({root:amendment.frozenRoot,baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),7);
const frozen=new Map();for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(task)))for(const [f,h]of Object.entries(t.outputsHash?.files??{}))frozen.set(f,h);let count=0;for(const [f,h]of frozen)if(!allow(f)){assert.equal(hash(f),h,f);count++;}
const head=f=>execFileSync('git',['show',`HEAD:code/${f}`],{encoding:'utf8'}).replaceAll('\r\n','\n');
const lobby='apps/web/src/features/lobby/LobbyPage.tsx';assert.equal(fs.readFileSync(lobby,'utf8').replaceAll('\r\n','\n'),head(lobby).replace('Đăng nhập Discord</Link>','Đăng nhập</Link>'));
const oldTest='apps/web/test/auth.test.tsx';assert.equal(fs.readFileSync(oldTest,'utf8').replaceAll('\r\n','\n'),head(oldTest).replace("expect(screen.getAllByText(/Đăng nhập bằng Discord/i).length)","expect(screen.getAllByRole('link',{name:'Đăng nhập'}).length)"));
for(const file of ['.runtime/auth02-fe/key.pem','.runtime/auth02-fe/cert.pem'])assert(!fs.existsSync(file),'Temporary certificate must be removed');
const secrets=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([k,v])=>v&&/(SECRET|PASSWORD|PRIVATE_KEY)/.test(k)&&v.length>=8).map(([,v])=>v);
for(const f of files.filter(allow)){const raw=fs.readFileSync(f);assert(!secrets.some(value=>raw.includes(Buffer.from(value))),'Configured secret leaked');if(f.startsWith(dir))assert(!/[?&]token=[A-Za-z0-9_.-]{16,}/.test(raw.toString()),'Live mailed token leaked');}
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${d}/${e.name}`):[`${d}/${e.name}`]);
const cacheFiles=fs.existsSync('.cache/auth02-fe')?walk('.cache/auth02-fe'):[];
for(const f of cacheFiles){const raw=fs.readFileSync(f);assert(!secrets.some(value=>raw.includes(Buffer.from(value))),'Configured secret leaked into owned cache');assert(!/[?&]token=[A-Za-z0-9_.-]{16,}/.test(raw.toString()),'Mailed token leaked into owned cache');}
for(const f of walk('apps/web/dist'))assert(!secrets.some(value=>fs.readFileSync(f).includes(Buffer.from(value))),'Configured server secret leaked into browser bundle');
for(const size of ['1440x900','1280x800','390x844','360x800'])assert(fs.statSync(`${dir}/screenshots/${size}-login.png`).size>1000);
console.log(JSON.stringify({baselines:7,readonlyFiles:Object.keys(snapshot).length,frozenFiles:count,reviewedProducerOverrides:Object.keys(overrides.files).length,lobbyOnlyCopyChanged:true,oldTestOnlySupersededLabelChanged:true,temporaryTlsKeysRemoved:true,ownedCacheFilesScanned:cacheFiles.length,configuredSecretsAndMailedTokensLeaked:false,backendDatabaseContractsTokensAndConfigUnchangedWithinFrontendTask:true}));
