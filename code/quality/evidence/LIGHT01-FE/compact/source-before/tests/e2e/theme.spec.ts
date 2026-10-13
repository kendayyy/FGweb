import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
test.describe.configure({mode:'serial'});
let fixture:ChildProcess,base='',identity:{id:string;cookie:string};
const pending=new Map<string,(message:Record<string,unknown>)=>void>();
const evidenceDir=process.env.FG_THEME_EVIDENCE_DIR??'quality/evidence/LIGHT01-FE';
test.beforeAll(async()=>{
 const reservation=net.createServer();await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=(reservation.address() as net.AddressInfo).port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));base=`http://localhost:${port}`;
 fs.mkdirSync(`${evidenceDir}/screenshots`,{recursive:true});
 fixture=spawn(process.execPath,['quality/evidence/LIGHT01-FE/fixture-server.mjs'],{cwd:process.cwd(),env:{...process.env,FG_THEME_WEB_PORT:String(port)},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 fixture.on('message',(message:Record<string,unknown>)=>{if(typeof message.id==='string'){pending.get(message.id)?.(message);pending.delete(message.id);}});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Real API/PG/Redis fixture startup timed out')),30000);fixture.on('message',(message:Record<string,unknown>)=>{if(message.kind==='ready'){identity=message.identity as typeof identity;clearTimeout(timer);resolve();}if(message.kind==='failed'){clearTimeout(timer);reject(new Error('Real fixture failed; secrets omitted'));}});fixture.once('exit',()=>{clearTimeout(timer);reject(new Error('Real fixture exited during startup'));});});
});
test.afterAll(async()=>{if(fixture&&fixture.exitCode===null)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{fixture.kill();reject(new Error('Owned schema/Redis cleanup timed out'));},10000);fixture.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error('Owned fixture cleanup failed'));});fixture.send({kind:'stop'});});});
async function select(page:Page,label:string){await page.getByRole('button',{name:/Chế độ màu:/}).click();await page.getByRole('menuitemradio',{name:label,exact:true}).click();}
async function sockets(){const id=randomUUID();return await new Promise<string[]>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Real socket inspection timeout')),5000);pending.set(id,message=>{clearTimeout(timer);resolve(message.socketIds as string[]);});fixture.send({id,kind:'sockets'});});}
async function assertTheme(page:Page,theme:string){await expect(page.locator('html')).toHaveAttribute('data-theme',theme);expect(await page.locator('html').evaluate(node=>getComputedStyle(node).colorScheme)).toBe(theme);}

test('Classic follows effective FG theme rather than device-only dark mode and honors reduced motion',async({page})=>{
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'no-preference'});
 await page.goto(`${base}/login`);
 const icon=page.getByRole('button',{name:/Chế độ màu:/}).locator('svg').first();
 const circle=icon.locator('circle');
 await expect(icon.locator('clipPath')).toHaveCount(1);
 const clip=await icon.locator('clipPath').getAttribute('id');
 const scale=()=>circle.evaluate(node=>{const style=getComputedStyle(node);return new DOMMatrix(style.transform).a*(parseFloat(style.scale)||1);});
 await expect.poll(scale).toBeCloseTo(1.7,2);
 await select(page,'Sáng');await assertTheme(page,'light');
 await expect.poll(scale).toBeCloseTo(1,2);
 expect(await icon.locator('clipPath').getAttribute('id')).toBe(clip);
 await page.emulateMedia({colorScheme:'light'});await select(page,'Tối');
 await expect.poll(scale).toBeCloseTo(1.7,2);
 await select(page,'Hệ thống');await expect.poll(scale).toBeCloseTo(1,2);
 await page.emulateMedia({colorScheme:'dark'});await expect.poll(scale).toBeCloseTo(1.7,2);
 await expect(page.getByRole('button',{name:'Chế độ màu: Hệ thống'})).toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});await select(page,'Sáng');
 await expect.poll(scale).toBeCloseTo(1,2);
 const durations=await icon.locator('circle,path').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).transitionDuration));
 for(const duration of durations)for(const value of duration.split(','))expect(parseFloat(value)).toBeLessThanOrEqual(.00001);
});

