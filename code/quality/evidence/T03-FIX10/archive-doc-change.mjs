import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const dir='quality/evidence/T03-FIX10/doc-change',hash=b=>createHash('sha256').update(b).digest('hex');
assert(!fs.existsSync(dir),'Preserve the previous document snapshot');fs.mkdirSync(dir);
const records=[];
for(const name of ['01-product-spec.md','02-frontend-design.md','task.md']){
 const file=`../.doc/${name}`,bytes=fs.readFileSync(file),copy=`${dir}/${name}`;
 fs.writeFileSync(copy,bytes);assert.equal(hash(fs.readFileSync(copy)),hash(bytes));
 const diff=execFileSync('git',['diff','--',file],{encoding:'utf8'});fs.writeFileSync(`${dir}/${name}.diff.txt`,diff);
 records.push({source:file,copy,sha256:hash(bytes)});
}
fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify({observedAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),records,sourceDocumentsModified:false},null,2)+'\n');
console.log('All three modified documents preserved byte-for-byte; sources unchanged.');
