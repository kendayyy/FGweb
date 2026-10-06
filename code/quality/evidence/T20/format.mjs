import fs from 'node:fs';
import ts from 'typescript';
const files=['apps/api/src/modules/recruitments/recruitments.service.ts','apps/api/src/modules/recruitments/recruitments.controller.ts','apps/api/src/modules/recruitments/recruitments.module.ts','apps/api/test/recruitments.integration.spec.ts'];
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
for(const f of files){const src=ts.createSourceFile(f,fs.readFileSync(f,'utf8'),ts.ScriptTarget.Latest,true);if(src.parseDiagnostics.length)throw new Error('Parse error');fs.writeFileSync(f,printer.printFile(src));}
const cfg=JSON.parse(fs.readFileSync('quality/evidence/T18/test-types.json','utf8'));cfg.include[1]='../../../apps/api/test/recruitments.integration.spec.ts';fs.writeFileSync('quality/evidence/T20/test-types.json',JSON.stringify(cfg,null,2)+'\n');
fs.writeFileSync('quality/evidence/T20/audit.mjs',fs.readFileSync('quality/evidence/T03-FIX8/audit.mjs','utf8').replaceAll('T03-FIX8','T20'));
console.log('Owned sources formatted without compiling; test typecheck and scope audit prepared.');
