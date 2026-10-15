import {z} from 'zod';
import {IdSchema,IsoDateTimeSchema,GameTitleSchema} from './common.js';
import {UploadImageRequestSchema,ImageContentSchema} from './uploads.js';
import type {ApiEndpointDefinition} from './index.js';

export const FeedIdSchema=IdSchema.refine(value=>value===value.trim()&&Array.from(value).length<=128&&!Array.from(value).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127),'Invalid Feed identity');
export const FeedPostTypeSchema=z.enum(['FIND_PLAYMATES','SHARE','DISCUSSION']);
const plain=(maximum:number)=>z.string().trim().min(1).refine(value=>Array.from(value).length<=maximum,'Feed text is too long');
export const FeedPostBodySchema=plain(5000),FeedCommentBodySchema=plain(1000);
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),cursor=z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/);
const imageIds=z.array(FeedIdSchema).max(4).refine(ids=>new Set(ids).size===ids.length,'Duplicate staged image');
export const CreateFeedPostRequestSchema=z.object({clientPostId:FeedIdSchema,gameTitle:GameTitleSchema,type:FeedPostTypeSchema,body:FeedPostBodySchema,imageIds:imageIds.default([])}).strict();
export const UpdateFeedPostRequestSchema=z.object({gameTitle:GameTitleSchema.optional(),type:FeedPostTypeSchema.optional(),body:FeedPostBodySchema.optional(),imageIds:imageIds.optional()}).strict().refine(value=>Object.values(value).some(item=>item!==undefined),'No editable fields supplied');
export const CreateFeedCommentRequestSchema=z.object({clientCommentId:FeedIdSchema,body:FeedCommentBodySchema,parentCommentId:FeedIdSchema.nullable().default(null)}).strict();
export const UpdateFeedCommentRequestSchema=z.object({body:FeedCommentBodySchema}).strict();
export const DeleteFeedContentRequestSchema=z.object({reason:plain(300).optional()}).strict();
export const FeedPublicAuthorSchema=z.object({id:FeedIdSchema,displayName:z.string().min(1).max(50),avatarUrl:z.string().url().nullable()}).strict();
export const FeedPublicGameSchema=z.object({id:FeedIdSchema,title:GameTitleSchema}).strict();
export const FeedImageSchema=z.object({id:FeedIdSchema,url:z.string().min(1).max(2048),fileSize:z.number().int().min(1).max(5242880),mimeType:z.literal('image/webp')}).strict().refine(value=>value.url==='/api/v1/feed/images/'+encodeURIComponent(value.id)+'/content','Noncanonical Feed image path');
export const FeedPostSchema=z.object({id:FeedIdSchema,author:FeedPublicAuthorSchema,game:FeedPublicGameSchema,type:FeedPostTypeSchema,body:FeedPostBodySchema,images:z.array(FeedImageSchema).max(4),likeCount:count,commentCount:count,likedByMe:z.boolean(),createdAt:IsoDateTimeSchema,updatedAt:IsoDateTimeSchema}).strict().refine(value=>Date.parse(value.updatedAt)>=Date.parse(value.createdAt)&&new Set(value.images.map(image=>image.id)).size===value.images.length,'Incoherent Feed post');
export const FeedCommentSchema=z.object({id:FeedIdSchema,postId:FeedIdSchema,parentCommentId:FeedIdSchema.nullable(),author:FeedPublicAuthorSchema,body:FeedCommentBodySchema.nullable(),deletedAt:IsoDateTimeSchema.nullable(),createdAt:IsoDateTimeSchema,updatedAt:IsoDateTimeSchema}).strict().refine(value=>value.parentCommentId!==value.id&&Date.parse(value.updatedAt)>=Date.parse(value.createdAt)&&(value.deletedAt===null?value.body!==null:value.body===null&&Date.parse(value.deletedAt)>=Date.parse(value.createdAt)),'Incoherent Feed comment/tombstone');
export const FeedLikeStateSchema=z.object({postId:FeedIdSchema,likeCount:count,likedByMe:z.boolean()}).strict();
export const ListFeedPostsQuerySchema=z.object({gameTitle:GameTitleSchema.optional(),type:FeedPostTypeSchema.optional(),limit:z.coerce.number().int().min(1).max(50).default(20),cursor:cursor.optional()}).strict();
export const ListFeedCommentsQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(50).default(20),cursor:cursor.optional()}).strict();
export const FeedPostCursorPayloadSchema=z.object({createdAt:IsoDateTimeSchema,id:FeedIdSchema,gameTitle:GameTitleSchema.optional(),type:FeedPostTypeSchema.optional()}).strict();
export const FeedCommentCursorPayloadSchema=z.object({postId:FeedIdSchema,createdAt:IsoDateTimeSchema,id:FeedIdSchema}).strict();
const coherentPage=(value:{items:{id:string}[];hasMore:boolean;nextCursor:string|null})=>new Set(value.items.map(item=>item.id)).size===value.items.length&&(value.hasMore?value.items.length>0&&value.nextCursor!==null:value.nextCursor===null);
export const FeedPostPageSchema=z.object({items:z.array(FeedPostSchema).max(50),hasMore:z.boolean(),nextCursor:cursor.nullable()}).strict().refine(coherentPage,'Incoherent Feed page');
export const FeedCommentPageSchema=z.object({postId:FeedIdSchema,items:z.array(FeedCommentSchema).max(50),hasMore:z.boolean(),nextCursor:cursor.nullable()}).strict().refine(value=>coherentPage(value)&&value.items.every(comment=>comment.postId===value.postId),'Mixed Feed comment page');
export const FeedUploadImageRequestSchema=z.object({purpose:z.literal('FEED_POST'),file:UploadImageRequestSchema.shape.file}).strict();
export const FeedUploadReceiptSchema=z.object({id:FeedIdSchema,purpose:z.literal('FEED_POST'),fileSize:z.number().int().min(1).max(5242880),mimeType:z.literal('image/webp'),expiresAt:IsoDateTimeSchema}).strict();
const empty=z.object({}).strict(),success=z.object({success:z.literal(true)}).strict();
export const FeedApiEndpointRegistry:ApiEndpointDefinition[]=[
 {method:'GET',path:'/api/v1/feed/posts',auth:'Public',requestSchema:ListFeedPostsQuerySchema,responseSchema:FeedPostPageSchema},
 {method:'POST',path:'/api/v1/feed/posts',auth:'Authenticated',requestSchema:CreateFeedPostRequestSchema,responseSchema:FeedPostSchema},
 {method:'GET',path:'/api/v1/feed/posts/:id',auth:'Public',responseSchema:FeedPostSchema},
 {method:'PATCH',path:'/api/v1/feed/posts/:id',auth:'FeedContentAuthor',requestSchema:UpdateFeedPostRequestSchema,responseSchema:FeedPostSchema},
 {method:'DELETE',path:'/api/v1/feed/posts/:id',auth:'FeedContentAuthorOrAdmin',requestSchema:DeleteFeedContentRequestSchema,responseSchema:success},
 {method:'PUT',path:'/api/v1/feed/posts/:id/like',auth:'Authenticated',requestSchema:empty,responseSchema:FeedLikeStateSchema},
 {method:'DELETE',path:'/api/v1/feed/posts/:id/like',auth:'Authenticated',requestSchema:empty,responseSchema:FeedLikeStateSchema},
 {method:'GET',path:'/api/v1/feed/posts/:id/comments',auth:'Public',requestSchema:ListFeedCommentsQuerySchema,responseSchema:FeedCommentPageSchema},
 {method:'POST',path:'/api/v1/feed/posts/:id/comments',auth:'Authenticated',requestSchema:CreateFeedCommentRequestSchema,responseSchema:FeedCommentSchema},
 {method:'PATCH',path:'/api/v1/feed/comments/:id',auth:'FeedContentAuthor',requestSchema:UpdateFeedCommentRequestSchema,responseSchema:FeedCommentSchema},
 {method:'DELETE',path:'/api/v1/feed/comments/:id',auth:'FeedContentAuthorOrAdmin',requestSchema:DeleteFeedContentRequestSchema,responseSchema:success},
 {method:'GET',path:'/api/v1/feed/images/:id/content',auth:'Public',responseSchema:ImageContentSchema,responseFormat:'binary'},
];
export type FeedPostType=z.infer<typeof FeedPostTypeSchema>;
export type FeedPostDTO=z.infer<typeof FeedPostSchema>;
export type FeedCommentDTO=z.infer<typeof FeedCommentSchema>;
export type FeedImageDTO=z.infer<typeof FeedImageSchema>;
export type FeedLikeState=z.infer<typeof FeedLikeStateSchema>;
export type CreateFeedPostRequest=z.infer<typeof CreateFeedPostRequestSchema>;
export type UpdateFeedPostRequest=z.infer<typeof UpdateFeedPostRequestSchema>;
export type CreateFeedCommentRequest=z.infer<typeof CreateFeedCommentRequestSchema>;
export type UpdateFeedCommentRequest=z.infer<typeof UpdateFeedCommentRequestSchema>;
export type DeleteFeedContentRequest=z.infer<typeof DeleteFeedContentRequestSchema>;
export type ListFeedPostsQuery=z.infer<typeof ListFeedPostsQuerySchema>;
export type ListFeedCommentsQuery=z.infer<typeof ListFeedCommentsQuerySchema>;
export type FeedPostCursorPayload=z.infer<typeof FeedPostCursorPayloadSchema>;
export type FeedCommentCursorPayload=z.infer<typeof FeedCommentCursorPayloadSchema>;
export type FeedPostPage=z.infer<typeof FeedPostPageSchema>;
export type FeedCommentPage=z.infer<typeof FeedCommentPageSchema>;
export type FeedUploadReceipt=z.infer<typeof FeedUploadReceiptSchema>;
export type FeedUploadImageRequest=z.infer<typeof FeedUploadImageRequestSchema>;
export type FeedPublicAuthor=z.infer<typeof FeedPublicAuthorSchema>;
export type FeedPublicGame=z.infer<typeof FeedPublicGameSchema>;
