import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import {randomUUID} from 'node:crypto';

let fixture:ChildProcess,base='',identity:{id:string;cookie:string};
const pending=new Map<string,(message:Record<string,unknown>)=>void>();
const evidenceDir=process.env.FG_GAME_EVIDENCE_DIR??'quality/evidence/GAME-LOGO-FE';
test.beforeAll(async()=>{
 const reservation=net.createServer();await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=(reservation.address() as net.AddressInfo).port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));base=`http://localhost:${port}`;
 fs.mkdirSync(`${evidenceDir}/screenshots`,{recursive:true});
 fixture=spawn(process.execPath,['quality/evidence/GAME-LOGO-FE/fixture-server.mjs'],{cwd:process.cwd(),env:{...process.env,FG_THEME_WEB_PORT:String(port)},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 fixture.on('message',(message:Record<string,unknown>)=>{if(typeof message.id==='string'){pending.get(message.id)?.(message);pending.delete(message.id);}});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Real API/PG/Redis fixture startup timed out')),30000);fixture.on('message',(message:Record<string,unknown>)=>{if(message.kind==='ready'){identity=message.identity as typeof identity;clearTimeout(timer);resolve();}if(message.kind==='failed'){clearTimeout(timer);reject(new Error('Real fixture failed; secrets omitted'));}});fixture.once('exit',()=>{clearTimeout(timer);reject(new Error('Real fixture exited during startup'));});});
});
test.afterAll(async()=>{if(fixture&&fixture.exitCode===null)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{fixture.kill();reject(new Error('Owned schema/Redis cleanup timed out'));},10000);fixture.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error('Owned fixture cleanup failed'));});fixture.send({kind:'stop'});});});
async function socketState(){const id=randomUUID();return await new Promise<{socketIds:string[];events:unknown[]}>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Socket inspection timeout')),5000);pending.set(id,message=>{clearTimeout(timer);resolve(message as unknown as {socketIds:string[];events:unknown[]});});fixture.send({id,kind:'sockets'});});}
async function sockets(){return(await socketState()).socketIds;}
async function theme(page:Page,mode:string){if(await page.locator('html').getAttribute('data-theme')!==mode)await page.getByRole('button',{name:/Chuyển sang/}).click();await expect(page.locator('html')).toHaveAttribute('data-theme',mode);}
async function games(page:Page){const response=await page.request.get(base+'/api/v1/games');expect(response.status()).toBe(200);return await response.json() as {id:string;title:string}[];}

test('fixed 72px rail, 46px rows and 24px logos at every desktop/tablet breakpoint',async({page})=>{
 await page.goto(base);await expect(page.getByRole('combobox',{name:'Chọn game'})).toBeVisible();
 for(const mode of ['light','dark'])for(const width of [1024,1200,1280,1440]){
  await page.setViewportSize({width,height:900});await theme(page,mode);
  const rail=page.getByRole('complementary',{name:'Game và điều hướng'});expect((await rail.boundingBox())!.width).toBe(72);
  const controls=rail.getByRole('navigation',{name:'Chọn game Lobby'}).getByRole('button');await expect(controls).toHaveCount(7);
  for(const button of await controls.all()){expect((await button.boundingBox())!.height).toBeCloseTo(46,4);const logo=button.locator('.fg-game-logo');expect((await logo.boundingBox())!.width).toBeCloseTo(24,4);expect(await logo.evaluate(node=>[getComputedStyle(node).width,getComputedStyle(node).height])).toEqual(['24px','24px']);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:/mở rộng|thu gọn sidebar/i})).toHaveCount(0);
  await page.screenshot({path:`${evidenceDir}/screenshots/${mode}-rail-${width}.png`,fullPage:true});
 }
 await page.reload();expect((await page.getByRole('complementary',{name:'Game và điều hướng'}).boundingBox())!.width).toBe(72);
});
test('mouse and keyboard choose all seven real catalogue games and focus shows full tooltip',async({page})=>{
 await page.goto(base);const catalogue=await games(page);expect(catalogue).toHaveLength(7);
 for(const [index,game]of catalogue.entries()){
  const button=page.getByRole('navigation',{name:'Chọn game Lobby'}).getByRole('button',{name:game.title,exact:true});
  if(index%2){await button.focus();await expect(page.getByRole('tooltip')).toHaveText(game.title);await page.keyboard.press('Enter');}else await button.click();
  await expect(button).toHaveAttribute('aria-current','page');await expect(page.getByRole('combobox',{name:'Chọn game'})).toHaveValue(game.id);await expect(page.getByRole('heading',{name:`Lobby · ${game.title} — FG`,exact:true})).toBeVisible();
 }
});
test('mobile drawer retains full names, native focus and bounded layout at 360/390px',async({page})=>{
 await page.goto(base);
 for(const mode of ['light','dark'])for(const width of [360,390]){
  await page.setViewportSize({width,height:844});await theme(page,mode);
  const opener=page.getByRole('button',{name:'Mở điều hướng game'});await opener.click();
  const drawer=page.getByRole('dialog',{name:'Điều hướng game'});await expect(drawer).toBeVisible();
  const chosen=drawer.getByRole('button',{name:'Valorant',exact:true});await expect(chosen).toBeVisible();await expect(chosen.locator('.fg-game-name')).toBeVisible();
  await page.screenshot({path:`${evidenceDir}/screenshots/${mode}-drawer-${width}.png`,fullPage:true});
  await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(opener).toBeFocused();
  await opener.click();await chosen.click();await expect(drawer).toHaveCount(0);await expect(page.getByRole('heading',{name:'Lobby · Valorant — FG',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${evidenceDir}/screenshots/${mode}-mobile-${width}.png`,fullPage:true});
 }
});
test('real native session, draft node and existing sockets survive themes and rail/drawer resize',async({page,context})=>{
 await context.addCookies([{name:'better-auth.session_token',value:identity.cookie,url:base,httpOnly:true,sameSite:'Lax'}]);await page.goto(base);
 await page.getByRole('button',{name:'Tin nhắn',exact:true}).click();await expect(page.getByText('Chưa có cuộc trò chuyện nào.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Đóng tin nhắn',exact:true}).click();
 const composer=page.getByRole('textbox',{name:'Tin nhắn Lobby'});await expect(composer).toBeEditable();await composer.fill('Bản nháp chưa gửi');await composer.evaluate(node=>node.setAttribute('data-logo-draft-witness','original'));
 // Lobby chat and direct messages each own one root-namespace connection.
 // Capture after both authenticated hooks initialize, rather than during the auth transition.
 await expect(page.locator('.fg-chat-status')).toContainText('Đã kết nối');await expect.poll(async()=>(await sockets()).length).toBe(2);const before=await sockets();const initialized=await socketState();
 for(const width of [1440,1024,360,390,1280]){await page.setViewportSize({width,height:900});for(const mode of ['light','dark']){await theme(page,mode);await expect(composer).toHaveValue('Bản nháp chưa gửi');await expect(composer).toHaveAttribute('data-logo-draft-witness','original');expect(await sockets()).toEqual(before);const me=await page.request.get(base+'/api/v1/me');expect(me.status()).toBe(200);expect((await me.json()).id).toBe(identity.id);}}
 const final=await socketState();expect(final.events).toEqual(initialized.events);fs.writeFileSync(`${evidenceDir}/socket-lifecycle.json`,JSON.stringify({initialized,final},null,2)+'\n');
});
test('FG logo, favicon and complete manifest icon URLs serve real images with correct sizes/MIME',async({page})=>{
 await page.goto(base+'/login');await expect(page.getByRole('link',{name:'FG',exact:true})).toHaveCount(1);await expect(page.locator('.fg-auth-header .fg-brand-mark path')).toHaveCount(2);
 const icon=page.locator('link[rel="icon"]');await expect(icon).toHaveAttribute('href','/favicon.svg');
 const expected:Record<string,string>={'/favicon.svg':'image/svg+xml','/favicon.ico':'image/','/apple-touch-icon.png':'image/png','/brand/fg-light.svg':'image/svg+xml','/brand/fg-dark.svg':'image/svg+xml','/manifest.webmanifest':'application/manifest+json'};
 for(const [url,mime]of Object.entries(expected)){const response=await page.request.get(base+url);expect(response.status(),url).toBe(200);expect(response.headers()['content-type']).toContain(mime);}
 const manifest=await(await page.request.get(base+'/manifest.webmanifest')).json();expect(manifest.name).toBe('FG');expect(manifest.icons).toHaveLength(4);
 for(const item of manifest.icons){expect(['any','maskable']).toContain(item.purpose);const response=await page.request.get(base+item.src);expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('image/png');const size=Number(item.sizes.split('x')[0]);const dimensions=await page.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();return[image.naturalWidth,image.naturalHeight];},item.src);expect(dimensions).toEqual([size,size]);}
 for(const mode of ['light','dark']){await theme(page,mode);await page.screenshot({path:`${evidenceDir}/screenshots/${mode}-login-brand.png`,fullPage:true});}
});
test('a broken game image keeps an accessible clickable fallback and does not hotlink',async({page})=>{
 await page.route('**/game-logos/valorant.png',route=>route.abort());await page.goto(base);const button=page.getByRole('navigation',{name:'Chọn game Lobby'}).getByRole('button',{name:'Valorant',exact:true});await expect(button.locator('.fg-game-logo-fallback')).toHaveText('V');await button.click();await expect(page.getByRole('heading',{name:'Lobby · Valorant — FG',exact:true})).toBeVisible();
});
test('all seven game buttons have decoded local images in light/dark before task completion',async({page})=>{
 await page.goto(base);const catalogue=await games(page);
 for(const mode of ['light','dark']){await theme(page,mode);for(const game of catalogue){const button=page.getByRole('navigation',{name:'Chọn game Lobby'}).getByRole('button',{name:game.title,exact:true});const image=button.locator('img:visible');await expect(image,game.title).toHaveCount(1);await expect.poll(()=>image.evaluate(node=>(node as HTMLImageElement).complete&&(node as HTMLImageElement).naturalWidth>0)).toBe(true);}}
});
