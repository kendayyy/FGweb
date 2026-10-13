import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs';
const configPath='.runtime/t26/predecessor-source/tsconfig.json',read=ts.readConfigFile(configPath,ts.sys.readFile),config=ts.parseJsonConfigFileContent(read.config,ts.sys,path.dirname(configPath));
config.options.outDir=path.resolve('quality/evidence/T26/owner-derived-proof');config.options.emitDeclarationOnly=true;
const program=ts.createProgram(config.fileNames,config.options),errors=ts.getPreEmitDiagnostics(program);
if(errors.length){console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:ts.sys.getCurrentDirectory,getCanonicalFileName:p=>p,getNewLine:()=>ts.sys.newLine}));process.exitCode=1;}
else{
 const targets=['teams/teams.controller.ts','teams/teams.service.ts','play-sessions/play-sessions.controller.ts','play-sessions/play-sessions.service.ts'];
 for(const target of targets){const file=program.getSourceFile(path.resolve('.runtime/t26/predecessor-source/src/modules',target));if(!file)throw Error('Compiler source absent');const result=program.emit(file);if(result.emitSkipped)throw Error('Compiler skipped owner declaration');}
 fs.writeFileSync('quality/evidence/T26/owner-derived-proof-emission.json',JSON.stringify({recordedAt:new Date().toISOString(),targets,implementation:'Unmodified TypeScript compiler emits only original T24-FIX2 producer declarations; no emitted text rewriting'},null,2)+'\n');
}
