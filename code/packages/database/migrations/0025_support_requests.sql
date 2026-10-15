CREATE TABLE support_requests (
 id text PRIMARY KEY, owner_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 client_request_id text NOT NULL, kind text NOT NULL, title text NOT NULL,
 status text NOT NULL DEFAULT 'NEW', version integer NOT NULL DEFAULT 1,
 last_message_sequence integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 last_activity_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
 CONSTRAINT support_request_owner_client_unique UNIQUE(owner_id,client_request_id),
 CONSTRAINT support_request_identity_check CHECK(char_length(id) BETWEEN 1 AND 128 AND id ~ '[^[:space:]]' AND id !~ '[[:cntrl:]]' AND char_length(client_request_id) BETWEEN 1 AND 128 AND client_request_id ~ '[^[:space:]]' AND client_request_id !~ '[[:cntrl:]]'),
 CONSTRAINT support_request_kind_title_check CHECK(kind IN ('FEEDBACK','BUG','CHAT') AND char_length(title) BETWEEN 1 AND 160 AND title ~ '[^[:space:]]' AND (kind<>'CHAT' OR title='Chat hỗ trợ')),
 CONSTRAINT support_request_state_check CHECK(status IN ('NEW','IN_PROGRESS','RESOLVED') AND version>=1 AND last_message_sequence>=0),
 CONSTRAINT support_request_time_check CHECK(updated_at>=created_at AND last_activity_at>=created_at AND ((status='RESOLVED' AND resolved_at IS NOT NULL AND resolved_at>=created_at) OR (status<>'RESOLVED' AND resolved_at IS NULL)))
);
--> statement-breakpoint
CREATE INDEX support_request_owner_activity_idx ON support_requests(owner_id,last_activity_at,id);
CREATE INDEX support_request_status_activity_idx ON support_requests(status,last_activity_at,id);
--> statement-breakpoint
CREATE TABLE support_messages (
 id text PRIMARY KEY, request_id text NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
 sequence integer NOT NULL, author_role text NOT NULL, author_id text REFERENCES "user"(id) ON DELETE RESTRICT,
 client_message_id text, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT support_message_request_sequence_unique UNIQUE(request_id,sequence),
 CONSTRAINT support_message_request_id_unique UNIQUE(request_id,id),
 CONSTRAINT support_message_cursor_identity_unique UNIQUE(request_id,id,sequence),
 CONSTRAINT support_message_identity_sequence_check CHECK(char_length(id) BETWEEN 1 AND 128 AND id ~ '[^[:space:]]' AND id !~ '[[:cntrl:]]' AND sequence>0),
 CONSTRAINT support_message_body_check CHECK(char_length(body) BETWEEN 1 AND 4000 AND body ~ '[^[:space:]]'),
 CONSTRAINT support_message_author_shape_check CHECK((author_role IN ('USER','ADMIN') AND author_id IS NOT NULL AND client_message_id IS NOT NULL AND char_length(client_message_id) BETWEEN 1 AND 128 AND client_message_id ~ '[^[:space:]]' AND client_message_id !~ '[[:cntrl:]]') OR (author_role='SYSTEM' AND author_id IS NULL AND client_message_id IS NULL AND body='FG đã nhận tin nhắn của bạn.'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX support_message_author_client_unique ON support_messages(request_id,author_id,client_message_id) WHERE author_id IS NOT NULL;
CREATE UNIQUE INDEX support_message_initial_receipt_unique ON support_messages(request_id) WHERE author_role='SYSTEM';
--> statement-breakpoint
CREATE TABLE support_notes (
 id text PRIMARY KEY, request_id text NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
 author_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT, client_note_id text NOT NULL,
 body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT support_note_author_client_unique UNIQUE(request_id,author_id,client_note_id),
 CONSTRAINT support_note_audit_identity_unique UNIQUE(request_id,id,author_id),
 CONSTRAINT support_note_identity_check CHECK(char_length(id) BETWEEN 1 AND 128 AND id ~ '[^[:space:]]' AND id !~ '[[:cntrl:]]' AND char_length(client_note_id) BETWEEN 1 AND 128 AND client_note_id ~ '[^[:space:]]' AND client_note_id !~ '[[:cntrl:]]'),
 CONSTRAINT support_note_body_time_check CHECK(char_length(body) BETWEEN 1 AND 4000 AND body ~ '[^[:space:]]' AND updated_at>=created_at)
);
--> statement-breakpoint
CREATE INDEX support_note_request_created_idx ON support_notes(request_id,created_at,id);
--> statement-breakpoint
CREATE TABLE support_read_cursors (
 request_id text NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
 reader_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT, reader_role text NOT NULL,
 last_read_message_id text, last_read_sequence integer NOT NULL DEFAULT 0, read_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT support_cursor_reader_unique PRIMARY KEY(request_id,reader_id),
 CONSTRAINT support_cursor_request_message_fk FOREIGN KEY(request_id,last_read_message_id,last_read_sequence) REFERENCES support_messages(request_id,id,sequence) ON DELETE NO ACTION,
 CONSTRAINT support_cursor_shape_check CHECK(reader_role IN ('OWNER','ADMIN') AND ((last_read_message_id IS NULL AND last_read_sequence=0) OR (last_read_message_id IS NOT NULL AND last_read_sequence>0)))
);
--> statement-breakpoint
CREATE TABLE support_audit (
 id text PRIMARY KEY, request_id text NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
 actor_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT, actor_role text NOT NULL,
 action text NOT NULL, from_status text, to_status text, request_version integer, note_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT support_audit_note_identity_fk FOREIGN KEY(request_id,note_id,actor_id) REFERENCES support_notes(request_id,id,author_id) ON DELETE NO ACTION,
 CONSTRAINT support_audit_note_once_unique UNIQUE(request_id,note_id),
 CONSTRAINT support_audit_identity_check CHECK(char_length(id) BETWEEN 1 AND 128 AND id ~ '[^[:space:]]' AND id !~ '[[:cntrl:]]'),
 CONSTRAINT support_audit_status_values_check CHECK((from_status IS NULL OR from_status IN ('NEW','IN_PROGRESS','RESOLVED')) AND (to_status IS NULL OR to_status IN ('NEW','IN_PROGRESS','RESOLVED'))),
 CONSTRAINT support_audit_action_shape_check CHECK((action='CREATED' AND actor_role='OWNER' AND from_status IS NULL AND to_status IS NOT NULL AND to_status='NEW' AND request_version IS NOT NULL AND request_version=1 AND note_id IS NULL) OR (action='STATUS_CHANGED' AND actor_role='ADMIN' AND from_status IS NOT NULL AND to_status IS NOT NULL AND from_status<>to_status AND request_version IS NOT NULL AND request_version>=2 AND note_id IS NULL) OR (action='NOTE_ADDED' AND actor_role='ADMIN' AND from_status IS NULL AND to_status IS NULL AND request_version IS NULL AND note_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX support_audit_status_revision_unique ON support_audit(request_id,request_version) WHERE action IN ('CREATED','STATUS_CHANGED');
CREATE INDEX support_audit_request_created_idx ON support_audit(request_id,created_at,id);
