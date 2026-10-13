from pathlib import Path
import json,hashlib,datetime,re
d=Path('quality/evidence/CHATCRYPTO-BE')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(Path(p).read_text(encoding='utf-8'))
source=load(d/'room-membership-authority-source-review.json')
prior=d/'room-membership-authority-prior-review.json'
assert not prior.exists()
prior.write_bytes((d/'progress-review.json').read_bytes())
assert load(prior)['sourceHashes'][source['path']]==source['beforeSha256']
labels=['room-membership-authority-red-1','room-membership-authority-red-2','room-membership-authority-green-1','room-membership-authority-api-build-1']
adoption={'task':'CHATCRYPTO-BE','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceReviewSha256':sha(d/'room-membership-authority-source-review.json'),'priorReviewEvidence':prior.as_posix(),'priorReviewSha256':sha(prior),'priorAuditRecordSha256':sha(d/'codex-progress-audit-50.json'),'afterHashes':{p:sha(p) for p in [source['path'],'apps/api/test/chat-crypto-room-authority.integration.spec.ts']},'commands':{label:sha(d/f'codex-{label}.json') for label in labels},'newSchema':False,'newContract':False,'mainMutation':False,'backendPass':False,'moderationProducerComplete':False}
(d/'room-membership-authority-adoption.json').write_text(json.dumps(adoption,indent=2)+'\n',encoding='utf-8')
(d/'room-membership-authority-review.md').write_text('CHATCRYPTO-BE IN_PROGRESS. Real Better Auth cookie actor and isolated migrated PostgreSQL, actual pg_blocking_pids epoch wait. RED1 has four genuine expired-session failures and eight invalid fixture-column failures, preserved. Corrected RED2 all twelve operations wrongly committed despite expired session or independently committed latest BAN under RC/RR. GREEN1 twelve pass with 401/403 and exact snapshots of seven authoritative tables unchanged. Source change is exactly two owning READ COMMITTED declarations and four final existing session/BAN checks; no global default/schema/new moderation API. Existing healthy HTTP room/device regression and fresh full seventeen-suite custody regression required; twelve new cases remain separately recorded, never inflate combined301 to313. Future T37 producer BAN/unban epoch integration remains open. No production/main activation or backend PASS.\n',encoding='utf-8')
p=d/'review-progress.mjs';s=p.read_text(encoding='utf-8')
s="import {reviewRoomAuthority} from './room-authority-review.mjs';\n"+s
s=s.replace('const latestReport=',"const roomAuthorityPresent=fs.existsSync(`${dir}/room-membership-authority-adoption.json`);\nconst latestReport=fs.existsSync(`${dir}/report-regression-custody-room-membership-authority-1-result.json`)?['report-regression-custody-room-membership-authority-1-result.json','custody-room-membership-authority-regression-1']:",1)
s=re.sub(r'assert.equal\(latestReport\[1\],',"assert.equal(latestReport[1],roomAuthorityPresent?'custody-room-membership-authority-regression-1':",s)
s=s.replace("if(['custody-lobby-object-final-authority-regression-1'","if(['custody-room-membership-authority-regression-1','custody-lobby-object-final-authority-regression-1'",1)
s=s.replace('const result={recordedAt:',"if(roomAuthorityPresent)changedFiles.push(...reviewRoomAuthority(dir,latestReport));\nconst result={recordedAt:",1)
s=s.replace('Ban/unban epoch integration with the future moderation producer; remaining concurrent membership review;', 'Ban/unban epoch integration with the future moderation producer; remaining concurrent membership review; native room kick/leave/sole-owner-leave/dissolve actual epoch wait expired session and latest external BAN RC/RR denied with exact seven-table rollback;')
p.write_text(s,encoding='utf-8',newline='\n')
p=d/'save-progress.mjs';s=p.read_text(encoding='utf-8');marker='const prerequisiteLabels='
s=s.replace(marker,"if(fs.existsSync(`${dir}/room-membership-authority-adoption.json`)){assert.equal(labels[0],'custody-room-membership-authority-regression-1');assert.equal(labels[1],'room-membership-authority-api-build-1');assert.equal(targetedTests,301);}\n"+marker,1)
s=s.replace("const prerequisiteLabels=[","const prerequisiteLabels=[...(fs.existsSync(`${dir}/room-membership-authority-adoption.json`)?['room-membership-authority-green-1','room-membership-authority-api-build-1']:[]),",1)
p.write_text(s,encoding='utf-8',newline='\n')
with Path('../.doc/history.md').open('a',encoding='utf-8',newline='\n') as f:
 f.write('\n- Coding and build 2 — CHATCRYPTO-BE — '+datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(timespec='seconds')+': roomauthority GREEN1 ended02:40:33 exit0 SHAf6555908f55deb31c248621ff1c560653ba2eba41949121ab740c8fb567235c4,12/12 actualnative sameassertions exactseven-table rollback; APIbuild1 ended02:41:01 exit0. Priorread-only output cp1252failed corrected UTF8/no filemutation. Addstrict source/prioraudit50 provenance, allfailedREDrecords preserved, minimal reversechange guard andcurrentfull301 selector; freshlint69 includesnewtest/helper, thennativefull301 existing17 suites required. New12 separately recorded/no false313 claim, no main/T37/PASS/end.\n')
