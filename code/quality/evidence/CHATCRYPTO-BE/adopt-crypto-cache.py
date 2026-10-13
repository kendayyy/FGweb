from pathlib import Path
from hashlib import sha256
from datetime import datetime,timezone
import json
d=Path('quality/evidence/CHATCRYPTO-BE')
def hash_file(p):return sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def write(p,value):Path(p).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8',newline='\n')
assert not (d/'crypto-cache-adoption.json').exists()
source='apps/api/src/modules/chat-crypto/http-body-parsers.ts'
line=" app.use('/api/v1/crypto',(_req:Parameters<typeof recovery>[0],res:Parameters<typeof recovery>[1],next:Parameters<typeof recovery>[2])=>{res.setHeader('Cache-Control','no-store');next();});\n"
text=Path(source).read_text(encoding='utf-8');assert text.count(line)==1
prior=read(d/'crypto-cache-prior-review.json');assert sha256(text.replace(line,'').encode()).hexdigest()==prior['sourceHashes'][source]
paths=[source,'apps/api/dist/modules/chat-crypto/http-body-parsers.js','apps/api/dist/modules/chat-crypto/http-body-parsers.d.ts','apps/api/test/chat-crypto-cache.integration.spec.ts']
labels=['crypto-cache-red-1','crypto-cache-red-2','crypto-cache-green-1','crypto-cache-regression-1','crypto-cache-api-build-1']
write(d/'crypto-cache-adoption.json',{'task':'CHATCRYPTO-BE','recordedAt':datetime.now(timezone.utc).isoformat(),'priorReviewSha256':hash_file(d/'crypto-cache-prior-review.json'),'beforeSha256':prior['sourceHashes'][source],'afterHashes':{p:hash_file(p) for p in paths},'commands':{label:hash_file(d/('codex-'+label+'.json')) for label in labels},'newSchema':False,'newContract':False,'quotaChange':False,'mainMutation':False,'backendPass':False,'fullRegressionRepeated':False,'scopedTests':10,'lastFullRegressionLabel':'custody-deadline-regression-1','lastFullRegressionCurrentForAllSource':False})
p=d/'custody-deadline-review.mjs';old=p.read_text(encoding='utf-8');(d/'crypto-cache-prior-custody-review.mjs').write_bytes(p.read_bytes());old=old.replace('reviewCustodyDeadline(dir){','reviewCustodyDeadline(dir,transitions={}){',1)
needle="else assert.equal(hash(p),before,'Unrelated runtime/suite changed');";assert old.count(needle)==1
old=old.replace(needle,"else{if(transitions[p])assert.equal(transitions[p].before,before);assert.equal(hash(p),transitions[p]?.after??before,'Unrelated runtime/suite changed without scoped cache proof');}")
p.write_text(old,encoding='utf-8',newline='\n')
p=d/'review-progress.mjs';text=p.read_text(encoding='utf-8');text="import {reviewCryptoCache} from './crypto-cache-review.mjs';\n"+text
needle='const custodyDeadline=fs.existsSync';assert text.count(needle)==1
text=text.replace(needle,"const cryptoCache=fs.existsSync(`${dir}/crypto-cache-adoption.json`)?reviewCryptoCache(dir):{paths:[],transitions:{}};changedFiles.push(...cryptoCache.paths);\n"+needle)
text=text.replace('reviewCustodyDeadline(dir):','reviewCustodyDeadline(dir,cryptoCache.transitions):',1)
text=text.replace('reviewExpiryBacklog(dir,custodyDeadline.transitions)','reviewExpiryBacklog(dir,{...custodyDeadline.transitions,...cryptoCache.transitions})',1)
needle='productionActivation:false,backendComplete:false,currentFullRegressionLabel:';assert text.count(needle)==1
text=text.replace(needle,"productionActivation:false,backendComplete:false,lastFullRegressionCurrentForAllSource:cryptoCache.paths.length===0,currentScopedRegressionLabel:cryptoCache.paths.length?'crypto-cache-regression-1':null,currentFullRegressionLabel:")
text=text.replace('Aggregate ingestion quotas, remaining aggregate ingestion and operational/security review;','Aggregate ingestion quotas, remaining aggregate ingestion and operational/security review; private crypto no-store actualAppModule6 plusHTTP parser/rawmedia4 scopedtests verified afterheader-only change, last broad301/17 predates this header;',1)
p.write_text(text,encoding='utf-8',newline='\n')
p=d/'save-progress.mjs';text=p.read_text(encoding='utf-8')
needle="if(fs.existsSync(`${dir}/custody-deadline-adoption.json`)){assert.equal(labels[0]";assert text.count(needle)==1
text=text.replace(needle,"if(fs.existsSync(`${dir}/crypto-cache-adoption.json`)){assert.equal(labels[0],'crypto-cache-regression-1');assert.equal(labels[1],'crypto-cache-api-build-1');assert.equal(targetedTests,10);}else "+needle,1)
text=text.replace('const prerequisiteLabels=[',"const prerequisiteLabels=[...(fs.existsSync(`${dir}/crypto-cache-adoption.json`)?['crypto-cache-green-1','custody-deadline-regression-1']:[]),",1)
text=text.replace('task.lastProgressReview=',"if(fs.existsSync(`${dir}/crypto-cache-adoption.json`))for(const name of ['crypto-cache-adoption.json','crypto-cache-review.md','crypto-cache-review.mjs'])task.evidencePaths.push(`${dir}/${name}`);\ntask.lastProgressReview=",1)
text=text.replace('currentFullRegressionLabel:labels[0],','currentFullRegressionLabel:review.currentFullRegressionLabel,currentScopedRegressionLabel:review.currentScopedRegressionLabel,lastFullRegressionCurrentForAllSource:review.lastFullRegressionCurrentForAllSource,',1)
p.write_text(text,encoding='utf-8',newline='\n')
print('Exact no-store source transition adopted with current scoped10 proof; broad301 retained as prior, not fresh after header.')
