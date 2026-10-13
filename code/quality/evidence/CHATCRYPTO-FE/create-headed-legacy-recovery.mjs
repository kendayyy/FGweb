import fs from 'node:fs';
import assert from 'node:assert/strict';
const original=fs.readFileSync('quality/evidence/CHATCRYPTO-FE/headed-legacy-activation.mjs','utf8').replaceAll('\r\n','\n');
const base=fs.readFileSync('quality/evidence/CHATCRYPTO-FE/new-device-headed-source.mjs','utf8').replaceAll('\r\n','\n');
const start=base.indexOf('  // Backup through actual UI;'),end=base.indexOf('  // Close/reopen the actual encrypted native IndexedDB');assert(start>0&&end>start);
let recovery=base.slice(start,end).replaceAll('privateBody','oldBody').replaceAll('recovered-history-', 'legacy-recovered-history-');
recovery+=`
  const cRow=c.locator('[data-message-id="'+messageId+'"]');await expect(cRow.getByText(oldClaim,{exact:true})).toBeVisible();await expect(cRow.getByRole('img',{name:'Ảnh lịch sử cũ đã giải mã và kiểm tra nguồn trên thiết bị',exact:true})).toBeVisible();
  const recoveredDevice=(await pool.query('SELECT device_id,ed25519_key,curve25519_key FROM chat_crypto_devices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[users[0]])).rows[0];assert.notEqual(recoveredDevice.device_id,deviceId);
  await c.goto(origin+'/crypto');await c.getByRole('button',{name:'Khóa thiết bị',exact:true}).click();await c.getByLabel('Mã riêng của thiết bị',{exact:true}).fill(cDeviceCode);await c.getByRole('button',{name:'Mở kho thiết bị',exact:true}).click();await expect(c.getByText('Thiết bị đang hoạt động',{exact:true})).toBeVisible();
  await chat(c,users[1]);await expect(c.getByText(oldBody,{exact:true})).toBeVisible();await expect(c.getByText('Lịch sử từ bản khôi phục · thiết bị gửi chưa được xác minh hiện tại.',{exact:true})).toBeVisible();await expect(cRow.getByRole('img')).toBeVisible();
  const afterReload=(await pool.query('SELECT device_id,ed25519_key,curve25519_key FROM chat_crypto_devices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[users[0]])).rows[0];assert.deepEqual(afterReload,recoveredDevice);
  await expect(c.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.',{exact:true})).toHaveCount(0);await expect(c.getByRole('button',{name:'Xác minh Native Bob',exact:true})).toBeVisible();
  await contextC.close();
`;
const marker='  assert.deepEqual(legacy,[]);for(const file of buildFiles)';assert(original.includes(marker));
let output=original.replace(marker,recovery+marker);
output=output.replaceAll('actualLegacyImageReportConsent:true,','actualLegacyImageReportConsent:true,actualLegacyRecoveredDeviceHistory:true,wrongRecoveryCodeDenied:true,recoveredNativeStoreReload:true,newIdentityNoTrust:true,');
fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/headed-legacy-recovery.mjs',output,{flag:'wx'});
