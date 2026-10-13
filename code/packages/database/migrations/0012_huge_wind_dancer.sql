CREATE FUNCTION chat_crypto_valid_one_time_key(payload jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR payload - ARRAY['key','signatures']<>'{}'::jsonb OR NOT payload ?& ARRAY['key','signatures'] THEN RETURN false; END IF;
 RETURN jsonb_typeof(payload->'key')='string' AND payload->>'key' ~ '^[A-Za-z0-9+/]{43}=?$' AND chat_crypto_valid_signatures(payload->'signatures');
END $$;
--> statement-breakpoint
CREATE FUNCTION chat_crypto_valid_olm(payload jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE ciphertext jsonb; recipient text; event jsonb;
BEGIN
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR payload - ARRAY['algorithm','sender_key','ciphertext','org.matrix.msgid']<>'{}'::jsonb OR NOT payload ?& ARRAY['algorithm','sender_key','ciphertext'] OR octet_length(payload::text)>262144 THEN RETURN false; END IF;
 IF payload->>'algorithm' IS DISTINCT FROM 'm.olm.v1.curve25519-aes-sha2' OR jsonb_typeof(payload->'sender_key') IS DISTINCT FROM 'string' OR payload->>'sender_key' !~ '^[A-Za-z0-9+/]{43}=?$' THEN RETURN false; END IF;
 IF payload ? 'org.matrix.msgid' AND (jsonb_typeof(payload->'org.matrix.msgid')<>'string' OR length(payload->>'org.matrix.msgid') NOT BETWEEN 1 AND 128) THEN RETURN false; END IF;
 ciphertext:=payload->'ciphertext';IF jsonb_typeof(ciphertext) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF (SELECT count(*) FROM jsonb_each(ciphertext)) NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
 FOR recipient,event IN SELECT * FROM jsonb_each(ciphertext) LOOP
  IF recipient !~ '^[A-Za-z0-9+/]{43}=?$' OR jsonb_typeof(event)<>'object' OR event - ARRAY['type','body']<>'{}'::jsonb OR NOT event ?& ARRAY['type','body'] THEN RETURN false; END IF;
  IF event->'type' IS DISTINCT FROM '0'::jsonb AND event->'type' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
  IF jsonb_typeof(event->'body') IS DISTINCT FROM 'string' OR length(event->>'body') NOT BETWEEN 1 AND 65536 OR event->>'body' !~ '^[A-Za-z0-9+/]+={0,2}$' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;

--> statement-breakpoint
ALTER TABLE "chat_crypto_one_time_keys" DROP CONSTRAINT "chat_crypto_otk_public_only_check";--> statement-breakpoint
ALTER TABLE "chat_crypto_to_device_events" DROP CONSTRAINT "chat_crypto_to_device_cipher_check";--> statement-breakpoint
ALTER TABLE "chat_crypto_one_time_keys" ADD CONSTRAINT "chat_crypto_otk_public_only_check" CHECK ("chat_crypto_one_time_keys"."key_id" ~ '^signed_curve25519:[A-Za-z0-9_.-]+$' AND chat_crypto_valid_one_time_key("chat_crypto_one_time_keys"."signed_key"));--> statement-breakpoint
ALTER TABLE "chat_crypto_to_device_events" ADD CONSTRAINT "chat_crypto_to_device_cipher_check" CHECK (chat_crypto_valid_olm("chat_crypto_to_device_events"."content"));