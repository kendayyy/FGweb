import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const dir='quality/evidence/LIGHT01-FE';
const digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before=JSON.parse(fs.readFileSync(`${dir}/classic-before.json`));
for(const p of ['apps/web/package.json','package-lock.json','apps/web/src/styles/global.css','apps/web/src/styles/tokens.css','apps/web/src/features/theme/ThemeSwitcher.tsx'])assert.equal(digest(p),before.hashes[p],`Unexpected change: ${p}`);
const warm=JSON.parse(fs.readFileSync(`${dir}/warm-verification.json`));
const runtime=Object.entries(warm.currentFiles).filter(([p])=>p.startsWith('apps/web/src/')||p==='apps/web/index.html'||p==='apps/web/test/theme.test.tsx'||p==='tests/e2e/theme.spec.ts');
for(const [p,h]of runtime)assert.equal(digest(p),h,`Existing runtime/test changed: ${p}`);
const source='apps/web/src/components/ui/classic.tsx';
const registry=JSON.parse(fs.readFileSync(`${dir}/codex-classic-registry-view-1.txt`));
const normalize=s=>s.replace(/\r\n/g,'\n').trim();
assert.equal(normalize(fs.readFileSync(source,'utf8')),normalize(registry[0].files[0].content),'Installed source differs from inspected registry');
const labels=['classic-add-2','classic-types-1','classic-lint-1','classic-build-1'];
const commands=labels.map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`)));
for(const record of commands){assert.equal(record.exitCode,0);assert.equal(digest(record.evidencePath),record.evidenceSha256);}
const files=['apps/web/components.json',source,'apps/web/tsconfig.json','apps/web/vite.config.ts'];
const report={taskId:'LIGHT01-FE',recordedAt:new Date().toISOString(),installation:'COMPLETE',taskStatus:'BLOCKED',cliVersion:JSON.parse(fs.readFileSync('.cache/npm/_npx/d66c5096c7023bfb/node_modules/shadcn/package.json')).version,source:'https://toggles.dev/toggles/classic',files:Object.fromEntries(files.map(p=>[p,digest(p)])),commands,existingRuntimeAndTestsPreserved:runtime.length,applicationDependenciesUnchanged:true,applicationStylesAndThemeControlUnchanged:true,notVerified:['Rendered Classic animation and accessibility: component is not integrated','New smoke palette and selector mockup approval','Historical baseline migration'],notes:['First preflight wrapper failed to spawn npm.cmd on Windows; rerun via Node recorded actual gate failure.','First add exited0 at unanswered components.json prompt without installing; only second add is counted.','Relative aliases rejected in first dry run; matching TypeScript/Vite @ aliases configured.','Installation does not change task PASS status.']};
fs.writeFileSync(`${dir}/classic-installation.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const file='quality/tasks.json';
const ledger=JSON.parse(fs.readFileSync(file));
const task=ledger.tasks.find(t=>t.id==='LIGHT01-FE');
assert.equal(task.status,'BLOCKED');
for(const p of [`${dir}/classic-installation.json`,`${dir}/classic-before.json`,...commands.flatMap(c=>[c.evidencePath,c.evidencePath.replace(/\.txt$/,'.json')])])if(!task.evidencePaths.includes(p))task.evidencePaths.push(p);
fs.writeFileSync(file,JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({installation:report.installation,taskStatus:report.taskStatus,cliVersion:report.cliVersion,existingRuntimeAndTestsPreserved:runtime.length,checks:labels}));
