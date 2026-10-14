import { pgTable, text, integer, timestamp, unique, uniqueIndex, check, foreignKey, AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import { games } from './games.js';
import { conversations } from './conversations.js';

export const roomMembers = pgTable(
  'room_members',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references((): AnyPgColumn => rooms.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('MEMBER'),
    joinedAt: timestamp('joined_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('room_member_room_user_unique').on(table.roomId, table.userId),
    unique('room_members_room_user_role_unique').on(table.roomId, table.userId, table.role),
    uniqueIndex('room_members_one_owner_per_room_idx').on(table.roomId).where(sql`role = 'OWNER'`),
    check('room_member_role_check', sql`role IN ('OWNER', 'HELPER', 'MEMBER')`),
  ]
);

export const rooms = pgTable(
  'rooms',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ownerRole: text('owner_role').notNull().default('OWNER'),
    visibility: text('visibility').notNull().default('PUBLIC'),
    invitePolicy: text('invite_policy').notNull().default('OWNER_APPROVAL'),
    playerCapacity: integer('player_capacity').notNull().default(5),
    conversationId: text('conversation_id').notNull(),
    conversationKind: text('conversation_kind').notNull().default('ROOM'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('rooms_id_owner_unique').on(table.id, table.ownerId),
    unique('rooms_id_game_unique').on(table.id, table.gameId),
    unique('rooms_id_capacity_unique').on(table.id, table.playerCapacity),
    unique('rooms_conversation_id_unique').on(table.conversationId),
    check('room_owner_role_check', sql`owner_role = 'OWNER'`),
    check('room_visibility_check', sql`visibility IN ('PUBLIC', 'PRIVATE')`),
    check('room_invite_policy_check', sql`invite_policy IN ('OWNER_APPROVAL', 'DIRECT_MEMBER')`),
    check('room_player_capacity_check', sql`player_capacity >= 1 AND player_capacity <= 10`),
    check('room_conversation_kind_check', sql`conversation_kind = 'ROOM'`),
    foreignKey({
      name: 'rooms_conversation_fk',
      columns: [table.conversationId, table.conversationKind],
      foreignColumns: [conversations.id, conversations.kind],
    }).onDelete('cascade'),
    foreignKey({
      name: 'rooms_owner_membership_fk',
      columns: [table.id, table.ownerId, table.ownerRole],
      foreignColumns: [roomMembers.roomId, roomMembers.userId, roomMembers.role],
    }),
  ]
);

export const permissionGrants = pgTable(
  'permission_grants',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    granteeRole: text('grantee_role').notNull().default('HELPER'),
    permission: text('permission').notNull(),
    grantedAt: timestamp('granted_at', { mode: 'date' }).notNull().defaultNow(),
    grantedBy: text('granted_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    unique('room_user_permission_unique').on(table.roomId, table.userId, table.permission),
    check('permission_grantee_role_check', sql`grantee_role = 'HELPER'`),
    check(
      'helper_permission_check',
      sql`permission IN ('MANAGE_CHAT', 'MANAGE_CALLS', 'MANAGE_RECRUITMENT', 'MANAGE_MEMBERS')`
    ),
    foreignKey({
      name: 'permission_grants_room_id_rooms_id_fk',
      columns: [table.roomId],
      foreignColumns: [rooms.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'permission_grants_member_fk',
      columns: [table.roomId, table.userId, table.granteeRole],
      foreignColumns: [roomMembers.roomId, roomMembers.userId, roomMembers.role],
    }).onDelete('cascade'),
  ]
);
