import fs from 'node:fs';
const file='apps/api/src/app.module.ts';
const before=fs.readFileSync(file,'utf8');
fs.writeFileSync(file,before.replaceAll('\r\n','\n'));
console.log('AppModule normalized CRLF to repository LF; full exact-wiring assertion unchanged.');
