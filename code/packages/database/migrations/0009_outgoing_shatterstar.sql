-- Structural storage validation only: E2EE authentication is verified by SDK
-- clients. A server cannot authenticate private ciphertext without private keys.
CREATE FUNCTION chat_crypto_valid_envelope(payload jsonb, mode text, expected_key text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE event jsonb; body text; session text; key_version numeric;
BEGIN
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR payload->'version' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
 IF mode='E2EE' THEN
  IF payload->>'protocol' IS DISTINCT FROM 'MATRIX_MEGOLM' OR payload - ARRAY['version','protocol','event'] <> '{}'::jsonb THEN RETURN false; END IF;
  event:=payload->'event';
  IF event IS NULL OR jsonb_typeof(event)<>'object' OR event->>'algorithm' IS DISTINCT FROM 'm.megolm.v1.aes-sha2' OR event - ARRAY['algorithm','ciphertext','session_id','sender_key','device_id'] <> '{}'::jsonb THEN RETURN false; END IF;
  body:=event->>'ciphertext';session:=event->>'session_id';
  IF jsonb_typeof(event->'ciphertext') IS DISTINCT FROM 'string' OR jsonb_typeof(event->'session_id') IS DISTINCT FROM 'string' OR body IS NULL OR body !~ '^[A-Za-z0-9+/]+={0,2}$' OR length(body)>131072 OR session IS NULL OR session !~ '^[A-Za-z0-9+/]{43}=?$' THEN RETURN false; END IF;
  IF event ? 'sender_key' AND (jsonb_typeof(event->'sender_key')<>'string' OR event->>'sender_key' !~ '^[A-Za-z0-9+/]{43}=?$') THEN RETURN false; END IF;
  IF event ? 'device_id' AND (jsonb_typeof(event->'device_id')<>'string' OR event->>'device_id' !~ '^[A-Za-z0-9_.-]{1,128}$') THEN RETURN false; END IF;
  RETURN true;
 ELSIF mode='LOBBY_AEAD' THEN
  IF payload->>'protocol' IS DISTINCT FROM 'OPENBAO_TRANSIT_AES256GCM' OR payload->>'keyId' IS DISTINCT FROM expected_key OR payload - ARRAY['version','protocol','keyId','keyVersion','ciphertext'] <> '{}'::jsonb THEN RETURN false; END IF;
  body:=payload->>'ciphertext';
  IF jsonb_typeof(payload->'ciphertext') IS DISTINCT FROM 'string' OR body IS NULL OR length(body)>33554432 OR body !~ '^(vault|bao):v[1-9][0-9]*:[A-Za-z0-9+/]+=*$' OR jsonb_typeof(payload->'keyVersion') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  key_version:=(payload->>'keyVersion')::numeric;
  RETURN key_version>=1 AND key_version<=9007199254740991 AND key_version=trunc(key_version) AND split_part(body,':',2)='v'||key_version::text;
 END IF;
 RETURN false;
END $$;

--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachment_encryption_shape_check";--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "message_encryption_shape_check";--> statement-breakpoint
ALTER TABLE "chat_crypto_membership_intervals" DROP CONSTRAINT "chat_crypto_interval_check";--> statement-breakpoint
ALTER TABLE "chat_crypto_report_evidence" DROP CONSTRAINT "chat_crypto_report_envelope_check";--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachment_encryption_shape_check" CHECK (("attachments"."encryption_mode"='LEGACY_PENDING' AND "attachments"."crypto_envelope" IS NULL) OR ("attachments"."encryption_mode"='E2EE' AND "attachments"."file_name"='' AND "attachments"."mime_type"='application/octet-stream' AND "attachments"."crypto_envelope" IS NULL AND "attachments"."file_size" BETWEEN 1 AND 5242880) OR ("attachments"."encryption_mode"='LOBBY_AEAD' AND chat_crypto_valid_envelope("attachments"."crypto_envelope",'LOBBY_AEAD','fg-lobby')));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "message_encryption_shape_check" CHECK (("messages"."encryption_mode"='LEGACY_PENDING' AND "messages"."crypto_envelope" IS NULL AND "messages"."crypto_revision" IS NULL) OR ("messages"."content"='' AND "messages"."crypto_revision" IS NOT NULL AND "messages"."crypto_revision" BETWEEN 1 AND 9007199254740991 AND chat_crypto_valid_envelope("messages"."crypto_envelope","messages"."encryption_mode",'fg-lobby')));--> statement-breakpoint
ALTER TABLE "chat_crypto_membership_intervals" ADD CONSTRAINT "chat_crypto_interval_check" CHECK ("chat_crypto_membership_intervals"."start_revision" BETWEEN 1 AND 9007199254740991 AND (("chat_crypto_membership_intervals"."end_revision" IS NULL AND "chat_crypto_membership_intervals"."left_at" IS NULL) OR ("chat_crypto_membership_intervals"."end_revision" IS NOT NULL AND "chat_crypto_membership_intervals"."left_at" IS NOT NULL AND "chat_crypto_membership_intervals"."end_revision">"chat_crypto_membership_intervals"."start_revision" AND "chat_crypto_membership_intervals"."end_revision"<=9007199254740991 AND "chat_crypto_membership_intervals"."left_at">="chat_crypto_membership_intervals"."joined_at")));--> statement-breakpoint
ALTER TABLE "chat_crypto_report_evidence" ADD CONSTRAINT "chat_crypto_report_envelope_check" CHECK (chat_crypto_valid_envelope("chat_crypto_report_evidence"."envelope",'LOBBY_AEAD','fg-report'));