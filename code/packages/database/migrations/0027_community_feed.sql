CREATE TABLE feed_posts (
 id text PRIMARY KEY,author_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 game_id text NOT NULL REFERENCES games(id) ON DELETE RESTRICT,type text NOT NULL,body text NOT NULL,client_post_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 CONSTRAINT feed_post_author_identity_unique UNIQUE(id,author_id),
 CONSTRAINT feed_post_client_identity_unique UNIQUE(author_id,client_post_id),
 CONSTRAINT feed_post_type_check CHECK(type IN('FIND_PLAYMATES','SHARE','DISCUSSION')),
 CONSTRAINT feed_post_body_check CHECK(char_length(btrim(body)) BETWEEN 1 AND 5000 AND body=btrim(body)),
 CONSTRAINT feed_post_retry_check CHECK(char_length(client_post_id) BETWEEN 1 AND 128 AND client_post_id=btrim(client_post_id)),
 CONSTRAINT feed_post_clock_check CHECK(updated_at>=created_at AND (deleted_at IS NULL OR deleted_at>=created_at))
);
--> statement-breakpoint
CREATE INDEX feed_post_cursor_idx ON feed_posts(created_at,id) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX feed_post_game_cursor_idx ON feed_posts(game_id,created_at,id) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX feed_post_type_cursor_idx ON feed_posts(type,created_at,id) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX feed_post_game_type_cursor_idx ON feed_posts(game_id,type,created_at,id) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE TABLE feed_post_images (
 id text PRIMARY KEY,post_id text NOT NULL,uploader_id text NOT NULL,position integer NOT NULL,file_name text NOT NULL,file_size integer NOT NULL,mime_type text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT feed_image_post_author_fk FOREIGN KEY(post_id,uploader_id) REFERENCES feed_posts(id,author_id) ON DELETE RESTRICT,
 CONSTRAINT feed_image_position_unique UNIQUE(post_id,position),
 CONSTRAINT feed_image_position_check CHECK(position BETWEEN 0 AND 3),
 CONSTRAINT feed_image_size_check CHECK(file_size BETWEEN 1 AND 5242880),
 CONSTRAINT feed_image_mime_check CHECK(mime_type='image/webp'),
 CONSTRAINT feed_image_filename_check CHECK(char_length(file_name) BETWEEN 1 AND 255 AND position('/' in file_name)=0 AND position(chr(92) in file_name)=0)
);
--> statement-breakpoint
CREATE TABLE feed_likes (
 post_id text NOT NULL REFERENCES feed_posts(id) ON DELETE RESTRICT,user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(post_id,user_id)
);
--> statement-breakpoint
CREATE INDEX feed_like_user_idx ON feed_likes(user_id,post_id);
--> statement-breakpoint
CREATE TABLE feed_comments (
 id text PRIMARY KEY,post_id text NOT NULL REFERENCES feed_posts(id) ON DELETE RESTRICT,
 author_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,parent_comment_id text,body text NOT NULL,client_comment_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 CONSTRAINT feed_comment_post_identity_unique UNIQUE(post_id,id),
 CONSTRAINT feed_comment_client_identity_unique UNIQUE(author_id,post_id,client_comment_id),
 CONSTRAINT feed_comment_same_post_parent_fk FOREIGN KEY(post_id,parent_comment_id) REFERENCES feed_comments(post_id,id) ON DELETE RESTRICT,
 CONSTRAINT feed_comment_parent_check CHECK(parent_comment_id IS NULL OR parent_comment_id<>id),
 CONSTRAINT feed_comment_body_check CHECK(char_length(btrim(body)) BETWEEN 1 AND 1000 AND body=btrim(body)),
 CONSTRAINT feed_comment_retry_check CHECK(char_length(client_comment_id) BETWEEN 1 AND 128 AND client_comment_id=btrim(client_comment_id)),
 CONSTRAINT feed_comment_clock_check CHECK(updated_at>=created_at AND (deleted_at IS NULL OR deleted_at>=created_at))
);
--> statement-breakpoint
CREATE INDEX feed_comment_cursor_idx ON feed_comments(post_id,created_at,id);
--> statement-breakpoint
CREATE INDEX feed_comment_parent_cursor_idx ON feed_comments(post_id,parent_comment_id,created_at,id);
--> statement-breakpoint
ALTER TABLE pending_image_uploads ADD COLUMN purpose text NOT NULL DEFAULT 'CHAT_IMAGE';
--> statement-breakpoint
ALTER TABLE pending_image_uploads ALTER COLUMN conversation_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE pending_image_uploads ADD CONSTRAINT pending_image_uploads_purpose_check CHECK((purpose='CHAT_IMAGE' AND conversation_id IS NOT NULL) OR (purpose='FEED_POST' AND conversation_id IS NULL));
--> statement-breakpoint
ALTER TABLE reports ADD COLUMN reported_feed_post_id text REFERENCES feed_posts(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE reports ADD COLUMN reported_feed_comment_id text REFERENCES feed_comments(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE reports DROP CONSTRAINT report_target_type_check;
--> statement-breakpoint
ALTER TABLE reports ADD CONSTRAINT report_target_type_check CHECK(target_type IN('USER','MESSAGE','FEED_POST','FEED_COMMENT'));
--> statement-breakpoint
ALTER TABLE reports DROP CONSTRAINT report_target_shape_check;
--> statement-breakpoint
ALTER TABLE reports ADD CONSTRAINT report_target_shape_check CHECK(
 (target_type='USER' AND reported_user_id IS NOT NULL AND reported_message_id IS NULL AND reported_feed_post_id IS NULL AND reported_feed_comment_id IS NULL AND target_id=reported_user_id)
 OR (target_type='MESSAGE' AND reported_message_id IS NOT NULL AND reported_user_id IS NULL AND reported_feed_post_id IS NULL AND reported_feed_comment_id IS NULL AND target_id=reported_message_id)
 OR (target_type='FEED_POST' AND reported_feed_post_id IS NOT NULL AND reported_user_id IS NULL AND reported_message_id IS NULL AND reported_feed_comment_id IS NULL AND target_id=reported_feed_post_id)
 OR (target_type='FEED_COMMENT' AND reported_feed_comment_id IS NOT NULL AND reported_user_id IS NULL AND reported_message_id IS NULL AND reported_feed_post_id IS NULL AND target_id=reported_feed_comment_id)
);
--> statement-breakpoint
CREATE TABLE feed_content_audit (
 id text PRIMARY KEY,actor_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 post_id text NOT NULL REFERENCES feed_posts(id) ON DELETE RESTRICT,comment_id text,report_id text REFERENCES reports(id) ON DELETE RESTRICT,
 action text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT feed_audit_same_post_comment_fk FOREIGN KEY(post_id,comment_id) REFERENCES feed_comments(post_id,id) ON DELETE RESTRICT,
 CONSTRAINT feed_audit_action_check CHECK((action='DELETE_POST' AND comment_id IS NULL) OR (action='DELETE_COMMENT' AND comment_id IS NOT NULL)),
 CONSTRAINT feed_audit_reason_check CHECK(char_length(btrim(reason)) BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE INDEX feed_audit_post_idx ON feed_content_audit(post_id,created_at,id);
