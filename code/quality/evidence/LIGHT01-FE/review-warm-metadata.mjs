import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/LIGHT01-FE';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const old='../.doc/mockups/07-light-warm-ivory.png',file='../.doc/mockups/08-light-warm-ivory.png';
assert(!fs.existsSync(file));
assert.equal(hash(old),JSON.parse(fs.readFileSync(`${dir}/warm-selection.json`)).referenceSha256);
fs.renameSync(old,file);
for(const doc of ['../.doc/01-product-spec.md','../.doc/02-frontend-design.md','../.doc/task.md']){
 const content=fs.readFileSync(doc,'utf8');
 const updated=content.replaceAll('mockup07 trắng kem','mockup08 trắng kem').replaceAll('(mockup07)','(mockup08)').replaceAll('07-light-warm-ivory.png','08-light-warm-ivory.png');
 assert.notEqual(content,updated);fs.writeFileSync(doc,updated);
}
fs.appendFileSync('../.doc/mockups/README.md','\n## Mockup08 — Theme sáng trắng kem, đã chọn07/10/2026\n\n- [08 — Mẫu trắng kem](./08-light-warm-ivory.png) được người dùng chọn: “tôi chọn mẫu này”. Giữ layout/Inter/CTA xanh của FG; palette theo design mục12. Ảnh là hướng màu đã duyệt, chưa thay review app thật hoặc kiểm thử chức năng.\n- LIGHT01-FE đã áp dụng màu và có ảnh desktop/mobile thực tế tại code/quality/evidence/LIGHT01-FE/warm/screenshots/. Giữ các yêu cầu logo/sidebar riêng theo checkpoint của chúng.\n');
const documents=['../.doc/01-product-spec.md','../.doc/02-frontend-design.md','../.doc/task.md'];
const review={recordedAt:new Date().toISOString(),sources:documents.map(file=>({file,sha256:hash(file)})),trustedSidebarRequest:{threadTitle:'Idea',threadId:'01a114a3-ab20-70e2-b020-db31d489bffd',turnId:'01a116f9-5657-7aa2-b0ec-a55150e1e1fa',request:'cũng được thanh task danh mục bên trái có thể thu gọn hoặc mở rộng ra được không'},review:'Concurrent additive GAME-LOGO-01 / SIDEBAR-CHANGE-01 metadata retained. Own approved warm changes verified at spec15/design12/task LIGHT. Future logo/sidebar implementation remains gated after current task; no API/DB/game IDs changed. Mockup08 used to avoid number07 sidebar ambiguity.',originalBaselineAdopted:false,failedAuditPreserved:`${dir}/codex-warm-scope-audit-1.txt`,requiredBeforeClosure:'Formal metadata baseline migration and actual updated app appearance review remain required.'};
fs.writeFileSync(`${dir}/warm-metadata-review.json`,JSON.stringify(review,null,2)+'\n');
console.log('Approved warm amendment and trusted additive sidebar metadata reviewed; original baseline retained, no task PASS.');
