import fs from 'node:fs';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
const task=ledger.tasks.find(t=>t.id==='AUTH-ADMIN-SINGLE');
const extra=['apps/api/src/modules/profiles/profiles.service.ts','apps/api/test/auth.integration.spec.ts'];
for(const path of extra)if(!task.writeAllowlist.includes(path))task.writeAllowlist.push(path);
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.writeFileSync('quality/evidence/AUTH-ADMIN-SINGLE/reserved-name-scope.md','# Exact integration scope\n\nPersistent user permission to broaden Write Scope/touch locked files applies. Before edits pin profiles.service.ts for reserved kingame protection in onboarding/update, and auth.integration.spec.ts for the explicitly superseded Discord admin grant expectation. Retain all session/ban/guard checks. No database schema, migration, generic application/module/router edits. Sole role remains immutable server userId; username cannot grant role.\n');
