from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import ast,json

d=Path('quality/evidence/CHATCRYPTO-BE')
def read(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def hash_file(p): return sha256(Path(p).read_bytes()).hexdigest()
def write(p,value): Path(p).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
assert not (d/'custody-deadline-adoption.json').exists()
prior=read(d/'custody-deadline-prior-review.json')
source='apps/api/src/modules/chat-crypto/crypto-custody.module.ts'
change="const deadline=setTimeout(()=>req.destroy(),5000);req.on('close',()=>clearTimeout(deadline));"
current=Path(source).read_text(encoding='utf-8');assert current.count(change)==1
assert sha256(current.replace(change,'').encode()).hexdigest()==prior['sourceHashes'][source]
paths=[source,'apps/api/dist/modules/chat-crypto/crypto-custody.module.js','apps/api/dist/modules/chat-crypto/crypto-custody.module.d.ts','apps/api/test/chat-crypto-custody-deadline.integration.spec.ts']
labels=['custody-deadline-red-1','custody-deadline-green-1','custody-deadline-api-build-1']
write(d/'custody-deadline-adoption.json',{'task':'CHATCRYPTO-BE','recordedAt':datetime.now(timezone.utc).isoformat(),'priorReviewSha256':hash_file(d/'custody-deadline-prior-review.json'),'sourceBeforeSha256':prior['sourceHashes'][source],'sourceAfterSha256':hash_file(source),'afterHashes':{p:hash_file(p) for p in paths},'commands':{label:hash_file(d/('codex-'+label+'.json')) for label in labels},'mainMutation':False,'backendPass':False,'moderationProducerComplete':False,'policyChange':False})

# Reconstruct the exact prior task document, including its original line endings.
decision_tree=ast.parse((d/'record-ban-t37-decision.py').read_text(encoding='utf-8'))
block=next(ast.literal_eval(node.value) for node in decision_tree.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='decision' for t in node.targets))
handoff='\n\n**Bàn giao CHATCRYPTO-BAN-T37-01 (10/10/2026):** T37 sở hữu producer ban/unban và tích hợp crypto epoch/interval/session/socket theo mục quyết định ở trên; kiểm native atomic rollback/lock ordering/idempotency, không phục hồi session cũ hoặc lịch sử khoảng bị ban. Chưa có implementation/evidence producer; quyết định này không mở T37 trước tiền nhiệm PASS.'
task=Path('../.doc/task.md').read_text(encoding='utf-8');assert task.count(block)==1 and task.count(handoff)==1
old_task=task.replace(block,'').replace(handoff,'');decision=read(d/'ban-producer-t37-decision.json');old_hash=next(iter(decision['beforeDocumentHashes'].values()))
crlf=False
if sha256(old_task.encode()).hexdigest()!=old_hash:
    crlf=True;assert sha256(old_task.replace('\n','\r\n').encode()).hexdigest()==old_hash
baseline_path=Path('quality/spec-baseline.json');baseline=read(baseline_path);assert baseline['hashes']['taskSha256']==old_hash
baseline_before=hash_file(baseline_path);baseline['hashes']['taskSha256']=hash_file('../.doc/task.md');write(baseline_path,baseline)
write(d/'ban-t37-baseline-review.json',{'authority':'Direct user message: để vào task 37','recordedAt':datetime.now(timezone.utc).isoformat(),'gateWaived':False,'taskBeforeSha256':old_hash,'taskAfterSha256':hash_file('../.doc/task.md'),'baselineBeforeSha256':baseline_before,'baselineAfterSha256':hash_file(baseline_path),'decisionBlock':block,'t37Handoff':handoff,'priorTaskCrlf':crlf,'onlyTaskDocumentHashChanged':True,'checkerUnchanged':True})

# Preserve old proof and enforce the single source transition under fresh native proof.
p=d/'expiry-backlog-review.mjs';old=p.read_text(encoding='utf-8');(d/'custody-deadline-prior-backlog-review.mjs').write_bytes(p.read_bytes())
old=old.replace('reviewExpiryBacklog(dir){','reviewExpiryBacklog(dir,transitions={}){',1)
needle="for(const [p,digest]of Object.entries(actualSources))assert.equal(hash(p),digest,'App/prior suite changed since current full301 proof');"
assert old.count(needle)==1
old=old.replace(needle,"for(const [p,digest]of Object.entries(actualSources)){if(transitions[p])assert.equal(transitions[p].before,digest);assert.equal(hash(p),transitions[p]?.after??digest,'App/prior suite changed without verified fresh custody proof');}")
p.write_text(old,encoding='utf-8',newline='\n')
p=d/'review-progress.mjs';text=p.read_text(encoding='utf-8')
text="import {reviewCustodyDeadline,restoreBanT37Baseline} from './custody-deadline-review.mjs';\n"+text
text=text.replace('const restoreLoadingHashes=baseline=>{','const restoreLoadingHashes=baseline=>{\n baseline=restoreBanT37Baseline(baseline,dir);',1)
text=text.replace("assert.equal(hash('quality/spec-baseline.json'),adoption.afterSha256);","assert.equal(createHash('sha256').update(JSON.stringify(baseline,null,2)+'\\n').digest('hex'),adoption.afterSha256);",1)
needle="if(fs.existsSync(`${dir}/expiry-backlog-adoption.json`))changedFiles.push(...reviewExpiryBacklog(dir));"
assert text.count(needle)==1
text=text.replace(needle,"const custodyDeadline=fs.existsSync(`${dir}/custody-deadline-adoption.json`)?reviewCustodyDeadline(dir):{paths:[],transitions:{}};changedFiles.push(...custodyDeadline.paths);\nif(fs.existsSync(`${dir}/expiry-backlog-adoption.json`))changedFiles.push(...reviewExpiryBacklog(dir,custodyDeadline.transitions));")
text=text.replace('Ban/unban epoch integration with the future moderation producer;','Ban/unban epoch producer remains at T37 per CHATCRYPTO-BAN-T37-01, acceptance not yet satisfied and gate not waived; native custody token lookup absolute5s deadline rejects slow TLS response before Transit;',1)
p.write_text(text,encoding='utf-8',newline='\n')
p=d/'save-progress.mjs';text=p.read_text(encoding='utf-8')
text=text.replace("if(fs.existsSync(`${dir}/room-membership-authority-adoption.json`)){", "if(fs.existsSync(`${dir}/custody-deadline-adoption.json`)){assert.equal(labels[0],'custody-deadline-regression-1');assert.equal(labels[1],'custody-deadline-api-build-1');}else if(fs.existsSync(`${dir}/room-membership-authority-adoption.json`)){",1)
text=text.replace('const prerequisiteLabels=[',"const prerequisiteLabels=[...(fs.existsSync(`${dir}/custody-deadline-adoption.json`)?['custody-deadline-green-1','ban-producer-t37-decision-1','security-log-boundaries-review-1']:[]),",1)
text=text.replace('task.lastProgressReview=',"if(fs.existsSync(`${dir}/custody-deadline-adoption.json`))for(const name of ['custody-deadline-adoption.json','custody-deadline-review.md','custody-deadline-review.mjs','ban-t37-baseline-review.json','ban-producer-t37-decision.json'])task.evidencePaths.push(`${dir}/${name}`);\ntask.lastProgressReview=",1)
p.write_text(text,encoding='utf-8',newline='\n')
print('Exact timer source transition and user-directed one-document baseline adoption prepared; full native proof still pending.')
