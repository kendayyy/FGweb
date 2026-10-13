import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('apps/web/test/crypto-legacy-migration.native.ts','utf8').replaceAll('\r\n','\n');
let prefix=source.slice(0,source.indexOf('    const late ='));
assert(prefix.length>5000);
prefix=prefix.replace("import { CryptoLegacyMigration }", "import { setupLegacyArchiveCustody } from '../../../quality/evidence/CHATCRYPTO-FE/legacy-archive-custody-fixture.mjs';\nimport { createLegacySourceArchive, restoreLegacySourceArchive } from '../../../quality/evidence/CHATCRYPTO-FE/legacy-source-archive.mjs';\nimport { CryptoConversation } from '../src/features/crypto/conversation.ts';\nimport { decodeLegacyImage } from '../src/features/crypto/images.ts';\nimport { CryptoLegacyMigration }");
prefix=prefix.replace("without activating migration', { timeout: 90_000 }", "with encrypted source backup, verified restore and isolated operator activation', { timeout: 180_000 }");
// This new single-cohort fixture is separate from the existing unchanged foreign-cohort tests.
prefix=prefix.split('\n').filter(line=>!line.includes("INSERT INTO messages(id,conversation_id,sender_id,type,content,client_message_id,encryption_mode) VALUES('context-foreign'")&&!line.includes("INSERT INTO chat_crypto_legacy_migrations(message_id,conversation_id,cohort_id,original_sha256,state) VALUES('context-foreign'")).join('\n');
prefix=prefix.replace("['foreign-cohort', 'visible-cohort']", "['visible-cohort']");
prefix=prefix.replace("replyToId:'context-foreign'", "replyToId:null").replace("reply_to_id='context-foreign'", "reply_to_id=NULL");
prefix=prefix.replace("const saved = { ...process.env };", "const restored=`crypto_fe_${randomUUID().replaceAll('-', '')}`;\n  let custody: Awaited<ReturnType<typeof setupLegacyArchiveCustody>> | undefined;\n  const saved = { ...process.env };");
prefix=prefix.replace("FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER: '10000'", "FG_LEGACY_SOURCE_CLEANUP: 'enabled', FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER: '10000'");
const activation=`
    custody=await setupLegacyArchiveCustody();
    const backup=await createLegacySourceArchive(owned,custody.env);
    assert.equal(JSON.stringify(backup.archive).includes(originalSource.content),false);
    assert.equal(JSON.stringify(backup.archive).includes(Buffer.from(imageBytes).toString('base64')),false);
    const restoredObjects=await restoreLegacySourceArchive(backup.archive,restored,custody.env,pool);
    assert.deepEqual(restoredObjects,backup.proof.objects);
    const restoredRows=(await pool.query('SELECT content,encryption_mode FROM "'+restored+'".messages WHERE id=$1',[originalSource.messageId])).rows;
    assert.deepEqual(restoredRows,[retained]);
    assert.deepEqual(fs.readFileSync(path.join(parent,restored,'legacy',imageId+'.webp')),Buffer.from(imageBytes));
    for(const table of ['chat_crypto_legacy_candidates','chat_crypto_legacy_attestations','chat_crypto_upload_drafts']){
      const before=Number((await pool.query('SELECT count(*) FROM '+table)).rows[0].count),after=Number((await pool.query('SELECT count(*) FROM "'+restored+'".'+table)).rows[0].count);assert.equal(after,before);
    }
    assert.equal((await pool.query('SELECT token FROM "'+restored+'"."session" WHERE user_id=$1',[users[0]])).rows[0].token,owned+'-'+users[0],'COPY data must not be rewritten while rebasing schema');
    await assert.rejects(restoreLegacySourceArchive({...backup.archive,backupId:randomUUID()},'crypto_fe_'+randomUUID().replaceAll('-',''),custody.env,pool));
    await assert.rejects(restoreLegacySourceArchive({...backup.archive,ciphertext:backup.archive.ciphertext.slice(0,-4)+'AAAA'},'crypto_fe_'+randomUUID().replaceAll('-',''),custody.env,pool));
    const archiveAuditSha256=custody.assertAuditNoPlaintext([originalSource.content]);
    console.log(JSON.stringify({actualTlsTransitSourceArchive:true,separateNonexportableArchiveKey:true,actualPgDumpAndRestore:true,originalSourceAndImageRestored:true,candidateAndNativeReceiptsRestored:true,wrongBackupAndTamperRejected:true,archiveAuditSha256}));
    const {CryptoLegacyService}=await import('../../api/dist/modules/chat-crypto/crypto-legacy.service.js');
    const service=app.get(CryptoLegacyService),actor={userId:users[0],sessionId:owned+'-'+users[0]},request={deviceId:'A',membershipRevision:state.membershipRevision,cohortId:'visible-cohort',expectedSourceCount:1};
    const ready=await service.reviewReconciliation(actor,'native-dm',request);assert.equal(ready.sourceCount,1);assert.equal(ready.requiredDeviceClaims,2);assert.equal(ready.attachmentCount,1);
    await assert.rejects(service.reviewReconciliation(actor,'native-dm',{...request,expectedSourceCount:2}));
    const staged=await service.stageReconciliation(actor,'native-dm',request);assert.equal(staged.phase,'STAGED');assert(fs.existsSync(path.join(storage,'legacy',imageId+'.webp')));
    assert.equal((await pool.query("SELECT content FROM messages WHERE id='context-old'")).rows[0].content,originalSource.content);
    const converted=await service.convertStagedReconciliation(actor,'native-dm',request);assert.equal(converted.phase,'DB_CONVERTED');
    assert.equal((await pool.query("SELECT migration_state FROM chat_crypto_state WHERE conversation_id='native-dm'")).rows[0].migration_state,'MIGRATING');
    await assert.rejects(apis[0].invoke('GET','/api/v1/crypto/conversations/:id/messages',{id:'native-dm'},{deviceId:'A',limit:100}));
    assert(fs.existsSync(path.join(storage,'legacy',imageId+'.webp')));
    const completed=await service.cleanupStagedReconciliation(actor,'native-dm',request);assert.equal(completed.phase,'RECONCILED');
    assert.equal(fs.existsSync(path.join(storage,'legacy',imageId+'.webp')),false);
    const final=CryptoConversationStateSchema.parse(await apis[0].invoke('GET','/api/v1/crypto/conversations/:id/state',{id:'native-dm'}));assert.equal(final.migrationState,'RECONCILED');assert.equal(final.membershipRevision,state.membershipRevision+1);
    for(const index of [0,1]){
      const conversation=new CryptoConversation(sessions[index],apis[index],'native-dm',users[index],users),history=await conversation.history(),rows=await conversation.decodePage(history.items);
      assert.equal(rows.length,1);assert.equal(rows[0].error,undefined);assert.deepEqual(rows[0].legacy?.source,originalSource);assert.equal(rows[0].message.origin,'LEGACY_IMPORT');
      const content=rows[0].legacy!;const ciphertext=await apis[index].downloadAttachment('native-dm',imageId);const image=await decodeLegacyImage(ciphertext,originalSource.attachments[0],content.images[0]);assert.equal(image.width,24);assert.equal(image.height,18);assert.deepEqual(Buffer.from(await image.blob.arrayBuffer()),Buffer.from(imageBytes));ciphertext.fill(0);
    }
    console.log(JSON.stringify({actualIsolatedOperatorActivation:true,backupVerifiedBeforeSourceCleanup:true,dbConvertedReadersClosed:true,physicalSourceRemoved:true,nativeOriginalHistoryAndImageOnBothDevices:true,mainMutation:false}));
`;
let suffix=source.slice(source.indexOf('  } finally {\n    for (const session'));
suffix=suffix.replace("assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/);", "await custody?.close();\n        assert.match(restored, /^crypto_fe_[a-f0-9]{32}$/);\n        await pool.query('DROP SCHEMA IF EXISTS \"'+restored+'\" CASCADE');\n        const restoredRoot=path.join(parent,restored);if(fs.existsSync(restoredRoot)){assert.equal(fs.realpathSync(restoredRoot),path.join(fs.realpathSync(parent),restored));fs.rmSync(restoredRoot,{recursive:true});}\n        assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/);");
fs.writeFileSync('apps/web/test/crypto-legacy-activation.native.ts',prefix+activation+suffix,{flag:'wx'});
