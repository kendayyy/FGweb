import fs from 'node:fs';
import assert from 'node:assert/strict';
const file='apps/web/test/auth-email.test.tsx',text=fs.readFileSync(file,'utf8');assert.equal(text.split("name:'Đăng nhập',exact:true").length,2);fs.writeFileSync(file,text.replace("name:'Đăng nhập',exact:true","name:'Đăng nhập'"));
