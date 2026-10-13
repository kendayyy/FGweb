import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const file='packages/database/migrations/0011_lame_tombstone.sql',hash=s=>createHash('sha256').update(s).digest('hex');
const generated=fs.readFileSync(file,'utf8');assert(!generated.includes('CREATE FUNCTION'));
const source=fs.readFileSync('packages/database/src/crypto-public-key-validation.sql','utf8');
const guards=`
--> statement-breakpoint
CREATE FUNCTION chat_crypto_guard_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.encryption_mode<>'LEGACY_PENDING' AND NEW.encryption_mode<>OLD.encryption_mode THEN
  RAISE EXCEPTION 'Encrypted attachment cannot change storage mode' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER chat_crypto_attachment_policy BEFORE UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION chat_crypto_guard_attachment();
`;
const reviewed=source+'\n--> statement-breakpoint\n'+generated.replaceAll('REFERENCES "public".','REFERENCES ')+guards;
fs.writeFileSync(file,reviewed);
fs.writeFileSync('quality/evidence/CHATCRYPTO-DATA/public-migration-provenance.json',JSON.stringify({recordedAt:new Date().toISOString(),file,generatedSha256:hash(generated),reviewedSha256:hash(reviewed),validationSourceSha256:hash(source),changes:['Strict public device/cross-signing JSON and signatures','Encrypted recovery armor, reconciled timestamp','Attachment mode downgrade guard'],mainDatabaseMigrated:false},null,2)+'\n');
console.log('Reviewed strict public-key/recovery/downgrade migration.');
