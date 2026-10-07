import fs from 'node:fs';
import assert from 'node:assert/strict';
const file='apps/web/src/features/recruitments/RecruitmentPanel.tsx';
const before=fs.readFileSync(file,'utf8');const old='<select value={timing';assert(before.includes(old));
fs.writeFileSync(file,before.replace(old,'<select id={`${id}-time`} value={timing'));
