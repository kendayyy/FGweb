import fs from 'node:fs';
import ts from 'typescript';
const directories=['apps/api/src/modules/chat','apps/api/src/modules/realtime'];
const files=[...directories.flatMap(dir=>fs.readdirSync(dir).filter(file=>file.endsWith('.ts')).map(file=>`${dir}/${file}`)),'apps/api/test/lobby.integration.spec.ts'];
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
for(const file of files){const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);fs.writeFileSync(file,printer.printFile(source));}
console.log(`Formatted ${files.length} T12-owned TypeScript files using the installed compiler printer.`);
