import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const file='packages/database/migrations/0013_small_solo.sql',hash=s=>createHash('sha256').update(s).digest('hex');
const generated=fs.readFileSync(file,'utf8');assert(!generated.includes('CREATE FUNCTION'));
const reviewed=generated.replaceAll('REFERENCES "public".','REFERENCES ')+`
--> statement-breakpoint
CREATE FUNCTION chat_crypto_guard_session_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.session_id,NEW.conversation_id,NEW.sender_user_id,NEW.sender_device_id,NEW.membership_revision) IS DISTINCT FROM ROW(OLD.session_id,OLD.conversation_id,OLD.sender_user_id,OLD.sender_device_id,OLD.membership_revision) THEN
  RAISE EXCEPTION 'Megolm session binding is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER chat_crypto_session_binding_policy BEFORE UPDATE ON chat_crypto_outbound_sessions FOR EACH ROW EXECUTE FUNCTION chat_crypto_guard_session_binding();
`;
fs.writeFileSync(file,reviewed);fs.writeFileSync('quality/evidence/CHATCRYPTO-DATA/session-migration-provenance.json',JSON.stringify({recordedAt:new Date().toISOString(),file,generatedSha256:hash(generated),reviewedSha256:hash(reviewed),changes:['Schema-local FK normalization','Immutable outbound session conversation/device/epoch binding'],mainDatabaseMigrated:false},null,2)+'\n');
console.log('Reviewed immutable Megolm session tombstone migration.');
