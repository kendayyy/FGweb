ALTER TABLE support_notes ADD CONSTRAINT support_note_delivery_identity_unique UNIQUE(request_id,id);
--> statement-breakpoint
CREATE TABLE support_outbox (
 id text PRIMARY KEY, ordinal bigserial NOT NULL UNIQUE,
 request_id text NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
 kind text NOT NULL, message_id text, note_id text, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz,
 CONSTRAINT support_outbox_message_parent_fk FOREIGN KEY(request_id,message_id) REFERENCES support_messages(request_id,id) ON DELETE CASCADE,
 CONSTRAINT support_outbox_note_parent_fk FOREIGN KEY(request_id,note_id) REFERENCES support_notes(request_id,id) ON DELETE CASCADE,
 CONSTRAINT support_outbox_message_once UNIQUE(request_id,message_id),
 CONSTRAINT support_outbox_note_once UNIQUE(request_id,note_id),
 CONSTRAINT support_outbox_shape_check CHECK((kind='MESSAGE' AND message_id IS NOT NULL AND note_id IS NULL) OR (kind='NOTE' AND note_id IS NOT NULL AND message_id IS NULL) OR (kind='REQUEST' AND message_id IS NULL AND note_id IS NULL)),
 CONSTRAINT support_outbox_attempts_check CHECK(attempts>=0 AND (delivered_at IS NULL OR delivered_at>=created_at))
);
--> statement-breakpoint
CREATE INDEX support_outbox_pending_idx ON support_outbox(ordinal) WHERE delivered_at IS NULL;
--> statement-breakpoint
CREATE TABLE moderation_audit (
 id text PRIMARY KEY,actor_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 target_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 action text NOT NULL,report_id text REFERENCES reports(id) ON DELETE RESTRICT,
 message_id text REFERENCES messages(id) ON DELETE RESTRICT,reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT moderation_audit_message_identity_unique UNIQUE(id,message_id),
 CONSTRAINT moderation_audit_shape_check CHECK((action IN('BAN','UNBAN') AND report_id IS NULL AND message_id IS NULL) OR (action IN('RESOLVE_REPORT','DISMISS_REPORT') AND report_id IS NOT NULL AND message_id IS NULL) OR (action='DELETE_MESSAGE' AND message_id IS NOT NULL AND report_id IS NULL)),
 CONSTRAINT moderation_audit_reason_check CHECK(reason IS NULL OR char_length(reason)<=300)
);
--> statement-breakpoint
CREATE INDEX moderation_audit_target_idx ON moderation_audit(target_user_id,created_at,id);
--> statement-breakpoint
CREATE TABLE moderation_outbox (
 id text PRIMARY KEY,audit_id text NOT NULL UNIQUE REFERENCES moderation_audit(id) ON DELETE RESTRICT,
 attempts integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,
 CONSTRAINT moderation_outbox_attempts_check CHECK(attempts>=0 AND (delivered_at IS NULL OR delivered_at>=created_at))
);
--> statement-breakpoint
CREATE INDEX moderation_outbox_pending_idx ON moderation_outbox(created_at,id) WHERE delivered_at IS NULL;
--> statement-breakpoint
CREATE TABLE moderation_message_tombstones (
 message_id text PRIMARY KEY REFERENCES messages(id) ON DELETE RESTRICT,audit_id text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT moderation_tombstone_audit_message_fk FOREIGN KEY(audit_id,message_id) REFERENCES moderation_audit(id,message_id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX moderation_tombstone_created_idx ON moderation_message_tombstones(created_at,message_id);
