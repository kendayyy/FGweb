CREATE TABLE "call_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"state" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	CONSTRAINT "call_groups_id_room_unique" UNIQUE("id","room_id"),
	CONSTRAINT "call_groups_id_state_unique" UNIQUE("id","state"),
	CONSTRAINT "call_group_state_check" CHECK (state IN ('OPEN', 'CLOSED'))
);
--> statement-breakpoint
CREATE TABLE "call_members" (
	"id" text PRIMARY KEY NOT NULL,
	"call_group_id" text NOT NULL,
	"room_id" text NOT NULL,
	"user_id" text NOT NULL,
	"seat_index" integer NOT NULL,
	"is_muted" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"call_state" text GENERATED ALWAYS AS (CASE WHEN left_at IS NULL THEN 'OPEN' ELSE NULL END) STORED,
	"active" boolean GENERATED ALWAYS AS (CASE WHEN left_at IS NULL THEN true ELSE NULL END) STORED,
	CONSTRAINT "call_member_group_user_unique" UNIQUE("call_group_id","user_id"),
	CONSTRAINT "call_members_group_user_active_unique" UNIQUE("call_group_id","user_id","active"),
	CONSTRAINT "call_member_seat_index_check" CHECK (seat_index >= 1 AND seat_index <= 10)
);
--> statement-breakpoint
CREATE TABLE "call_publish_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"call_group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"is_call_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "call_publish_slot_ordinal_unique" UNIQUE("call_group_id","ordinal"),
	CONSTRAINT "call_publish_slot_user_unique" UNIQUE("call_group_id","user_id"),
	CONSTRAINT "call_publish_slot_ordinal_bounds" CHECK (ordinal >= 1 AND ordinal <= 3),
	CONSTRAINT "call_publish_slot_active_check" CHECK (is_call_active = true)
);
--> statement-breakpoint
CREATE TABLE "call_restrictions" (
	"id" text PRIMARY KEY NOT NULL,
	"call_group_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"restriction_type" text NOT NULL,
	"issued_by" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "call_restriction_group_target_type_unique" UNIQUE("call_group_id","target_user_id","restriction_type"),
	CONSTRAINT "call_restriction_type_check" CHECK (restriction_type IN ('MIC_MUTED', 'STREAM_BLOCKED'))
);
--> statement-breakpoint
CREATE TABLE "external_lives" (
	"id" text PRIMARY KEY NOT NULL,
	"call_group_id" text NOT NULL,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"configured_by" text NOT NULL,
	"is_call_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_lives_call_group_unique" UNIQUE("call_group_id"),
	CONSTRAINT "external_live_provider_check" CHECK (provider IN ('youtube', 'twitch')),
	CONSTRAINT "external_lives_active_check" CHECK (is_call_active = true)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" text,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"dedup_key" text NOT NULL,
	"last_error" text,
	"scheduled_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_channel_user_dedup_unique" UNIQUE("channel","user_id","dedup_key"),
	CONSTRAINT "outbox_channel_check" CHECK (channel IN ('IN_APP', 'PUSH', 'EMAIL')),
	CONSTRAINT "outbox_status_check" CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
	CONSTRAINT "outbox_retry_bounds_check" CHECK (retry_count >= 0 AND max_retries >= 1 AND retry_count <= max_retries)
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"notification_type" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_pref_user_type_unique" UNIQUE("user_id","notification_type"),
	CONSTRAINT "notification_pref_type_check" CHECK (notification_type IN ('DM', 'MENTION', 'FRIEND_INVITE', 'ROOM_INVITE', 'TEAM_INVITE', 'JOIN_REQUEST', 'JOIN_REQUEST_RESULT', 'REMINDER_10MIN')),
	CONSTRAINT "notification_pref_email_forbidden_check" CHECK ((notification_type IN ('DM', 'MENTION', 'JOIN_REQUEST', 'JOIN_REQUEST_RESULT') AND email = false) OR (notification_type IN ('FRIEND_INVITE', 'ROOM_INVITE', 'TEAM_INVITE', 'REMINDER_10MIN')))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"dedup_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_user_dedup_unique" UNIQUE("user_id","dedup_key"),
	CONSTRAINT "notifications_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "notification_type_check" CHECK (type IN ('DM', 'MENTION', 'FRIEND_INVITE', 'ROOM_INVITE', 'TEAM_INVITE', 'JOIN_REQUEST', 'JOIN_REQUEST_RESULT', 'REMINDER_10MIN')),
	CONSTRAINT "notification_dedup_key_nonempty" CHECK (length(trim(dedup_key)) > 0)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_sub_endpoint_unique" UNIQUE("endpoint"),
	CONSTRAINT "push_sub_user_endpoint_unique" UNIQUE("user_id","endpoint")
);
--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_action_type_check" CHECK (action IN ('BAN', 'UNBAN', 'RESOLVE_REPORT', 'DISMISS_REPORT'))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reported_user_id" text,
	"reported_message_id" text,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "report_target_type_check" CHECK (target_type IN ('USER', 'MESSAGE')),
	CONSTRAINT "report_status_check" CHECK (status IN ('PENDING', 'RESOLVED', 'DISMISSED')),
	CONSTRAINT "report_reason_length_check" CHECK (length(reason) >= 1 AND length(reason) <= 200),
	CONSTRAINT "report_details_length_check" CHECK (details IS NULL OR length(details) <= 1000),
	CONSTRAINT "report_target_shape_check" CHECK ((target_type = 'USER' AND reported_user_id IS NOT NULL AND reported_message_id IS NULL AND target_id = reported_user_id) OR (target_type = 'MESSAGE' AND reported_message_id IS NOT NULL AND reported_user_id IS NULL AND target_id = reported_message_id))
);
--> statement-breakpoint
ALTER TABLE "call_groups" ADD CONSTRAINT "call_groups_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_members" ADD CONSTRAINT "call_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_members" ADD CONSTRAINT "call_members_room_member_fk" FOREIGN KEY ("room_id","user_id") REFERENCES "room_members"("room_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_members" ADD CONSTRAINT "call_members_call_group_fk" FOREIGN KEY ("call_group_id","room_id") REFERENCES "call_groups"("id","room_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_members" ADD CONSTRAINT "call_members_open_call_fk" FOREIGN KEY ("call_group_id","call_state") REFERENCES "call_groups"("id","state") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_publish_slots" ADD CONSTRAINT "call_publish_slots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_publish_slots" ADD CONSTRAINT "call_publish_slots_active_member_fk" FOREIGN KEY ("call_group_id","user_id","is_call_active") REFERENCES "call_members"("call_group_id","user_id","active") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_restrictions" ADD CONSTRAINT "call_restrictions_call_group_id_call_groups_id_fk" FOREIGN KEY ("call_group_id") REFERENCES "call_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_restrictions" ADD CONSTRAINT "call_restrictions_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_restrictions" ADD CONSTRAINT "call_restrictions_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_lives" ADD CONSTRAINT "external_lives_configured_by_user_id_fk" FOREIGN KEY ("configured_by") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_lives" ADD CONSTRAINT "external_lives_call_group_fk" FOREIGN KEY ("call_group_id") REFERENCES "call_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_lives" ADD CONSTRAINT "external_lives_active_member_fk" FOREIGN KEY ("call_group_id","configured_by","is_call_active") REFERENCES "call_members"("call_group_id","user_id","active") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "outbox_notification_user_fk" FOREIGN KEY ("notification_id","user_id") REFERENCES "notifications"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_user_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_message_id_messages_id_fk" FOREIGN KEY ("reported_message_id") REFERENCES "messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_members_group_seat_active_idx" ON "call_members" USING btree ("call_group_id","seat_index") WHERE left_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "call_members_user_active_idx" ON "call_members" USING btree ("user_id") WHERE left_at IS NULL;