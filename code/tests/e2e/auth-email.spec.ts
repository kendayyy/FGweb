import {test,expect,type Page} from '@playwright/test';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {parseEnv} from 'node:util';
test.use({trace:'off',video:'off',screenshot:'off'});
test.describe.configure({mode:'serial'});
let fixture:ChildProcess,discord:{id:string;email:string;cookie:string};
let createdEmail='';
const pending=new Map<string,(message:Record<string,unknown>)=>void>();
let base='';const password='  FG real UI password Ω  ',nextPassword='  FG changed UI password Ω  ';
async function freePort(port:number){const server=net.createServer();await new Promise<void>((resolve,reject)=>{server.once('error',()=>reject(new Error(`Required fixture port ${port} is occupied; no unrelated process stopped.`)));server.listen(port,'127.0.0.1',resolve);});await new Promise<void>(resolve=>server.close(()=>resolve()));}
async function mailedLink(to:string){const id=randomUUID();return await new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('No SMTP mail received by local fixture.'));},5000);pending.set(id,message=>{clearTimeout(timer);if(typeof message.link!=='string')reject(new Error('No mailed link.'));else resolve(message.link);});fixture.send({id,kind:'mail',to});});}
async function expireVerification(to:string){const id=randomUUID();return await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Verification fixture expiry timed out.')),5000);pending.set(id,message=>{clearTimeout(timer);if(message.expired===true)resolve();else reject(new Error('No owned verification token expired.'));});fixture.send({id,kind:'expire-verification',to});});}
async function openLink(page:Page,link:string){try{await page.goto(link);}catch{throw new Error('Mailed link navigation failed (token omitted).');}}
async function login(page:Page,email:string,value=password){await page.goto(`${base}/login`);await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(value);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();}
async function capture(page:Page){for(const [width,height]of [[1440,900],[1280,800],[390,844],[360,800]]){
 await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);await expect(page.getByRole('heading',{name:'Đăng nhập FG'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 const undersized=await page.locator('a,button,input').evaluateAll(elements=>elements.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<44||r.height<44);}).map(e=>e.tagName));expect(undersized).toEqual([]);
 await page.screenshot({path:`quality/evidence/AUTH02-FE/screenshots/${width}x${height}-login.png`,fullPage:true});
}}
test.beforeAll(async()=>{
 await freePort(465);const reservation=net.createServer();await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));const webPort=(reservation.address() as net.AddressInfo).port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));base=`http://localhost:${webPort}`;
 fs.mkdirSync('.runtime/auth02-fe',{recursive:true});fs.mkdirSync('quality/evidence/AUTH02-FE/screenshots',{recursive:true});
 execFileSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout','.runtime/auth02-fe/key.pem','-out','.runtime/auth02-fe/cert.pem','-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 fixture=spawn(process.execPath,['quality/evidence/AUTH02-FE/fixture-server.mjs'],{cwd:process.cwd(),env:{...process.env,FG_AUTH02_WEB_PORT:String(webPort),NODE_EXTRA_CA_CERTS:path.resolve('.runtime/auth02-fe/cert.pem')},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 fixture.stdout?.on('data',chunk=>console.log('Safe fixture proof:',String(chunk)));const protectedValues=Object.values(parseEnv(fs.readFileSync('.env.local','utf8'))).filter((value):value is string=>typeof value==='string'&&value.length>=8);
 fixture.stderr?.on('data',chunk=>{let text=String(chunk);for(const value of protectedValues)text=text.replaceAll(value,'[REDACTED]');console.log('Fixture diagnostic:',text.replace(/https?:\/\/\S+/g,'[URL]'));});
 fixture.on('message',(message:Record<string,unknown>)=>{if(typeof message.id==='string'){pending.get(message.id)?.(message);pending.delete(message.id);}});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Real API/DB/TLS SMTP fixture startup timed out.')),45000);fixture.on('message',(message:Record<string,unknown>)=>{if(message.kind==='ready'){discord=message.discord as typeof discord;clearTimeout(timer);resolve();}else if(message.kind==='failed'){clearTimeout(timer);reject(new Error('Real fixture setup failed; credentials/tokens omitted.'));}});fixture.once('exit',()=>{clearTimeout(timer);reject(new Error('Real fixture exited during setup.'));});});
});
test.afterAll(async()=>{
 if(fixture&&fixture.exitCode===null){await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{fixture.kill();reject(new Error('Owned fixture cleanup timed out.'));},10000);fixture.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error('Owned fixture cleanup failed.'));});fixture.send({kind:'stop'});});}
 for(const file of ['.runtime/auth02-fe/key.pem','.runtime/auth02-fe/cert.pem'])if(fs.existsSync(file))fs.unlinkSync(file);
});
test('approved login layout, keyboard controls and native Discord authorization',async({page})=>{
 page.on('pageerror',error=>console.log('Initial empty login page error:',error.message.replace(/https?:\/\/\S+/g,'[URL]')));
 page.on('console',message=>{if(message.type()==='error')console.log('Initial empty login console:',message.text().replace(/https?:\/\/\S+/g,'[URL]'));});
 await page.goto(`${base}/login`);await capture(page);await page.setViewportSize({width:1280,height:800});
 await page.getByLabel('Email',{exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByLabel('Mật khẩu',{exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Hiện mật khẩu'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByLabel('Mật khẩu',{exact:true})).toHaveAttribute('type','text');await page.getByRole('button',{name:'Ẩn mật khẩu'}).click();
 // Actual auth middleware generates OAuth state. Prevent only external navigation
 // so the human is not asked to authenticate again in this isolated fixture.
 const response=await page.request.post(`${base}/api/auth/sign-in/social`,{headers:{Origin:base},data:{provider:'discord',callbackURL:`${base}/`,errorCallbackURL:`${base}/login?error=oauth_denied`}});
 expect(response.status()).toBe(200);const data=await response.json();const oauth=new URL(data.url);expect(oauth.hostname).toBe('discord.com');expect(oauth.searchParams.has('state')).toBe(true);
});
test('real signup, duplicate, verification, onboarding, change and reset revoke old session',async({page})=>{
 const email=`web-${randomUUID()}@fixture.invalid`;createdEmail=email;
 await page.goto(`${base}/register`);await page.getByLabel('Tên hiển thị').fill('FG UI Gamer');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByLabel('Nhập lại mật khẩu').fill(password);await page.getByRole('button',{name:'Tạo tài khoản'}).click();await expect(page.getByRole('status')).toContainText('Nếu');
 let verification=await mailedLink(email);
 await login(page,email);await expect(page.getByRole('alert')).toContainText('xác minh');
 await expireVerification(email);await openLink(page,verification);await expect(page.getByRole('heading',{name:'Xác minh email'})).toBeVisible();await page.getByRole('button',{name:'Xác minh email'}).click();await expect(page.getByRole('alert')).toContainText('hết hạn');await expect.poll(()=>new URL(page.url()).searchParams.has('token')).toBe(false);
 await page.getByRole('button',{name:'Gửi lại xác minh'}).click();await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:'Gửi lại xác minh'}).click();await expect(page.getByRole('status')).toContainText('Nếu');verification=await mailedLink(email);
 await openLink(page,verification);await page.getByRole('button',{name:'Xác minh email'}).click();await expect(page.getByRole('status')).toContainText('Đã xác minh email');expect((await page.request.get(base+'/api/v1/me')).status()).toBe(401);
 await openLink(page,verification);await page.getByRole('button',{name:'Xác minh email'}).click();await expect(page.getByRole('alert')).toContainText('Liên kết');expect((await page.request.get(base+'/api/v1/me')).status()).toBe(401);
 await login(page,email);await expect(page.getByTestId('onboarding-form')).toBeVisible();
 await page.getByLabel('Biệt danh (Nickname) *',{exact:true}).fill('FG UI Gamer');await page.getByRole('checkbox',{name:'Valorant',exact:true}).check();await page.getByRole('button',{name:/Hoàn tất|Hoàn thành/}).click();
 await expect(page.getByRole('link',{name:'Mật khẩu',exact:true})).toBeVisible();
 await page.goto(`${base}/auth/password`);await page.getByLabel('Mật khẩu hiện tại').fill(password);await page.getByLabel('Mật khẩu mới').fill(nextPassword);await page.getByLabel('Nhập lại mật khẩu').fill(nextPassword);await page.getByRole('button',{name:'Đổi mật khẩu'}).click();await expect(page.getByRole('status')).toContainText('Đã đổi');
 const cookies=await page.context().cookies();const previous=cookies.find(c=>c.name==='better-auth.session_token');expect(Boolean(previous)).toBe(true);
 await page.goto(`${base}/auth/forgot`);await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:'Gửi liên kết đặt lại'}).click();await expect(page.getByRole('status')).toContainText('Nếu');const reset=await mailedLink(email);await openLink(page,reset);
 await expect(page.getByRole('heading',{name:'Đặt lại mật khẩu'})).toBeVisible();expect(new URL(page.url()).searchParams.has('token')).toBe(false);await page.getByLabel('Mật khẩu mới').fill(password);await page.getByLabel('Nhập lại mật khẩu').fill(password);await page.getByRole('button',{name:'Lưu mật khẩu'}).click();await expect(page.getByRole('status')).toContainText('Đã đặt lại');
 const denied=await page.request.get(`${base}/api/v1/me`,{headers:{Cookie:`better-auth.session_token=${previous!.value}`}});expect(denied.status()).toBe(401);
 await openLink(page,reset);await expect(page.getByRole('heading',{name:'Đặt lại mật khẩu'})).toBeVisible();await expect(page.getByRole('alert')).toContainText('Liên kết');expect((await page.request.get(`${base}/api/v1/me`)).status()).toBe(401);
 await login(page,email,password);await expect(page.getByRole('link',{name:'Mật khẩu',exact:true})).toBeVisible();
 await page.goto(`${base}/register`);await page.getByLabel('Tên hiển thị').fill('Another name');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByLabel('Nhập lại mật khẩu').fill(password);await page.getByRole('button',{name:'Tạo tài khoản'}).click();await expect(page.getByRole('status')).toContainText('Nếu');
});
test('existing Discord gains password only after fresh mailed session-bound proof',async({page})=>{
 await page.context().addCookies([{name:'better-auth.session_token',value:discord.cookie,url:base}]);await page.goto(`${base}/auth/password`);await page.getByRole('button',{name:'Gửi email thêm mật khẩu'}).click();await expect(page.getByRole('status')).toContainText('Đã gửi');
 const link=await mailedLink(discord.email);
 const outsider=await page.context().browser()!.newContext(),other=await outsider.newPage();
 try{await login(other,createdEmail,password);await expect(other.getByRole('link',{name:'Mật khẩu',exact:true})).toBeVisible();await openLink(other,link);await other.getByLabel('Mật khẩu mới').fill(password);await other.getByLabel('Nhập lại mật khẩu').fill(password);await other.getByRole('button',{name:'Lưu mật khẩu'}).click();await expect(other.getByRole('alert')).toContainText('phiên đăng nhập khác');}finally{await outsider.close();}
 await openLink(page,link);await expect(page.getByRole('heading',{name:'Thêm mật khẩu'})).toBeVisible();await expect.poll(()=>new URL(page.url()).searchParams.has('token')).toBe(false);await page.getByLabel('Mật khẩu mới').fill(password);await page.getByLabel('Nhập lại mật khẩu').fill(password);await page.getByRole('button',{name:'Lưu mật khẩu'}).click();await expect(page.getByRole('status')).toContainText('Đã thêm');
 const me=await page.request.get(`${base}/api/v1/me`);expect(me.status()).toBe(200);expect((await me.json()).id).toBe(discord.id);
 await page.goto(`${base}/auth/password`);await expect(page.getByLabel('Mật khẩu hiện tại')).toBeVisible();
});
