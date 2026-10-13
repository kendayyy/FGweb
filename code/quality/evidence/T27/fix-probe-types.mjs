import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const file='apps/api/test/call-lifecycle.integration.spec.ts',old=fs.readFileSync(file,'utf8'),next=old.replace('const w=window as BrowserWindow;','const w=window as unknown as BrowserWindow;');
assert.notEqual(next,old);const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
assert.equal(compile(next),compile(old),'Only type assertion for the loaded SDK global; test behavior must stay identical');fs.writeFileSync(file,next);
fs.writeFileSync('quality/evidence/T27/probe-types-proof.json',JSON.stringify({recordedAt:new Date().toISOString(),file,reason:'UMD LivekitClient global loaded by actual browser page; TypeScript requires explicit unknown boundary',emittedJavaScriptUnchanged:true,emittedJavaScriptSha256:createHash('sha256').update(compile(next)).digest('hex')},null,2)+'\n');
console.log(JSON.stringify({typeAssertionCorrected:true,emittedJavaScriptUnchanged:true}));
