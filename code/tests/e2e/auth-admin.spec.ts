import {test,expect,type Page} from '@playwright/test';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {parseEnv} from 'node:util';
test.use({trace:'off',video:'off',screenshot:'off'});
test.describe.configure({mode:'serial'});
let fixture:ChildProcess;
let soleAdmin:{id:string;email:string};
const pending=new Map<string,(message:Record<string,unknown>)=>void>();
let base='';const password='  FG real UI password Ω!  ';
async function freePort(port:number){const server=net.createServer();await new Promise<void>((resolve,reject)=>{server.once('error',()=>reject(new Error(`Required fixture port ${port} is occupied; no unrelated process stopped.`)));server.listen(port,'127.0.0.1',resolve);});await new Promise<void>(resolve=>server.close(()=>resolve()));}
async function mailedLink(to:string){const id=randomUUID();return await new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('No SMTP mail received by local fixture.'));},5000);pending.set(id,message=>{clearTimeout(timer);if(typeof message.link!=='string')reject(new Error('No mailed link.'));else resolve(message.link);});fixture.send({id,kind:'mail',to});});}
async function openLink(page:Page,link:string){try{await page.goto(link);}catch{throw new Error('Mailed link navigation failed (token omitted).');}}
async function login(page:Page,email:string,value=password){await page.goto(`${base}/login`);await page.getByLabel('Email hoặc tên đăng nhập',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(value);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();}
async function capture(page:Page){for(const [width,height]of [[1440,900],[1280,800],[390,844],[360,800]]){
 await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);await expect(page.getByRole('heading',{name:'Đăng nhập FG'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 const undersized=await page.locator('a,button,input').evaluateAll(elements=>elements.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<44||r.height<44);}).map(e=>e.tagName));expect(undersized).toEqual([]);
 await page.screenshot({path:`quality/evidence/AUTH-ADMIN-SINGLE/screenshots/${width}x${height}-login.png`,fullPage:true});
}}
test.beforeAll(async()=>{
 await freePort(465);const reservation=net.createServer();await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));const webPort=(reservation.address() as net.AddressInfo).port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));base=`http://localhost:${webPort}`;
 fs.mkdirSync('.runtime/auth-admin',{recursive:true});fs.mkdirSync('quality/evidence/AUTH-ADMIN-SINGLE/screenshots',{recursive:true});
 execFileSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout','.runtime/auth-admin/key.pem','-out','.runtime/auth-admin/cert.pem','-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 fixture=spawn(process.execPath,['quality/evidence/AUTH-ADMIN-SINGLE/fixture-server.mjs'],{cwd:process.cwd(),env:{...process.env,FG_AUTH02_WEB_PORT:String(webPort),NODE_EXTRA_CA_CERTS:path.resolve('.runtime/auth-admin/cert.pem')},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 fixture.stdout?.on('data',chunk=>console.log('Safe fixture proof:',String(chunk)));const protectedValues=Object.values(parseEnv(fs.readFileSync('.env.local','utf8'))).filter((value):value is string=>typeof value==='string'&&value.length>=8);
 fixture.stderr?.on('data',chunk=>{let text=String(chunk);for(const value of protectedValues)text=text.replaceAll(value,'[REDACTED]');console.log('Fixture diagnostic:',text.replace(/https?:\/\/\S+/g,'[URL]'));});
 fixture.on('message',(message:Record<string,unknown>)=>{if(typeof message.id==='string'){pending.get(message.id)?.(message);pending.delete(message.id);}});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Real API/DB/TLS SMTP fixture startup timed out.')),45000);fixture.on('message',(message:Record<string,unknown>)=>{if(message.kind==='ready'){soleAdmin=message.admin as typeof soleAdmin;clearTimeout(timer);resolve();}else if(message.kind==='failed'){clearTimeout(timer);reject(new Error('Real fixture setup failed; credentials/tokens omitted.'));}});fixture.once('exit',()=>{clearTimeout(timer);reject(new Error('Real fixture exited during setup.'));});});
});
test.afterAll(async()=>{
 if(fixture&&fixture.exitCode===null){await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{fixture.kill();reject(new Error('Owned fixture cleanup timed out.'));},10000);fixture.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error('Owned fixture cleanup failed.'));});fixture.send({kind:'stop'});});}
 for(const file of ['.runtime/auth-admin/key.pem','.runtime/auth-admin/cert.pem'])if(fs.existsSync(file))fs.unlinkSync(file);
});

async function adminRole(){const id=randomUUID();return await new Promise<boolean>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Role check timed out')),5000);pending.set(id,message=>{clearTimeout(timer);resolve(message.allowed===true);});fixture.send({id,kind:'admin-role'});});}
test('reserved alias requires real email ownership, native session, logout and ban',async({page})=>{
 await page.goto(`${base}/login`);await capture(page);await page.setViewportSize({width:1280,height:800});
 await login(page,'kingame','FG!Admin7');await expect(page.getByRole('alert')).toContainText('xác minh');expect(await adminRole()).toBe(false);
 await page.goto(`${base}/auth/verify`);await page.getByLabel('Email',{exact:true}).fill(soleAdmin.email);await page.getByRole('button',{name:'Gửi lại xác minh'}).click();await expect(page.getByRole('status')).toContainText('Nếu');
 const link=await mailedLink(soleAdmin.email);await openLink(page,link);await page.getByRole('button',{name:'Xác minh email'}).click();await expect(page.getByRole('status')).toContainText('Đã xác minh');expect(await adminRole()).toBe(true);
 await login(page,'kingame','FG!Admin7');await expect(page.getByRole('heading',{name:'Hoàn tất hồ sơ ban đầu'})).toBeVisible();
 const me=await page.request.get(`${base}/api/v1/me`);expect(me.status()).toBe(200);expect((await me.json()).id).toBe(soleAdmin.id);
 const logout=await page.request.post(`${base}/api/auth/sign-out`,{headers:{Origin:base},data:{}});expect(logout.status()).toBe(200);expect((await page.request.get(`${base}/api/v1/me`)).status()).toBe(401);
 const id=randomUUID();await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Ban fixture timed out')),5000);pending.set(id,message=>{clearTimeout(timer);if(message.banned===true)resolve();else reject(new Error('Ban not committed'));});fixture.send({id,kind:'admin-ban'});});
 await login(page,'kingame','FG!Admin7');await expect(page.getByRole('alert')).toContainText('khóa');expect(await adminRole()).toBe(false);
 // Email identifier uses the same native credential and cannot bypass a ban.
 await login(page,soleAdmin.email,'FG!Admin7');await expect(page.getByRole('alert')).toContainText('khóa');
});
