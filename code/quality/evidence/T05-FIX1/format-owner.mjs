import fs from 'node:fs';import ts from 'typescript';
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});for(const file of ['packages/database/src/schema/pending-uploads.ts','packages/database/test/pending-uploads.test.ts'])fs.writeFileSync(file,printer.printFile(ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)));
