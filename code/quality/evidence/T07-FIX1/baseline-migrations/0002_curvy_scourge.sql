CREATE TABLE "permission_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"user_id" text NOT NULL,
	"grantee_role" text DEFAULT 'HELPER' NOT NULL,
	"permission" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"granted_by" text NOT NULL,
	CONSTRAINT "room_user_permission_unique" UNIQUE("room_id","user_id","permission"),
	CONSTRAINT "permission_grantee_role_check" CHECK (grantee_role = 'HELPER'),
	CONSTRAINT "helper_permission_check" CHECK (permission IN ('MANAGE_CHAT', 'MANAGE_CALLS', 'MANAGE_RECRUITMENT', 'MANAGE_MEMBERS'))
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "room_member_room_user_unique" UNIQUE("room_id","user_id"),
	CONSTRAINT "room_members_room_user_role_unique" UNIQUE("room_id","user_id","role"),
	CONSTRAINT "room_member_role_check" CHECK (role IN ('OWNER', 'HELPER', 'MEMBER'))
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"game_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"owner_role" text DEFAULT 'OWNER' NOT NULL,
	"visibility" text DEFAULT 'PUBLIC' NOT NULL,
	"invite_policy" text DEFAULT 'OWNER_APPROVAL' NOT NULL,
	"player_capacity" integer DEFAULT 5 NOT NULL,
	"conversation_id" text NOT NULL,
	"conversation_kind" text DEFAULT 'ROOM' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_id_owner_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "rooms_id_game_unique" UNIQUE("id","game_id"),
	CONSTRAINT "rooms_id_capacity_unique" UNIQUE("id","player_capacity"),
	CONSTRAINT "rooms_conversation_id_unique" UNIQUE("conversation_id"),
	CONSTRAINT "room_owner_role_check" CHECK (owner_role = 'OWNER'),
	CONSTRAINT "room_visibility_check" CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
	CONSTRAINT "room_invite_policy_check" CHECK (invite_policy IN ('OWNER_APPROVAL', 'DIRECT_MEMBER')),
	CONSTRAINT "room_player_capacity_check" CHECK (player_capacity >= 1 AND player_capacity <= 10),
	CONSTRAINT "room_conversation_kind_check" CHECK (conversation_kind = 'ROOM')
);
--> statement-breakpoint
CREATE TABLE "active_play_slots" (
	"user_id" text PRIMARY KEY NOT NULL,
	"play_session_id" text NOT NULL,
	"session_state" text DEFAULT 'ACTIVE' NOT NULL,
	"slot_index" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "active_play_slot_state_check" CHECK (session_state = 'ACTIVE')
);
--> statement-breakpoint
CREATE TABLE "play_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"host_user_id" text NOT NULL,
	"player_capacity" integer DEFAULT 5 NOT NULL,
	"timing_type" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"state" text DEFAULT 'SCHEDULED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "play_sessions_id_room_unique" UNIQUE("id","room_id"),
	CONSTRAINT "play_sessions_id_state_unique" UNIQUE("id","state"),
	CONSTRAINT "play_sessions_id_capacity_unique" UNIQUE("id","player_capacity"),
	CONSTRAINT "play_session_state_check" CHECK (state IN ('SCHEDULED', 'ACTIVE', 'ENDED')),
	CONSTRAINT "play_session_timing_check" CHECK (timing_type IN ('now', 'scheduledAt')),
	CONSTRAINT "play_session_capacity_check" CHECK (player_capacity >= 1 AND player_capacity <= 10),
	CONSTRAINT "play_session_scheduled_at_check" CHECK ((timing_type = 'now' AND scheduled_at IS NULL) OR (timing_type = 'scheduledAt' AND scheduled_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"play_session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"slot_index" integer NOT NULL,
	"player_capacity" integer DEFAULT 5 NOT NULL,
	"is_host" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_session_user_unique" UNIQUE("play_session_id","user_id"),
	CONSTRAINT "team_member_session_slot_unique" UNIQUE("play_session_id","slot_index"),
	CONSTRAINT "team_members_session_user_slot_unique" UNIQUE("play_session_id","user_id","slot_index"),
	CONSTRAINT "slot_index_bounds_check" CHECK (slot_index >= 1 AND slot_index <= player_capacity)
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" text NOT NULL,
	"sender_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"room_id" text NOT NULL,
	"play_session_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_no_self_check" CHECK (sender_id <> receiver_id),
	CONSTRAINT "invitation_target_shape_check" CHECK ((target_type = 'ROOM' AND play_session_id IS NULL) OR (target_type = 'PLAY_SESSION' AND play_session_id IS NOT NULL)),
	CONSTRAINT "invitation_status_check" CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
	CONSTRAINT "invitation_target_type_check" CHECK (target_type IN ('ROOM', 'PLAY_SESSION'))
);
--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"recruitment_id" text NOT NULL,
	"applicant_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "join_request_recruitment_applicant_unique" UNIQUE("recruitment_id","applicant_id"),
	CONSTRAINT "join_request_status_check" CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "recruitments" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"game_id" text NOT NULL,
	"game_title" text NOT NULL,
	"play_session_id" text NOT NULL,
	"title" text NOT NULL,
	"mode" text NOT NULL,
	"player_capacity" integer DEFAULT 5 NOT NULL,
	"current_players" integer DEFAULT 1 NOT NULL,
	"timing_type" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"requirement_text" text,
	"experience_name" text,
	"experience_url" text,
	"state" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_capacity_check" CHECK (player_capacity >= 1 AND player_capacity <= 10),
	CONSTRAINT "recruitment_current_players_check" CHECK (current_players >= 1 AND current_players <= player_capacity),
	CONSTRAINT "recruitment_timing_check" CHECK (timing_type IN ('now', 'scheduledAt')),
	CONSTRAINT "recruitment_scheduled_at_check" CHECK ((timing_type = 'now' AND scheduled_at IS NULL) OR (timing_type = 'scheduledAt' AND scheduled_at IS NOT NULL)),
	CONSTRAINT "recruitment_roblox_fields_check" CHECK ((game_title = 'Roblox' AND experience_name IS NOT NULL AND length(trim(experience_name)) > 0 AND experience_url IS NOT NULL AND length(trim(experience_url)) > 0) OR (game_title <> 'Roblox' AND experience_name IS NULL AND experience_url IS NULL)),
	CONSTRAINT "recruitment_state_check" CHECK (state IN ('OPEN', 'CLOSED'))
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_id_title_unique" UNIQUE("id","title");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_id_kind_unique" UNIQUE("id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "room_members_one_owner_per_room_idx" ON "room_members" USING btree ("room_id") WHERE role = 'OWNER';--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_member_fk" FOREIGN KEY ("room_id","user_id","grantee_role") REFERENCES "room_members"("room_id","user_id","role") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_conversation_fk" FOREIGN KEY ("conversation_id","conversation_kind") REFERENCES "conversations"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_membership_fk" FOREIGN KEY ("id","owner_id","owner_role") REFERENCES "room_members"("room_id","user_id","role") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "active_play_slots" ADD CONSTRAINT "active_play_slots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_play_slots" ADD CONSTRAINT "active_play_slots_session_state_fk" FOREIGN KEY ("play_session_id","session_state") REFERENCES "play_sessions"("id","state") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_play_slots" ADD CONSTRAINT "active_play_slots_roster_fk" FOREIGN KEY ("play_session_id","user_id","slot_index") REFERENCES "team_members"("play_session_id","user_id","slot_index") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_host_user_id_user_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_play_session_id_play_sessions_id_fk" FOREIGN KEY ("play_session_id") REFERENCES "play_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_session_capacity_fk" FOREIGN KEY ("play_session_id","player_capacity") REFERENCES "play_sessions"("id","player_capacity") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_receiver_id_user_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_session_room_fk" FOREIGN KEY ("play_session_id","room_id") REFERENCES "play_sessions"("id","room_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_recruitment_id_recruitments_id_fk" FOREIGN KEY ("recruitment_id") REFERENCES "recruitments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_applicant_id_user_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitments" ADD CONSTRAINT "recruitments_room_game_fk" FOREIGN KEY ("room_id","game_id") REFERENCES "rooms"("id","game_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitments" ADD CONSTRAINT "recruitments_game_title_fk" FOREIGN KEY ("game_id","game_title") REFERENCES "games"("id","title") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitments" ADD CONSTRAINT "recruitments_play_session_fk" FOREIGN KEY ("play_session_id","room_id") REFERENCES "play_sessions"("id","room_id") ON DELETE no action ON UPDATE no action;