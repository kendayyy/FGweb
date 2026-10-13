import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';let source=fs.readFileSync(d+'/prepare-lifecycle-red-probe-reviewed1.mjs','utf8');
const from="fs.writeFileSync(d+'/fixture-server-lifecycle-red-probe-reviewed1.mjs',fixture,{flag:'wx'});";
assert(source.includes(from));source=source.replace(from,"assert.equal(fs.readFileSync(d+'/fixture-server-lifecycle-red-probe-reviewed1.mjs','utf8'),fixture,'Preserve and verify partial prepared fixture');");
const a="edit(\"catch(error){errors.push({name:\",\"catch(error){if(error instanceof assert.AssertionError&&error.message==='INTENDED_RED_BOUNDED_NATIVE_READS')expectedRed=true;else errors.push({name:\");";
assert(source.includes(a));source=source.replace(a,"edit(\"\\ncatch(error){errors.push({name:\",\"\\ncatch(error){if(error instanceof assert.AssertionError&&error.message==='INTENDED_RED_BOUNDED_NATIVE_READS')expectedRed=true;else errors.push({name:\");");
fs.writeFileSync(d+'/prepare-lifecycle-red-probe-reviewed2.mjs',source,{flag:'wx'});
