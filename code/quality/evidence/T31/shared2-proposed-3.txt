-- Add structured provider identities without dropping or rewriting legacy rows.
ALTER TABLE external_lives ADD COLUMN video_id text, ADD COLUMN channel_name text;
--> statement-breakpoint
UPDATE external_lives SET video_id=substring(url FROM '^https://(?:www\.|m\.)?youtube\.com/watch\?v=([A-Za-z0-9_-]{11})$')
 WHERE provider='youtube' AND url ~ '^https://(?:www\.|m\.)?youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$';
--> statement-breakpoint
UPDATE external_lives SET channel_name=lower(substring(url FROM '^https://(?:www\.|m\.)?twitch\.tv/([A-Za-z0-9_]{1,25})/?$'))
 WHERE provider='twitch' AND url ~ '^https://(?:www\.|m\.)?twitch\.tv/[A-Za-z0-9_]{1,25}/?$';
--> statement-breakpoint
ALTER TABLE external_lives ADD CONSTRAINT external_lives_structured_source_check CHECK (
 (video_id IS NULL AND channel_name IS NULL)
 OR (provider='youtube' AND video_id IS NOT NULL AND video_id ~ '^[A-Za-z0-9_-]{11}$' AND channel_name IS NULL)
 OR (provider='twitch' AND channel_name IS NOT NULL AND channel_name ~ '^[a-z0-9_]{1,25}$' AND video_id IS NULL)
);
--> statement-breakpoint
CREATE FUNCTION external_live_member_left_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM external_lives WHERE call_group_id=OLD.call_group_id AND configured_by=OLD.user_id;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER external_live_member_left BEFORE UPDATE OF left_at ON call_members
 FOR EACH ROW WHEN (OLD.left_at IS NULL AND NEW.left_at IS NOT NULL)
 EXECUTE FUNCTION external_live_member_left_cleanup();
--> statement-breakpoint
CREATE FUNCTION external_live_call_closed_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM external_lives WHERE call_group_id=OLD.id;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER external_live_call_closed BEFORE UPDATE OF state ON call_groups
 FOR EACH ROW WHEN (OLD.state='OPEN' AND NEW.state='CLOSED')
 EXECUTE FUNCTION external_live_call_closed_cleanup();
