import fs from 'node:fs';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='AUTH-ADMIN-SINGLE');task.writeAllowlist.push('packages/contracts/test/auth-admin.test.ts');fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/evidence/AUTH-ADMIN-SINGLE/plan.md','\nExact additional test scope declared before RED: packages/contracts/test/auth-admin.test.ts. New Unicode/composition behavior requires dedicated tests, preserving original auth-email tests for intentional policy fixture updates later.\n');
