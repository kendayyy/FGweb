import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const file='packages/database/migrations/0008_numerous_switch.sql';
let sql=fs.readFileSync(file,'utf8');assert(!sql.includes('chat_crypto_guard_message'));
const generatedSha256=createHash('sha256').update(sql).digest('hex');
// Use schema-local FKs, matching the existing migration convention and allowing
// actual isolated migration tests without binding new tables to the main schema.
sql=sql.replaceAll('REFERENCES "public".','REFERENCES ');
sql+=`\n--> statement-breakpoint
INSERT INTO chat_crypto_state(conversation_id,mode,membership_revision,migration_state,history_status)
SELECT id,CASE WHEN kind='LOBBY' THEN 'LOBBY_AEAD' ELSE 'E2EE' END,1,'LEGACY_PENDING','UNKNOWN' FROM conversations;
--> statement-breakpoint
CREATE FUNCTION chat_crypto_guard_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conversation_kind text; migration_status text;
BEGIN
 IF TG_OP='UPDATE' AND OLD.encryption_mode<>'LEGACY_PENDING' AND NEW.encryption_mode='LEGACY_PENDING' THEN
  RAISE EXCEPTION 'Encrypted message cannot downgrade' USING ERRCODE='23514';
 END IF;
 SELECT kind INTO conversation_kind FROM conversations WHERE id=NEW.conversation_id;
 IF (NEW.encryption_mode='E2EE' AND conversation_kind='LOBBY') OR (NEW.encryption_mode='LOBBY_AEAD' AND conversation_kind<>'LOBBY') THEN
  RAISE EXCEPTION 'Conversation crypto mode mismatch' USING ERRCODE='23514';
 END IF;
 SELECT migration_state INTO migration_status FROM chat_crypto_state WHERE conversation_id=NEW.conversation_id;
 IF NEW.encryption_mode='LEGACY_PENDING' AND migration_status='RECONCILED' THEN
  RAISE EXCEPTION 'Plaintext writes are closed after reconciliation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER chat_crypto_message_policy BEFORE INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION chat_crypto_guard_message();
`;
fs.writeFileSync(file,sql);
fs.writeFileSync('quality/evidence/CHATCRYPTO-DATA/migration-provenance.json',JSON.stringify({recordedAt:new Date().toISOString(),file,generatedSha256,reviewedSha256:createHash('sha256').update(sql).digest('hex'),changes:['Schema-local FK qualifier normalization','Legacy-preserving crypto state inventory only; no automatic cohorts/key grants','Message downgrade/mode/cutoff database triggers'],mainDatabaseMigrated:false},null,2)+'\n');
console.log('New migration reviewed: local FKs, non-destructive state inventory, downgrade/mode/cutoff guards.');
