import fs from 'node:fs';import assert from 'node:assert/strict';
const dir='quality/evidence/CHATCRYPTO-FE';let source=fs.readFileSync(`${dir}/recovery-device-headed-source.mjs`,'utf8');
const generated="    await page.getByRole('button', { name: 'Tạo mã khôi phục' }).click();";
assert.equal(source.split(generated).length,2);
source=source.replace(generated,generated+"\n    const localCode = await page.getByLabel('Mã khôi phục', { exact: true }).inputValue();");
const ready="    await expect(page.getByText('Thiết bị đã mở khóa và đăng ký với FG.', { exact: true })).toBeVisible({ timeout: 30000 });";
source=source.replace(ready,ready+'\n    return localCode;');
source=source.replace('const c = await contextC.newPage(); await unlock(c); await chat(c, users[1]);','const c = await contextC.newPage(); const cDeviceCode = await unlock(c); await chat(c, users[1]);');
const marker="  await c.screenshot({ path: 'quality/evidence/CHATCRYPTO-FE/recovered-history-' + owned + '.png' });";
assert.equal(source.split(marker).length,2);
source=source.replace(marker,marker+String.raw`
  // Close/reopen the actual encrypted native IndexedDB store, without another backup import.
  await c.bringToFront();await c.goto(origin+'/crypto');
  await expect(c.getByRole('heading',{name:'Mở khóa thiết bị',exact:true})).toBeVisible();
  await c.getByLabel('Mã khôi phục',{exact:true}).fill(cDeviceCode);
  await c.getByRole('button',{name:'Mở khóa thiết bị',exact:true}).click();
  await expect(c.getByText('Thiết bị đã mở khóa và đăng ký với FG.',{exact:true})).toBeVisible();
  await chat(c,users[1]);
  await expect(c.getByText(privateBody,{exact:true}).first()).toBeVisible({timeout:30000});
  await expect(c.getByText('Lịch sử từ bản khôi phục · thiết bị gửi chưa được xác minh hiện tại.',{exact:true}).first()).toBeVisible();
  await expect(c.getByRole('button',{name:'Xác minh Native Bob',exact:true})).toBeVisible();
  await expect(c.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.',{exact:true})).not.toBeVisible();
`);
fs.writeFileSync(`${dir}/headed-recovery-reload.mjs`,source,{flag:'wx'});console.log('Prepared actual native encrypted-store reopen/recovered history test; codes remain only in fixture memory.');
