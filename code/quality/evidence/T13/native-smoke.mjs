import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {NestFactory} from '@nestjs/core';
import {preview} from 'vite';
import {chromium,expect} from '@playwright/test';
import {makeSignature} from 'better-auth/crypto';
import * as tables from '@fg/database';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const schema=`t13_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const directory=`quality/evidence/T13/screenshots/${schema}`;fs.mkdirSync(directory,{recursive:true});
const secret='t13-native-test-secret-with-at-least-32-characters';
let app,web,browser,pool,createdSchema=false;
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});
const viewports=[{width:1440,height:900},{width:1280,height:800},{width:390,height:844},{width:360,height:800}];
const checks=[];
try{
 const scoped=new URL(env.DATABASE_URL);scoped.searchParams.set('options',`-c search_path=${schema}`);
 pool=new pg.Pool({connectionString:scoped.href,max:5,connectionTimeoutMillis:5000,statement_timeout:10000});await pool.query(`CREATE SCHEMA "${schema}"`);createdSchema=true;console.log('Owned native PostgreSQL schema created');
 const client=await pool.connect();try{await migrate(drizzle(client),{migrationsFolder:path.resolve('packages/database/migrations'),migrationsSchema:schema});}finally{client.release();}
 const games=await tables.seedGames(drizzle(pool,{schema:tables}));
 for(const [index,game]of games.entries())await pool.query(`INSERT INTO conversations(id,kind,lobby_id) VALUES($1,'LOBBY',$2)`,[`native-conversation-${index}`,game.lobbyId]);
 await pool.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('native-user','Nam','native-user@example.com',true,now(),now()),('native-peer','Linh','native-peer@example.com',true,now(),now())`);
 await pool.query(`INSERT INTO account(id,account_id,provider_id,user_id,created_at,updated_at) VALUES('native-account','native-discord','discord','native-user',now(),now())`);
 await pool.query(`INSERT INTO profiles(user_id,display_name) VALUES('native-user','Nam'),('native-peer','Linh')`);
 await pool.query(`INSERT INTO game_interests(id,user_id,game_id) VALUES('native-interest','native-user',$1)`,[games[0].id]);
 await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('native-session','native-user','native-token',now()+interval '1 day',now(),now())`);
 for(let index=0;index<65;index++)await pool.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id,created_at) VALUES($1,'native-conversation-0','native-peer',$2,$1,$3::timestamp)`,[`native-history-${String(index).padStart(3,'0')}`,index===64?'Có bạn nào chơi cùng tối nay không? 🙂':`Tin nhắn lịch sử ${String(index+1).padStart(2,'0')}`,`2026-10-04 12:${String(index%60).padStart(2,'0')}:00`]);
 const webPort=await freePort();Object.assign(process.env,env,{DATABASE_URL:scoped.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:`http://127.0.0.1:${webPort}`,BETTER_AUTH_URL:`http://127.0.0.1:${webPort}`});
 const {AppModule}=await import('../../../apps/api/dist/app.module.js');app=await NestFactory.create(AppModule,{logger:false});await app.listen(0,'127.0.0.1');const api=await app.getUrl();
 web=await preview({root:path.resolve('apps/web'),configFile:path.resolve('apps/web/vite.config.ts'),preview:{host:'127.0.0.1',port:webPort,strictPort:true,proxy:{'/api':api,'/socket.io':{target:api,ws:true}}}});
 const base=`http://127.0.0.1:${webPort}`;browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:viewports[0]});const page=await context.newPage();page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/socket.io'))console.log(JSON.stringify({socketHttpStatus:response.status(),transport:new URL(response.url()).searchParams.get('transport')}));});
 await page.goto(base);await expect(page.getByRole('combobox',{name:'Chọn game'})).toBeVisible();await expect(page.getByRole('textbox',{name:'Tin nhắn Lobby'})).toBeDisabled();await expect(page.getByText('Đã kết nối',{exact:true})).toBeVisible();checks.push('guest history and actual Socket.IO subscription with canonical ID');
 await context.addCookies([{name:'better-auth.session_token',value:`native-token.${await makeSignature('native-token',secret)}`,url:base,httpOnly:true,sameSite:'Lax'}]);await page.reload();await expect(page.getByRole('textbox',{name:'Tin nhắn Lobby'})).toBeEnabled();
 const draft=page.getByRole('textbox',{name:'Tin nhắn Lobby'});await draft.fill('Mình tham gia cùng nhé!');await page.getByRole('button',{name:'Gửi tin nhắn'}).click();await expect(page.locator('article').getByText('Mình tham gia cùng nhé!',{exact:true})).toHaveCount(1);await expect(draft).toHaveValue('');assert.equal((await pool.query(`SELECT id FROM messages WHERE content='Mình tham gia cùng nhé!' AND conversation_id='native-conversation-0'`)).rowCount,1);checks.push('authenticated actual message persistence and Redis event dedup');
 await page.evaluate(()=>document.fonts.ready);const list=page.locator('.fg-message-list');await list.evaluate(element=>{element.scrollTop=0;element.dispatchEvent(new Event('scroll'));});
 const anchor=await page.locator('[data-message-id]').first().getAttribute('data-message-id');const anchorElement=page.locator(`[data-message-id="${anchor}"]`);const anchorTop=(await anchorElement.boundingBox()).y;
 await page.getByRole('button',{name:'Xem tin trước'}).click();await expect(page.locator('[data-message-id]')).toHaveCount(66);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));console.log(JSON.stringify({anchorTop,afterTop:(await anchorElement.boundingBox()).y,anchorId:anchor,scrollTop:await list.evaluate(element=>element.scrollTop)}));assert(Math.abs((await anchorElement.boundingBox()).y-anchorTop)<3,'Older history must retain the reading anchor');checks.push('older cursor history preserves reading position');
 await list.evaluate(element=>{element.scrollTop=100;element.dispatchEvent(new Event('scroll'));});const readingTop=await list.evaluate(element=>element.scrollTop);
 const incoming=await context.request.post(`${base}/api/v1/conversations/native-conversation-0/messages`,{headers:{Origin:base},data:{content:'Tin mới khi đang đọc lịch sử',clientMessageId:randomUUID()}});assert.equal(incoming.status(),201);
 try{await expect(page.getByRole('button',{name:/1 tin mới/})).toBeVisible();}catch(error){console.log(JSON.stringify({outbox:(await pool.query('SELECT count(*)::int AS total, count(delivered_at)::int AS delivered FROM realtime_outbox')).rows[0],unreadText:await page.locator('.fg-new-messages').allTextContents(),newArticle:await page.locator('article').getByText('Tin mới khi đang đọc lịch sử',{exact:true}).count(),scroll:await list.evaluate(element=>({top:element.scrollTop,height:element.scrollHeight,visible:element.clientHeight}))}));throw error;}assert.equal(await list.evaluate(element=>element.scrollTop),readingTop,'Realtime must not move the reader');await page.getByRole('button',{name:/1 tin mới/}).click();await expect(page.getByRole('button',{name:/1 tin mới/})).toHaveCount(0);checks.push('real Redis event keeps scroll and exposes new-message action');

 await page.getByRole('combobox',{name:'Chọn game'}).selectOption(games[1].id);await expect(page.getByText('Mình tham gia cùng nhé!',{exact:true})).toHaveCount(0);await expect(page.getByText('Chào mừng đến Lobby',{exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Chọn game'}).selectOption(games[0].id);await expect(page.getByText('Mình tham gia cùng nhé!',{exact:true})).toHaveCount(1);checks.push('game switch isolation and return history');
 for(const viewport of viewports){
  await page.setViewportSize(viewport);await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>{document.body.scrollTop=0;window.scrollTo(0,0);});
  await expect(page.getByRole('button',{name:'Gửi tin nhắn'})).toBeVisible();
  const metrics=await page.evaluate(()=>{const list=document.querySelector('.fg-message-list'),composer=document.querySelector('.fg-chat-composer'),rect=composer.getBoundingClientRect();return {width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,composerBottom:rect.bottom,viewport:innerHeight,chatScroll:list.scrollHeight>list.clientHeight};});
  assert(metrics.scrollWidth<=metrics.width,`Horizontal overflow at ${viewport.width}`);assert(metrics.composerBottom<=metrics.viewport,`Composer below viewport at ${viewport.width}`);assert(metrics.chatScroll,'Message list must scroll independently');
  const undersized=await page.locator('button,a,textarea,select').evaluateAll(elements=>elements.filter(element=>{const rect=element.getBoundingClientRect();return getComputedStyle(element).display!=='none'&&rect.width>0&&rect.height>0&&(rect.width<44||rect.height<44);}).map(element=>element.getAttribute('aria-label')||element.textContent?.trim()));
  assert.deepEqual(undersized,[],`Touch targets below44 at ${viewport.width}`);
  await page.screenshot({path:`${directory}/${viewport.width}x${viewport.height}-chat.png`});checks.push({viewport,...metrics});
  if(viewport.width<1024){await page.getByRole('button',{name:'Mở điều hướng game'}).click();await expect(page.getByRole('dialog',{name:'Điều hướng game'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Mở điều hướng game'})).toBeFocused();await page.getByRole('tab',{name:'Tìm đội',exact:true}).click();await expect(page.getByRole('heading',{name:'Gặp bạn cùng game'})).toBeVisible();await page.screenshot({path:`${directory}/${viewport.width}x${viewport.height}-teams.png`});await page.getByRole('tab',{name:'Chat',exact:true}).click();}
 }
 fs.writeFileSync(`${directory}/verified-layout.json`,JSON.stringify({checks,screenshots:directory},null,2)+'\n');console.log(JSON.stringify({native:true,checks,screenshots:directory}));
}finally{
 if(browser)await browser.close();
 if(web)await new Promise((resolve,reject)=>web.httpServer.close(error=>error?reject(error):resolve()));
 if(app)await app.close();
 if(pool){try{if(createdSchema){assert(/^t13_[0-9]+_[a-z0-9]+$/.test(schema));await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);assert.equal((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0);}console.log('Owned native schema and servers closed');}finally{await pool.end();}}
}
