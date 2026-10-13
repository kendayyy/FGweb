import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionAlert,recoveryAlert} from './alerts.mjs';
const session={id:'build',title:'Coding and build 2',status:'idle'};
const page=(status,text,error)=>({thread:{id:'build'},turns:[{id:'turn',status,error,items:[{type:'agentMessage',id:'agent',phase:'final',text},{type:'reasoning',text:'private reasoning'}]}]});
test('explicit usage exhaustion reports evidence and never implies idle means quota',()=>{
 const a=sessionAlert(session,page('failed','Chưa xong',{codexErrorInfo:'usageLimitReached',message:'usage limit reached'}),{status:'active'});
 assert.match(a.text,/chạm hạn mức/);assert.match(a.text,/usage limit reached/);
 const b=sessionAlert(session,page('interrupted','Đang làm'),{status:'active'});assert.doesNotMatch(b.text,/chạm hạn mức/);assert.match(b.text,/chưa cung cấp nguyên nhân/);
});
test('question includes text and Telegram reply route, deduplicated by observation',()=>{
 const p=page('completed','Bạn muốn chọn A hay B?');const a=sessionAlert(session,p);assert.match(a.text,/Bạn muốn chọn A hay B/);assert.match(a.text,/\/reply Coding and build 2 \|/);assert.doesNotMatch(a.text,/private reasoning/);
 assert.equal(sessionAlert(session,p,a.observation).text,undefined);
});
test('normal completion does not claim interruption and attention does not bypass approvals',()=>{
 assert.match(sessionAlert(session,page('completed','Đã kiểm thử xong'),{status:'active'}).text,/đã kết thúc/);
 assert.match(sessionAlert({...session,status:'needsAttention'},page('inProgress','Cần xác nhận')).text,/cần mở Codex để bấm/);
});
test('recovery distinguishes observed reboot from unproven loss of power',()=>{
 assert.equal(recoveryAlert({},1000000,500000),undefined);
 const reboot=recoveryAlert({lastObservedAt:100000,bootAt:0},1000000,500000);assert.match(reboot,/máy khởi động lại/);assert.match(reboot,/Chưa thể xác định/);
 const lost=recoveryAlert({lastObservedAt:100000,bootAt:500000,failureStage:'Telegram API/kết nối'},1000000,500000);assert.match(lost,/Telegram/);assert.doesNotMatch(lost,/có bằng chứng máy khởi động lại/);
});
test('error credentials are redacted',()=>{
 const a=sessionAlert(session,page('failed','stop',{message:'token=abcdef private@example.com'}));assert.doesNotMatch(a.text,/abcdef|private@/);
});
