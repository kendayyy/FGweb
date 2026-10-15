import {pgTable,text,timestamp,integer,primaryKey,unique,index,check,foreignKey} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {user} from './auth.js';import {games} from './games.js';
const utc=(name:string)=>timestamp(name,{withTimezone:true,mode:'date'});
export const feedPosts=pgTable('feed_posts',{
 id:text('id').primaryKey(),authorId:text('author_id').notNull().references(()=>user.id,{onDelete:'restrict'}),gameId:text('game_id').notNull().references(()=>games.id,{onDelete:'restrict'}),type:text('type').notNull(),body:text('body').notNull(),clientPostId:text('client_post_id').notNull(),createdAt:utc('created_at').notNull().defaultNow(),updatedAt:utc('updated_at').notNull().defaultNow(),deletedAt:utc('deleted_at'),
},t=>[
 unique('feed_post_author_identity_unique').on(t.id,t.authorId),unique('feed_post_client_identity_unique').on(t.authorId,t.clientPostId),
 check('feed_post_type_check',sql`${t.type} IN ('FIND_PLAYMATES','SHARE','DISCUSSION')`),check('feed_post_body_check',sql`char_length(btrim(${t.body})) BETWEEN 1 AND 5000 AND ${t.body}=btrim(${t.body})`),check('feed_post_retry_check',sql`char_length(${t.clientPostId}) BETWEEN 1 AND 128 AND ${t.clientPostId}=btrim(${t.clientPostId})`),check('feed_post_clock_check',sql`${t.updatedAt}>=${t.createdAt} AND (${t.deletedAt} IS NULL OR ${t.deletedAt}>=${t.createdAt})`),
 index('feed_post_cursor_idx').on(t.createdAt,t.id).where(sql`${t.deletedAt} IS NULL`),index('feed_post_game_cursor_idx').on(t.gameId,t.createdAt,t.id).where(sql`${t.deletedAt} IS NULL`),index('feed_post_type_cursor_idx').on(t.type,t.createdAt,t.id).where(sql`${t.deletedAt} IS NULL`),index('feed_post_game_type_cursor_idx').on(t.gameId,t.type,t.createdAt,t.id).where(sql`${t.deletedAt} IS NULL`),
]);
export const feedPostImages=pgTable('feed_post_images',{
 id:text('id').primaryKey(),postId:text('post_id').notNull(),uploaderId:text('uploader_id').notNull(),position:integer('position').notNull(),fileName:text('file_name').notNull(),fileSize:integer('file_size').notNull(),mimeType:text('mime_type').notNull(),createdAt:utc('created_at').notNull().defaultNow(),
},t=>[
 foreignKey({name:'feed_image_post_author_fk',columns:[t.postId,t.uploaderId],foreignColumns:[feedPosts.id,feedPosts.authorId]}).onDelete('restrict'),unique('feed_image_position_unique').on(t.postId,t.position),check('feed_image_position_check',sql`${t.position} BETWEEN 0 AND 3`),check('feed_image_size_check',sql`${t.fileSize} BETWEEN 1 AND 5242880`),check('feed_image_mime_check',sql`${t.mimeType}='image/webp'`),check('feed_image_filename_check',sql`char_length(${t.fileName}) BETWEEN 1 AND 255 AND position('/' in ${t.fileName})=0 AND position(chr(92) in ${t.fileName})=0`),
]);
export const feedLikes=pgTable('feed_likes',{
 postId:text('post_id').notNull().references(()=>feedPosts.id,{onDelete:'restrict'}),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'restrict'}),createdAt:utc('created_at').notNull().defaultNow(),
},t=>[primaryKey({name:'feed_likes_pkey',columns:[t.postId,t.userId]}),index('feed_like_user_idx').on(t.userId,t.postId)]);
export const feedComments=pgTable('feed_comments',{
 id:text('id').primaryKey(),postId:text('post_id').notNull().references(()=>feedPosts.id,{onDelete:'restrict'}),authorId:text('author_id').notNull().references(()=>user.id,{onDelete:'restrict'}),parentCommentId:text('parent_comment_id'),body:text('body').notNull(),clientCommentId:text('client_comment_id').notNull(),createdAt:utc('created_at').notNull().defaultNow(),updatedAt:utc('updated_at').notNull().defaultNow(),deletedAt:utc('deleted_at'),
},t=>[
 unique('feed_comment_post_identity_unique').on(t.postId,t.id),unique('feed_comment_client_identity_unique').on(t.authorId,t.postId,t.clientCommentId),foreignKey({name:'feed_comment_same_post_parent_fk',columns:[t.postId,t.parentCommentId],foreignColumns:[t.postId,t.id]}).onDelete('restrict'),check('feed_comment_parent_check',sql`${t.parentCommentId} IS NULL OR ${t.parentCommentId}<>${t.id}`),check('feed_comment_body_check',sql`char_length(btrim(${t.body})) BETWEEN 1 AND 1000 AND ${t.body}=btrim(${t.body})`),check('feed_comment_retry_check',sql`char_length(${t.clientCommentId}) BETWEEN 1 AND 128 AND ${t.clientCommentId}=btrim(${t.clientCommentId})`),check('feed_comment_clock_check',sql`${t.updatedAt}>=${t.createdAt} AND (${t.deletedAt} IS NULL OR ${t.deletedAt}>=${t.createdAt})`),index('feed_comment_cursor_idx').on(t.postId,t.createdAt,t.id),index('feed_comment_parent_cursor_idx').on(t.postId,t.parentCommentId,t.createdAt,t.id),
]);
