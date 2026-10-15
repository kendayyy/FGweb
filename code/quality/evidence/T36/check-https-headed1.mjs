import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import {captureUiStep} from '../../../tools/telegram-bridge/demo-stream.mjs';
const session=JSON.parse(fs.readFileSync('.runtime/t36/tunnel/active-session.json','utf8'));
const runId='t36-https-ui-'+randomUUID().replaceAll('-',''),dir='quality/evidence/T36/'+runId,startedAt=new Date().toISOString();
fs.mkdirSync(dir,{recursive:true});
const profile=path.resolve('.runtime/t36/'+runId),checks=[],captures=[];let context,page,step=0,phase='public-http',failed=false;
const capture=async(title,result,status='RUNNING')=>{await page.bringToFront();captures.push(await captureUiStep(page,{task:'T36',runId,step:++step,title,action:title,result,startedAt,headed:true,privacySafe:true,status,maskSelectors:['.fg-crypto-recovery-code','[data-sensitive]','[data-demo-private]']}));};
async function http(route,options){return fetch(session.origin+route,{...options,signal:AbortSignal.timeout(30000),redirect:'manual'});}
try{
 const root=await http('/',{headers:{Accept:'text/html'}});assert.equal(root.status,200);assert((await root.text()).includes('FG'));assert(root.headers.get('content-security-policy')?.includes("default-src 'none'"));
 const manifest=await http('/manifest.webmanifest');assert.equal(manifest.status,200);const data=await manifest.json();assert.equal(data.name,'FG');assert.equal(data.short_name,'FG');
 const sw=await http('/sw.js');assert.equal(sw.status,200);assert.equal(createHash('sha256').update(Buffer.from(await sw.arrayBuffer())).digest('hex'),createHash('sha256').update(fs.readFileSync('apps/web/dist/sw.js')).digest('hex'));
 assert.equal((await http('/api/v1/me')).status,401);
 assert.equal((await http('/_t36/status')).status,404);
 assert.equal((await http('/.env.local')).status,404);
 assert.equal((await http('/api/auth/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:session.origin},body:'{}'})).status,403);
 assert.equal((await http('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://outside.invalid'},body:'{}'})).status,403);
 checks.push('actual public HTTPS HTML/CSP/FG manifest/canonical SW hash, private API401, debug/env404, registration403 and foreign-Origin login403');
 phase='headed-real-login';
 context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:{width:1440,height:900},ignoreDefaultArgs:['--disable-background-networking']});
 page=await context.newPage();await page.goto(session.origin+'/login',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('heading',{name:'Đăng nhập FG',exact:true})).toBeVisible();await capture('FG qua HTTPS','Trang đăng nhập FG thật trên địa chỉ HTTPS tạm; không thêm cookie hoặc giả phiên.');
 const account=session.accounts.pc;
 await page.getByLabel('Email hoặc tên đăng nhập').fill(account.email);
 await page.getByLabel('Mật khẩu',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByTestId('logout-button')).toBeVisible({timeout:30000});
 const cookies=await context.cookies(session.origin),sessionCookie=cookies.find(c=>c.name==='__Secure-better-auth.session_token');assert(sessionCookie?.secure&&sessionCookie.httpOnly);assert.equal(sessionCookie.sameSite,'Lax');
 const me=await page.evaluate(async()=>{const response=await fetch('/api/v1/me',{cache:'no-store'});return{status:response.status,body:await response.json()};});assert.equal(me.status,200);assert.equal(me.body.id,account.userId);
 checks.push('real headed password login, correct synthetic actor and Secure HttpOnly SameSite=Lax session cookie');await capture('Đăng nhập thật thành công','FG chạy cùng API qua HTTPS; phiên được server cấp sau đăng nhập bằng mật khẩu kiểm thử.');
 phase='pwa-native-push';
 await page.goto(session.origin+'/notifications',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('heading',{name:'Push trên thiết bị này',exact:true})).toBeVisible({timeout:20000});
 await context.grantPermissions(['notifications'],{origin:session.origin});
 await page.getByRole('button',{name:'Bật Push',exact:true}).click();
 await expect(page.locator('.fg-pwa-push')).toContainText('Push đã được đăng ký',{timeout:60000});
 const native=await page.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;return{secure:isSecureContext,scope:registration.scope,permission:Notification.permission,subscribed:Boolean(await registration.pushManager.getSubscription())};});assert(native.secure&&native.subscribed);assert.equal(native.permission,'granted');assert(native.scope.startsWith(session.origin));
 checks.push('real HTTPS service worker and native Chrome PushManager subscription through FG controls; browser permission granted by test automation, not human mobile evidence');await capture('PWA và Push trên HTTPS','Service worker và đăng ký Push native hoạt động qua địa chỉ HTTPS; Chrome PC kiểm tra kết nối, chưa là nghiệm thu điện thoại.');
 phase='actual-delivery';
 await page.goto('about:blank');
 await expect.poll(async()=>{const response=await fetch('http://127.0.0.1:'+session.controlPort+'/status',{headers:{Authorization:'Bearer '+session.controlToken}});const status=await response.json();return status.deliveries.filter(item=>item.status==='accepted').length;},{timeout:160000,intervals:[3000]}).toBeGreaterThanOrEqual(2);
 await page.goto(session.origin+'/notifications',{waitUntil:'domcontentloaded'});
 const notifications=await page.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;return(await registration.getNotifications()).map(n=>({title:n.title,tag:n.tag,url:n.data?.url}));});assert(notifications.length>=2);for(const notice of notifications){assert.equal(notice.title,'FG');assert(new URL(notice.url,session.origin).origin===session.origin);}
 checks.push('two actual native background notification receipts on the public HTTPS origin after automatic real invite/reminder producers');await capture('Push thật đã đến Chrome','Lời mời và nhắc lịch đi qua backend/worker/provider thật trên origin HTTPS; không có trang FG mở lúc chờ.');
 phase='mobile-viewport';await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await capture('FG ở kích thước điện thoại','Kiểm tra bố cục 390px qua HTTPS; đây là viewport Chrome PC, không thay thiết bị thật.');checks.push('390px FG layout has no horizontal overflow; desktop viewport only');
 phase='logout';await page.getByTestId('logout-button').click();await expect(page.getByTestId('guest-login-cta')).toBeVisible({timeout:20000});
 // Verify guest status in page without serializing the Response object.
 assert.equal(await page.evaluate(async()=>(await fetch('/api/v1/me',{cache:'no-store'})).status),401);
 checks.push('real HTTPS logout revokes current account session');await capture('Kết thúc kiểm tra HTTPS','Đăng xuất thật; phiên PC đã thu hồi. Tài khoản điện thoại vẫn sẵn sàng để người dùng kiểm thử.','SUCCEEDED');
}catch(error){failed=true;fs.writeFileSync(dir+'/failure.json',JSON.stringify({at:new Date().toISOString(),phase,name:error.name,message:'HTTPS_CHECK_FAILED_REVIEW_PRIVATE_DIAGNOSTICS'},null,2)+'\n');if(page&&!page.isClosed()&&page.url().startsWith(session.origin))try{await capture('Lỗi kiểm tra HTTPS','Kiểm tra dừng tại '+phase+'; chưa xác nhận bản test sẵn sàng.','FAILED');}catch{};fs.writeFileSync('.runtime/t36/tunnel/https-check-private-error.txt',String(error.stack??error));}
finally{await context?.close();fs.writeFileSync(dir+'/result.json',JSON.stringify({startedAt,completedAt:new Date().toISOString(),origin:session.origin,phase,success:!failed,checks,captures,headed:true,physicalDeviceEvidence:false,canonicalBuildUnchanged:true},null,2)+'\n');}
console.log(JSON.stringify({runId,success:!failed,phase,checks:checks.length,captures:captures.length,physicalDeviceAcceptancePending:true}));process.exitCode=failed?1:0;
