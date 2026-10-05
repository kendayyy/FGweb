import fs from 'node:fs';
import ts from 'typescript';
const files=[...fs.readdirSync('apps/web/src/features/lobby').filter(file=>/\.tsx?$/.test(file)).map(file=>`apps/web/src/features/lobby/${file}`),'apps/web/src/layouts/AppShell.tsx','apps/web/test/lobby.test.tsx'];
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
for(const file of files){const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);fs.writeFileSync(file,printer.printFile(source));}
console.log(`Formatted ${files.length} T13-owned files.`);
