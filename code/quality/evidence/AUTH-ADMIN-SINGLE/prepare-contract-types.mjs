import fs from 'node:fs';
const text=fs.readFileSync('quality/evidence/AUTH02-DATA/test-types.json','utf8').replace('"../../../packages/contracts/test/auth-email.test.ts"','"../../../packages/contracts/test/auth-email.test.ts","../../../packages/contracts/test/auth-admin.test.ts"');fs.writeFileSync('quality/evidence/AUTH-ADMIN-SINGLE/contract-test-types.json',text);
