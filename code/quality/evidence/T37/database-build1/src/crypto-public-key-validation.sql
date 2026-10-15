-- Structure-only public key guards. Ed25519 verification remains in the SDK/API.
CREATE FUNCTION chat_crypto_valid_signatures(payload jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE actor text; entries jsonb; key_id text; signature jsonb;
BEGIN
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' THEN RETURN false; END IF;
 IF (SELECT count(*) FROM jsonb_each(payload)) NOT BETWEEN 1 AND 16 THEN RETURN false; END IF;
 FOR actor,entries IN SELECT * FROM jsonb_each(payload) LOOP
  IF actor !~ '^@[^:[:space:]]+:[^[:space:]]+$' OR length(actor)>255 OR jsonb_typeof(entries)<>'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_each(entries)) NOT BETWEEN 1 AND 16 THEN RETURN false; END IF;
  FOR key_id,signature IN SELECT * FROM jsonb_each(entries) LOOP
   IF key_id !~ '^ed25519:[A-Za-z0-9_.+/-]{1,128}$' OR jsonb_typeof(signature)<>'string' OR signature#>>'{}' !~ '^[A-Za-z0-9+/]{86}={0,2}$' THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION chat_crypto_valid_device_keys(payload jsonb, device_id text, ed_key text, curve_key text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE actor text; keys jsonb;
BEGIN
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR payload - ARRAY['user_id','device_id','algorithms','keys','signatures']<>'{}'::jsonb OR NOT payload ?& ARRAY['user_id','device_id','algorithms','keys','signatures'] THEN RETURN false; END IF;
 actor:=payload->>'user_id';keys:=payload->'keys';
 IF jsonb_typeof(payload->'user_id') IS DISTINCT FROM 'string' OR actor !~ '^@[^:[:space:]]+:[^[:space:]]+$' OR length(actor)>255 OR payload->>'device_id' IS DISTINCT FROM device_id OR device_id !~ '^[A-Za-z0-9_.-]{1,128}$' THEN RETURN false; END IF;
 IF jsonb_typeof(keys) IS DISTINCT FROM 'object' OR keys - ARRAY['ed25519:'||device_id,'curve25519:'||device_id]<>'{}'::jsonb THEN RETURN false; END IF;
 IF keys->>('ed25519:'||device_id) IS DISTINCT FROM ed_key OR keys->>('curve25519:'||device_id) IS DISTINCT FROM curve_key OR ed_key !~ '^[A-Za-z0-9+/]{43}=?$' OR curve_key !~ '^[A-Za-z0-9+/]{43}=?$' THEN RETURN false; END IF;
 IF payload->'algorithms' IS DISTINCT FROM '["m.olm.v1.curve25519-aes-sha2","m.megolm.v1.aes-sha2"]'::jsonb AND payload->'algorithms' IS DISTINCT FROM '["m.megolm.v1.aes-sha2","m.olm.v1.curve25519-aes-sha2"]'::jsonb THEN RETURN false; END IF;
 RETURN chat_crypto_valid_signatures(payload->'signatures') AND COALESCE((payload->'signatures'->actor) ? ('ed25519:'||device_id),false);
END $$;
--> statement-breakpoint
CREATE FUNCTION chat_crypto_valid_identity_keys(payload jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE field text; item jsonb; usage text; actor text; key_id text; value jsonb;
BEGIN
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR payload - ARRAY['masterKey','selfSigningKey','userSigningKey']<>'{}'::jsonb OR NOT payload ?& ARRAY['masterKey','selfSigningKey','userSigningKey'] THEN RETURN false; END IF;
 FOR field,item IN SELECT * FROM jsonb_each(payload) LOOP
  usage:=CASE field WHEN 'masterKey' THEN 'master' WHEN 'selfSigningKey' THEN 'self_signing' ELSE 'user_signing' END;
  IF jsonb_typeof(item)<>'object' OR item - ARRAY['user_id','usage','keys','signatures']<>'{}'::jsonb OR NOT item ?& ARRAY['user_id','usage','keys'] THEN RETURN false; END IF;
  IF jsonb_typeof(item->'user_id') IS DISTINCT FROM 'string' OR item->>'user_id' !~ '^@[^:[:space:]]+:[^[:space:]]+$' OR length(item->>'user_id')>255 THEN RETURN false; END IF;
  IF actor IS NOT NULL AND actor IS DISTINCT FROM item->>'user_id' THEN RETURN false; END IF;actor:=item->>'user_id';
  IF item->'usage' IS DISTINCT FROM jsonb_build_array(usage) OR jsonb_typeof(item->'keys') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_each(item->'keys'))<>1 THEN RETURN false; END IF;
  FOR key_id,value IN SELECT * FROM jsonb_each(item->'keys') LOOP
   IF jsonb_typeof(value)<>'string' OR value#>>'{}' !~ '^[A-Za-z0-9+/]{43}=?$' OR key_id IS DISTINCT FROM 'ed25519:'||(value#>>'{}') THEN RETURN false; END IF;
  END LOOP;
  IF item ? 'signatures' AND NOT chat_crypto_valid_signatures(item->'signatures') THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
