import fs from 'node:fs';
const f='apps/web/src/features/recruitments/CreateRecruitmentForm.tsx';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replaceAll('<button type="button" onClick','<button className="fg-btn fg-btn-secondary" type="button" onClick'));
