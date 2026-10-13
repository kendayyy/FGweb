import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';let s=fs.readFileSync(d+'/review-publishing-photos-5.mjs','utf8');assert(s.includes('t30-reg-webhook-63c2b79deb8d4a8697d5992656041043'));
s=s.replaceAll('t30-reg-webhook-63c2b79deb8d4a8697d5992656041043','t30-reg-webhook-f0332ec8e64144eaba6194cb3bfb1472').replaceAll('publishing-regressions-5','publishing-regressions-6').replaceAll('publishing-regression-photo-review-5','publishing-regression-photo-review-6').replaceAll('actual110 guard cases','actual121 guard cases').replaceAll('build10 reviewed/canonical native pending','build11 reviewed/canonical native pending').replace('blue canvas19-29/final','blue canvas12-26/final');
fs.writeFileSync(d+'/review-publishing-photos-6.mjs',s,{flag:'wx'});
console.log('Prepared review for five new root-viewed actual photos; actual test/Telegram receipts/cleanup still required.');
