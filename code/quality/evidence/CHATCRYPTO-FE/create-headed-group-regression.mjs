import fs from 'node:fs';import assert from 'node:assert/strict';
let source=fs.readFileSync('quality/evidence/CHATCRYPTO-FE/active-membership-headed-source.mjs','utf8').replaceAll('\r\n','\n');
const marker="  await b.screenshot({path:'quality/evidence/CHATCRYPTO-FE/group-360-'+owned+'.png'});";assert(source.includes(marker));
const extra=`
  await b.bringToFront();const area=b.getByLabel('Tin nhắn riêng mã hóa',{exact:true});
  await area.fill('Actual native group draft survives call/settings tabs');
  await b.getByTestId('mobile-tab-calls').click();await b.getByTestId('mobile-tab-chat').click();await expect(area).toHaveValue('Actual native group draft survives call/settings tabs');
  await b.getByTestId('mobile-tab-settings').click();const settings=b.getByRole('dialog',{name:/Cài đặt phòng & Thành viên/i});await expect(settings).toBeVisible();await settings.press('Escape');await b.getByTestId('mobile-tab-chat').click();await expect(area).toHaveValue('Actual native group draft survives call/settings tabs');
  await contextB.setOffline(true);
  const gaps=Array.from({length:105},(_,index)=>'Actual native offline gap '+String(index+1).padStart(3,'0'));
  for(const text of gaps)await send(a,text);
  await contextB.setOffline(false);await b.bringToFront();await expect(b.getByText(gaps[104],{exact:true})).toBeVisible({timeout:60000});
  for(const text of gaps)await expect(b.getByText(text,{exact:true})).toHaveCount(1);
  await expect(area).toHaveValue('Actual native group draft survives call/settings tabs');
  const all=[];let cursor;
  for(let page=0;page<3;page++){const result=await request(b,'crypto/conversations/'+conversation+'/messages?limit=100'+(cursor?'&after='+encodeURIComponent(cursor):''));assert.equal(result.status,200);all.push(...result.body.items);if(!result.body.hasMore)break;assert(result.body.nextCursor&&result.body.nextCursor!==cursor);cursor=result.body.nextCursor;}
  assert(all.length>100);assert.equal(new Set(all.map(message=>message.id)).size,all.length);
  const visibleIds=await b.locator('[data-message-id]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-message-id')));assert.deepEqual(visibleIds,all.map(message=>message.id),'Actual native UI preserves server chronological order across multiple pages');
  assert.equal(JSON.stringify(all).includes(rows[0].id),false);assert.equal(JSON.stringify(all).includes(rows[2].id),false);
  assert((await pool.query('SELECT content FROM messages WHERE conversation_id=$1',[conversation])).rows.every(row=>row.content===''));
  console.log(JSON.stringify({actualNativeMobileGroupDraft:true,callAndSettingsTabsPreserveDraft:true,actualOfflineGap:105,actualNativeMultiplePageReconnect:true,chronologicalOrderAndDedup:true,prejoinAndExcludedStillDenied:true}));
`;
source=source.replace(marker,extra+marker).replaceAll('mobile360:true,mainMutation:false','mobile360:true,nativeMobileTabDraft:true,nativeReconnectPagination:true,cryptoHistoryRequestsPaged:true,mainMutation:false');
fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/headed-group-regression.mjs',source,{flag:'wx'});
