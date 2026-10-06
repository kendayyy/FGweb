import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
const root='C:/Users/PC/.gemini/antigravity-cli/brain/86bb8a2e-1613-4c8f-a771-626f616f07d0/.system_generated';
const rows=fs.readFileSync(`${root}/logs/transcript.jsonl`,'utf8').trim().split(/\r?\n/).map(JSON.parse);
const edit=rows.find(r=>r.tool_calls?.some(t=>t.name.includes('replace_file')&&t.args.TargetFile?.includes('rooms.service.ts')));
assert(edit,'Producer edit must be logged');
const secrets=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([k,v])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(k)&&v.length>=8).map(([,v])=>v);
for(const [startStep,taskStep,finishStep] of [[23,24,25],[30,31,32],[42,43,44]]) {
 const start=rows.find(r=>r.step_index===startStep),finish=rows.find(r=>r.step_index===finishStep);
 assert(start.tool_calls[0].name==='run_command');assert(finish.content.includes('Exit Code: 1'));
 assert(finish.step_index<edit.step_index&&Date.parse(finish.created_at)<=Date.parse(edit.created_at),'RED before producer edit');
 const evidencePath=`quality/evidence/T18-FIX1/codex-recovered-red-${taskStep}.txt`;
 const source=`${root}/tasks/task-${taskStep}.log`,output=fs.readFileSync(source,'utf8');
 assert(output.includes('conversationId')&&output.includes(taskStep===31?'6 failed':'5 failed'),'Missing ID behavior failure expected');
 if(fs.existsSync(evidencePath)){assert.equal(fs.readFileSync(evidencePath,'utf8'),output);continue;}
 assert(!secrets.some(s=>output.includes(s)),'Secret must not enter evidence');fs.writeFileSync(evidencePath,output);
 const record={command:JSON.parse(start.tool_calls[0].args.CommandLine),cwd:JSON.parse(start.tool_calls[0].args.Cwd),startedAt:start.created_at,completedAt:finish.created_at,exitCode:1,evidencePath,evidenceSha256:createHash('sha256').update(output).digest('hex'),source,sourceSteps:[startStep,taskStep,finishStep,edit.step_index],note:'Five genuine missing required conversationId failures before producer implementation; attempt31 has sixth payload-fixture failure (missing required clientMessageId), corrected before producer change. Original outputs retained; no six-behavior RED claim.'};
 fs.writeFileSync(evidencePath.replace('.txt','.json'),JSON.stringify(record,null,2)+'\n');
}
console.log('Three genuine pre-producer RED executions retained; step ordering verified.');
