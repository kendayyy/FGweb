import fs from 'node:fs';import assert from 'node:assert/strict';
let source=fs.readFileSync('quality/evidence/CHATCRYPTO-FE/new-device-headed-source.mjs','utf8').replaceAll('\r\n','\n');
const context="  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });";assert(source.includes(context));
source=source.replace(context,context+`
  await context.addInitScript(()=>{const original=window.createImageBitmap.bind(window);window.__fgImageDecodeCalls=0;window.createImageBitmap=(...args)=>{window.__fgImageDecodeCalls++;return original(...args);};});
`);
const marker="  await a.getByLabel('Ảnh riêng (tối đa 4)').setInputFiles({ name: 'not-allowed.svg'";const offset=source.indexOf(marker);assert(offset>0);
const extra=`
  await expect(a.getByRole('img',{name:'Ảnh riêng đã giải mã và kiểm tra trên thiết bị',exact:true})).toBeVisible();
  await a.getByLabel('Tin nhắn riêng mã hóa',{exact:true}).fill('Draft preserved through image allocation rejects');
  const beforeDecoder=await a.evaluate(()=>window.__fgImageDecodeCalls);
  const rejected=[{name:'gif-as-png.png',mimeType:'image/png',buffer:Buffer.from('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b','hex')},{name:'svg-as-png.png',mimeType:'image/png',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')},{name:'jpeg-as-png.png',mimeType:'image/png',buffer:await sharp({create:{width:24,height:18,channels:3,background:'green'}}).jpeg().toBuffer()}];
  for(const file of rejected){await a.getByLabel('Ảnh riêng (tối đa 4)').setInputFiles(file);await expect(a.getByRole('alert')).toContainText('Chỉ nhận JPG/PNG/WebP tối đa 5MiB và 20MP');assert.equal(await a.evaluate(()=>window.__fgImageDecodeCalls),beforeDecoder);await expect(a.getByLabel('Tin nhắn riêng mã hóa',{exact:true})).toHaveValue('Draft preserved through image allocation rejects');}
`;
source=source.slice(0,offset)+extra+source.slice(offset);
const beforeBackup='  // Backup through actual UI; a new browser/device must not inherit old trust.';assert(source.includes(beforeBackup));
source=source.replace(beforeBackup,"  assert.equal(await a.evaluate(()=>window.__fgImageDecodeCalls),beforeDecoder,'No invalid or oversized image reached browser decoding');\n  await expect(a.getByLabel('Tin nhắn riêng mã hóa',{exact:true})).toHaveValue('Draft preserved through image allocation rejects');\n"+beforeBackup);
source=source.replaceAll('groupUi: false','groupUi: false, actualPredecodeImageAllocationGuard: true, invalidMimeNoBrowserDecode: true, nativeImageAndDraftPreserved: true');
fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/headed-image-allocation.mjs',source,{flag:'wx'});
