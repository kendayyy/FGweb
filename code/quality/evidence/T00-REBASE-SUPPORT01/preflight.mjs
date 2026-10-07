import fs from 'node:fs';
import assert from 'node:assert/strict';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),pending=JSON.parse(fs.readFileSync('quality/evidence/AUTH02-FE/pending-amendment.json'));
assert.equal(checkBaselines({root:pending.frozenRoot,baseline}),7);
checkGate({root:process.cwd(),tasks:ledger.tasks,id:'T00-REBASE-SUPPORT01',specHash:baseline.hashes.specSha256,requestedPaths:['scripts/verify-task.mjs','quality/spec-baseline.json']});
console.log('PASS unchanged seven-source historical baseline and strict current output/prerequisite/evidence/scope gate; live approved amendment preserved for review.');