test('three choices, reload, device changes, keyboard focus and cross-tab clear',async({page,context})=>{
 await page.emulateMedia({colorScheme:'light'});await page.goto(`${base}/login`);await assertTheme(page,'light');
 const trigger=page.getByRole('button',{name:'Chế độ màu: Hệ thống'});await trigger.focus();await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitemradio',{name:'Hệ thống'})).toBeFocused();await page.keyboard.press('Home');await expect(page.getByRole('menuitemradio',{name:'Sáng'})).toBeFocused();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await assertTheme(page,'dark');await expect(page.getByRole('button',{name:'Chế độ màu: Tối'})).toBeFocused();
 await page.reload();await assertTheme(page,'dark');await page.emulateMedia({colorScheme:'light'});await assertTheme(page,'dark');
 await select(page,'Hệ thống');await page.emulateMedia({colorScheme:'dark'});await assertTheme(page,'dark');await expect(page.getByRole('button',{name:'Chế độ màu: Hệ thống'})).toBeVisible();await page.emulateMedia({colorScheme:'light'});await assertTheme(page,'light');
 const second=await context.newPage();await second.emulateMedia({colorScheme:'light'});await second.goto(`${base}/login`);await select(second,'Tối');await assertTheme(page,'dark');await select(page,'Sáng');await assertTheme(second,'light');
 await second.evaluate(()=>localStorage.removeItem('fg.theme'));await expect(page.getByRole('button',{name:'Chế độ màu: Hệ thống'})).toBeVisible();await select(second,'Tối');await assertTheme(page,'dark');await second.evaluate(()=>localStorage.clear());await assertTheme(page,'light');
 await page.getByRole('button',{name:/Chế độ màu:/}).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:/Chế độ màu:/})).toBeFocused();await expect(page.getByRole('menu')).toHaveCount(0);await second.close();
});

test('stored preference is applied in the head before React and styles paint',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('fg.theme','dark');const observer=new MutationObserver(()=>{const root=document.documentElement;if(root?.dataset.theme){(window as unknown as {firstTheme:string}).firstTheme=root.dataset.theme;observer.disconnect();}});observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-theme']});});
 await page.emulateMedia({colorScheme:'light'});await page.goto(`${base}/login`);await assertTheme(page,'dark');expect(await page.evaluate(()=>(window as unknown as {firstTheme:string}).firstTheme)).toBe('dark');
 expect(await page.locator('#fg-theme-init').evaluate(node=>{const before=[...document.head.children];return before.slice(0,before.indexOf(node)).every(element=>!['LINK','STYLE'].includes(element.tagName));})).toBe(true);
});

test('blocked storage remains usable and invalid values default to system',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new DOMException('Blocked','SecurityError');};Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError');};});await page.emulateMedia({colorScheme:'dark'});await page.goto(`${base}/login`);await expect(page.getByRole('button',{name:'Chế độ màu: Hệ thống'})).toBeVisible();await select(page,'Sáng');await assertTheme(page,'light');await page.reload();await assertTheme(page,'dark');
 const invalid=await page.context().newPage();await invalid.addInitScript(()=>localStorage.setItem('fg.theme','unexpected'));await invalid.emulateMedia({colorScheme:'light'});await invalid.goto(`${base}/login`);await expect(invalid.getByRole('button',{name:'Chế độ màu: Hệ thống'})).toBeVisible();await assertTheme(invalid,'light');await invalid.close();
});

test('native authenticated session, actual Socket.IO connection and unsent composer survive theme changes',async({page,context})=>{
 await context.addCookies([{name:'better-auth.session_token',value:identity.cookie,url:base,httpOnly:true,sameSite:'Lax'}]);await page.goto(`${base}/`);
 const composer=page.getByRole('textbox',{name:'Tin nhắn Lobby'});await expect(composer).toBeEditable();await composer.fill('Chưa gửi — tìm đồng đội');await composer.evaluate(node=>node.setAttribute('data-theme-draft-witness','same-node'));
 await expect.poll(async()=> (await sockets()).length).toBeGreaterThan(0);const before=await sockets();const me=await page.request.get(`${base}/api/v1/me`);expect(me.status()).toBe(200);expect((await me.json()).id).toBe(identity.id);
 for(const label of ['Sáng','Tối','Hệ thống']){await select(page,label);await expect(composer).toHaveValue('Chưa gửi — tìm đồng đội');await expect(composer).toHaveAttribute('data-theme-draft-witness','same-node');expect(await sockets()).toEqual(before);expect((await page.request.get(`${base}/api/v1/me`)).status()).toBe(200);}
 for(const [width,height] of [[1440,900],[1280,800],[390,844],[360,800]]){
  await page.setViewportSize({width,height});const header=page.locator('.fg-app-header');const boundary=await header.boundingBox();
  if(width<1024){expect(boundary!.height).toBeLessThanOrEqual(108);const bottom=await page.getByRole('navigation',{name:'Điều hướng điện thoại'}).boundingBox();expect(bottom!.y+bottom!.height).toBeLessThanOrEqual(height);}
  for(const control of await header.locator('button,a').all()){if(!await control.isVisible())continue;const bounds=await control.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(boundary!.y+boundary!.height);}
  await page.screenshot({path:`${evidenceDir}/screenshots/authenticated-system-${width}x${height}.png`,fullPage:true});
 }
});

