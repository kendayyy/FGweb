import fs from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {RecruitmentSchema} from '@fg/contracts';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();let page;
const shots=`quality/evidence/T21/screenshots/${h.schema}`;fs.mkdirSync(shots,{recursive:true});
const checks=[];
async function createUI(p,{title,mode='Flex',capacity=5,scheduled,roomId,experience}){
 await p.getByRole('button',{name:'Tạo đội',exact:true}).click();
 const f=p.getByRole('form');await expect(f).toBeVisible();
 await f.getByLabel('Tiêu đề đội',{exact:true}).fill(title);
 await f.getByLabel('Chế độ chơi',{exact:true}).fill(mode);
 await f.getByLabel('Quy mô đội',{exact:true}).fill(String(capacity));
 if(scheduled){await f.getByLabel('Hẹn giờ',{exact:true}).check();await f.getByLabel('Giờ hẹn (Asia/Bangkok)',{exact:true}).fill(scheduled);}
 if(roomId)await f.getByLabel('Phòng sử dụng',{exact:true}).selectOption(roomId);
 if(experience){await f.getByLabel('Tên experience',{exact:true}).fill(experience.name);await f.getByLabel('Link experience',{exact:true}).fill(experience.url);}
 const response=p.waitForResponse(r=>r.url().endsWith('/api/v1/recruitments')&&r.request().method()==='POST');
 await f.getByRole('button',{name:'Đăng thẻ tuyển',exact:true}).click();
 const res=await response;assert.equal(res.status(),201,await res.text());
 const card=RecruitmentSchema.parse(await res.json());await expect(f).toHaveCount(0);await expect(p.getByText('Đã tạo đội.',{exact:true})).toBeVisible();
 return {card,payload:res.request().postDataJSON()};
}
try{
 const context=await h.context('native-a');page=await context.newPage();await page.goto(h.base);
 await expect(page.getByRole('button',{name:'Tạo đội',exact:true})).toBeVisible();
 await expect(page.locator('.fg-recruit-feature')).toHaveCount(1);
 await page.getByRole('button',{name:'Tạo đội',exact:true}).click();
 await page.getByRole('button',{name:'Đăng thẻ tuyển',exact:true}).click();
 const alert=page.locator('.fg-recruit-error-summary');await expect(alert).toBeFocused();
 await alert.getByRole('link').first().click();await expect(page.getByLabel('Tiêu đề đội',{exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Đóng form',exact:true}).click();checks.push('real validation focus and field links');
 const {card}=await createUI(page,{title:'FG Flex cùng bạn',capacity:5});
 assert.equal(card.gameId,h.games[0].id);
 const active=await h.pool.query('SELECT user_id FROM active_play_slots WHERE user_id=$1',['native-a']);assert.equal(active.rowCount,1);
 await expect(page.getByRole('article',{name:card.title,exact:true})).toBeVisible();checks.push('UI POST201 actual shared DTO and PostgreSQL active slot');
 await page.getByRole('button',{name:'Tạo đội',exact:true}).click();
 await page.getByLabel('Tiêu đề đội',{exact:true}).fill('Giữ bản nháp khi trùng đội');await page.getByLabel('Chế độ chơi',{exact:true}).fill('Flex');
 await expect(page.getByRole('region',{name:'Gợi ý đội'}).getByRole('article',{name:card.title,exact:true})).toBeVisible();
 const conflict=page.waitForResponse(r=>r.url().endsWith('/api/v1/recruitments')&&r.request().method()==='POST');await page.getByRole('button',{name:'Đăng thẻ tuyển',exact:true}).click();assert.equal((await conflict).status(),409);
 await expect(page.getByLabel('Tiêu đề đội',{exact:true})).toHaveValue('Giữ bản nháp khi trùng đội');await expect(alert).toContainText('đang có đội chơi ngay');
 await page.getByRole('button',{name:'Đóng form',exact:true}).click();checks.push('suggest missing team; occupied409 retains draft');
 const local='2099-10-07T20:30';
 const schedule=await createUI(page,{title:'FG Hẹn giờ trong phòng cũ',scheduled:local,roomId:card.roomId});
 assert.equal(schedule.card.roomId,card.roomId);assert.equal(schedule.payload.scheduledAt,'2099-10-07T13:30:00.000Z');
 await expect(page.getByRole('article',{name:schedule.card.title,exact:true}).locator('time')).toContainText('20:30');
 const rooms=await h.pool.query('SELECT id FROM rooms WHERE id=$1',[card.roomId]);assert.equal(rooms.rowCount,1);checks.push('scheduled Bangkok to UTC and durable existing room');
 const panel=()=>page.locator('.fg-recruit-feature:visible');
 await panel().getByLabel('Lọc chế độ',{exact:true}).fill('Turbo');await expect(panel().getByRole('article',{name:card.title,exact:true})).toHaveCount(0);await expect(panel().getByText('Chưa có đội tuyển phù hợp. Bạn có thể tạo đội mới.',{exact:true})).toBeVisible();
 await panel().getByLabel('Lọc chế độ',{exact:true}).fill('Flex');await panel().getByRole('combobox',{name:/^Thời gian/}).selectOption('scheduledAt');await expect(panel().getByRole('article',{name:schedule.card.title,exact:true})).toBeVisible();await expect(panel().getByRole('article',{name:card.title,exact:true})).toHaveCount(0);
 await panel().getByRole('combobox',{name:/^Thời gian/}).selectOption('');checks.push('real mode/time filters and empty state');
 for(const viewport of [{width:1440,height:900},{width:1280,height:800},{width:390,height:844},{width:360,height:800}]){
  await page.setViewportSize(viewport);if(viewport.width<1024)await page.getByRole('tab',{name:'Tìm đội',exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
  await expect(page.getByRole('article',{name:card.title,exact:true})).toBeVisible();await page.screenshot({path:`${shots}/lobby-${viewport.width}x${viewport.height}.png`,fullPage:true});
 }
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 const composer=page.locator('.fg-rich-composer textarea');await composer.fill('Bản nháp Lobby giữ nguyên');
 await page.getByRole('tab',{name:'Tìm đội',exact:true}).click();await page.getByRole('button',{name:'Tạo đội',exact:true}).click();await page.getByLabel('Tiêu đề đội',{exact:true}).fill('Bản nháp đội trên điện thoại');
 await page.getByRole('tab',{name:'Chat',exact:true}).click();await expect(composer).toHaveValue('Bản nháp Lobby giữ nguyên');await page.getByRole('tab',{name:'Tìm đội',exact:true}).click();await expect(page.getByLabel('Tiêu đề đội',{exact:true})).toHaveValue('Bản nháp đội trên điện thoại');
 await page.screenshot({path:`${shots}/form-mobile.png`,fullPage:true});await page.getByRole('button',{name:'Đóng form',exact:true}).click();checks.push('four viewports and both mobile tab drafts preserved');
 await page.setViewportSize({width:1440,height:900});
 const roblox=h.games.find(g=>g.title==='Roblox');await page.getByLabel('Chọn game',{exact:true}).selectOption(roblox.id);
 await page.getByRole('button',{name:'Tạo đội',exact:true}).click();await page.getByRole('button',{name:'Đăng thẻ tuyển',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Tên experience là bắt buộc.'})).toBeVisible();await page.getByRole('button',{name:'Đóng form',exact:true}).click();
 const rb=await createUI(page,{title:'FG Roblox Adventure',mode:'Adventure',scheduled:local,experience:{name:'FG Experience',url:'https://www.roblox.com/games/123456/FG'}});
 assert.equal(rb.card.gameId,roblox.id);await expect(page.getByRole('article',{name:rb.card.title,exact:true}).getByRole('link',{name:'Mở Roblox'})).toHaveAttribute('href',rb.card.experienceUrl);checks.push('real Roblox mandatory experience and safe shared URL');
 const guest=await h.context();const gp=await guest.newPage();await gp.goto(h.base);await expect(gp.getByRole('article',{name:card.title,exact:true})).toBeVisible();await expect(gp.getByRole('button',{name:'Tạo đội',exact:true})).toHaveCount(0);checks.push('public guest list with authenticated create only');
 console.log(JSON.stringify({realCompiledApi:true,realBuiltWeb:true,realPostgres:true,realRedis:true,checks,screenshots:shots}));
}catch(error){if(page)await page.screenshot({path:`${shots}/failure.png`,fullPage:true});throw error;}
finally{await h.cleanup();console.log('Owned T21 native fixture cleaned.');}
