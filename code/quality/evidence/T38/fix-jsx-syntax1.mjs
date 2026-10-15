import fs from 'node:fs';
const root='quality/evidence/T38/';
for(const [name,from,to] of [
 ['apps/web/src/features/admin/DisclosedEvidence.tsx','throw problem;}} onSuccess','throw problem;}}} onSuccess'],
 ['apps/web/src/features/moderation/MessageActions.tsx','throw error;}} onSuccess','throw error;}}} onSuccess']
]){const source=fs.readFileSync(name,'utf8');if(!source.includes(from))throw Error('Expected exact syntax source');fs.writeFileSync(root+'syntax-before-'+name.split('/').at(-1)+'.txt',source,{flag:'wx'});fs.writeFileSync(name,source.replace(from,to));}
fs.writeFileSync(root+'jsx-syntax-review1.json',JSON.stringify({reviewer:'Codex',time:new Date().toISOString(),cause:'Missing JSX expression closing brace after async onConfirm in two new T38 components; transform failed before any DOM tests.',change:'Add missing expression delimiter only, retain tests and original failures.',status:'Rerun pending'},null,2));
fs.appendFileSync('../.doc/history.md',`\n- Coding and build 3 — T38 — ${new Date().toISOString()}: Resume actual failed admin DOM transform and web type run: missing JSX expression delimiter in two new components. Correct delimiter only; original failure records retained. Evidence code/quality/evidence/T38/jsx-syntax-review1.json; rerun pending, IN_PROGRESS.\n`);
