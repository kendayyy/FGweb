import fs from 'node:fs';
import assert from 'node:assert/strict';
const lobby='apps/web/src/features/lobby/LobbyPage.tsx';let text=fs.readFileSync(lobby,'utf8');assert.equal(text.split('Đăng nhập Discord</Link>').length,2);fs.writeFileSync(lobby,text.replace('Đăng nhập Discord</Link>','Đăng nhập</Link>'));
const test='apps/web/test/auth-email.test.tsx';text=fs.readFileSync(test,'utf8');assert(text.includes("toHaveTextContent('mật khẩu')"));fs.writeFileSync(test,text.replace("toHaveTextContent('mật khẩu')","toHaveTextContent('Mật khẩu hiện tại không đúng.')"));
