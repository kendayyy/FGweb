import fs from 'node:fs';
import assert from 'node:assert/strict';
const replace=(file,old,value)=>{const content=fs.readFileSync(file,'utf8');assert(content.includes(old),`Missing color anchor: ${file}`);fs.writeFileSync(file,content.replace(old,value));};
replace('apps/web/src/features/auth/auth.css','background:var(--bg-raised);color:var(--text-main);font:inherit;font-size:16px','background:var(--bg-input);color:var(--text-main);font:inherit;font-size:16px');
replace('apps/web/src/features/lobby/lobby.css','background:var(--bg-raised);color:var(--text-main);font:inherit;font-size:12px','background:var(--bg-input);color:var(--text-main);font:inherit;font-size:12px');
replace('apps/web/src/features/lobby/lobby.css','background:var(--bg-panel);border-radius:24px','background:var(--bg-composer);border-radius:24px');
console.log('Pinned input/composer color substitutions applied; dark aliases retain original surfaces.');