async function contrast(page:Page){
 return page.evaluate(()=>{
  const rgb=(value:string)=>value.match(/[\d.]+/g)!.map(Number);
  const luminance=(c:number[])=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a:number[],b:number[])=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const background=(node:Element):number[]=>{const color=rgb(getComputedStyle(node).backgroundColor);if((color[3]??1)>=1)return color;const behind=node.parentElement?background(node.parentElement):[255,255,255];return color.slice(0,3).map((v,i)=>v*(color[3]??1)+behind[i]*(1-(color[3]??1)));};
  const failures:string[]=[];let measured=0;
  for(const node of document.querySelectorAll('a,button,label,input,p,h1,h2,h3,span,small')){const rect=node.getBoundingClientRect(),style=getComputedStyle(node);if(!rect.width||!rect.height||style.visibility==='hidden'||style.opacity==='0'||node.closest('.fg-sr-only')||node.matches(':disabled'))continue;const direct=[...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent).join('').trim();if(!direct&&!node.matches('input'))continue;const score=ratio(rgb(style.color),background(node));measured++;if(score<4.5)failures.push(`${node.tagName}.${node.className}: ${score.toFixed(2)}`);}
  const root=getComputedStyle(document.documentElement);const resolve=(name:string)=>{const probe=document.createElement('i');probe.style.color=`var(${name})`;document.body.append(probe);const color=rgb(getComputedStyle(probe).color);probe.remove();return color;};
  const surfaces=['--bg-canvas','--bg-sidebar','--bg-chat','--bg-panel','--bg-raised','--bg-hover','--bg-input','--bg-composer'];const controls=surfaces.map(name=>({surface:name,focus:ratio(resolve('--color-focus'),resolve(name)),border:ratio(resolve('--border-color'),resolve(name))}));
  return {failures,measured,controls,colorScheme:root.colorScheme};
 });
}

test('actual light/dark login and Lobby screenshots, text/control contrast and 360px layout',async({page})=>{
 const measurements=[];
 for(const mode of ['light','dark'])for(const route of ['login','']){
  await page.goto(`${base}/${route}`);await select(page,mode==='light'?'Sáng':'Tối');if(!route)await expect(page.getByRole('heading',{name:/Lobby ·/})).toBeVisible();
  for(const [width,height] of [[1440,900],[1280,800],[390,844],[360,800]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);await assertTheme(page,mode);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
   const trigger=page.getByRole('button',{name:/Chế độ màu:/});const bounds=await trigger.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(44);expect(bounds!.width).toBeGreaterThanOrEqual(44);
   await trigger.click();for(const option of await page.getByRole('menuitemradio').all()){const box=await option.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);}
   await page.getByRole('menuitemradio',{name:mode==='light'?'Sáng':'Tối',exact:true}).hover();
   const result=await contrast(page);expect(result.measured).toBeGreaterThan(5);expect(result.failures).toEqual([]);for(const control of result.controls){expect(control.focus).toBeGreaterThanOrEqual(3);if(mode==='light')expect(control.border).toBeGreaterThanOrEqual(3);}measurements.push({mode,route:route||'lobby',width,...result});
   await page.keyboard.press('Escape');await page.screenshot({path:`${evidenceDir}/screenshots/${mode}-${route||'lobby'}-${width}x${height}.png`,fullPage:true});
  }
 }
 fs.writeFileSync(`${evidenceDir}/contrast.json`,JSON.stringify(measurements,null,2)+'\n');
});
