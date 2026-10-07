import fs from 'node:fs';
const original=fs.readFileSync('apps/api/test/auth-email.integration.spec.ts','utf8');
const start=original.indexOf('type CapturedMail='),end=original.indexOf("const origin='http://localhost:5173'");
if(start<0||end<start)throw new Error('Fixture anchors missing');
fs.appendFileSync('apps/api/test/auth-admin.integration.spec.ts','\n'+original.slice(start,end));
