import {z} from 'zod';
import {FeedIdSchema,FeedPostSchema,FeedPostPageSchema,FeedCommentSchema,FeedCommentPageSchema,FeedLikeStateSchema,FeedUploadReceiptSchema,CreateFeedPostRequestSchema,UpdateFeedPostRequestSchema,CreateFeedCommentRequestSchema,UpdateFeedCommentRequestSchema,DeleteFeedContentRequestSchema,ListFeedPostsQuerySchema,ListFeedCommentsQuerySchema,type CreateFeedPostRequest,type UpdateFeedPostRequest,type CreateFeedCommentRequest,type ListFeedPostsQuery,type ListFeedCommentsQuery} from '@fg/contracts';
import {ActionApiError,pathId,requestJson,parsed} from '../moderation/request.js';

const endpoint='/api/v1/feed',ok=z.object({success:z.literal(true)}).strict();
const id=(value:string)=>pathId(FeedIdSchema.parse(value));
const query=(input:Record<string,unknown>)=>new URLSearchParams(Object.entries(input).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])).toString();
function matches(value:boolean){if(!value)throw new ActionApiError(0,true);}
export class FeedClient {
 async list(input:Partial<ListFeedPostsQuery>,signal:AbortSignal){const body=ListFeedPostsQuerySchema.parse(input);return requestJson(FeedPostPageSchema,endpoint+'/posts?'+query(body),signal);}
 async detail(postId:string,signal:AbortSignal){const row=await requestJson(FeedPostSchema,endpoint+'/posts/'+id(postId),signal);matches(row.id===postId);return row;}
 async create(input:CreateFeedPostRequest,signal:AbortSignal){const body=CreateFeedPostRequestSchema.parse(input),row=await requestJson(FeedPostSchema,endpoint+'/posts',signal,'POST',body);matches(row.body===body.body&&row.game.title===body.gameTitle&&row.type===body.type&&JSON.stringify(row.images.map(i=>i.id))===JSON.stringify(body.imageIds));return row;}
 async update(postId:string,input:UpdateFeedPostRequest,signal:AbortSignal){const body=UpdateFeedPostRequestSchema.parse(input),row=await requestJson(FeedPostSchema,endpoint+'/posts/'+id(postId),signal,'PATCH',body);matches(row.id===postId);if(body.body!==undefined)matches(row.body===body.body);if(body.gameTitle!==undefined)matches(row.game.title===body.gameTitle);if(body.type!==undefined)matches(row.type===body.type);if(body.imageIds!==undefined)matches(JSON.stringify(row.images.map(i=>i.id))===JSON.stringify(body.imageIds));return row;}
 async remove(postId:string,reason:string,signal:AbortSignal){return requestJson(ok,endpoint+'/posts/'+id(postId),signal,'DELETE',DeleteFeedContentRequestSchema.parse(reason?{reason}:{}));}
 async like(postId:string,liked:boolean,signal:AbortSignal){const row=await requestJson(FeedLikeStateSchema,endpoint+'/posts/'+id(postId)+'/like',signal,liked?'PUT':'DELETE',{});matches(row.postId===postId&&row.likedByMe===liked);return row;}
 async comments(postId:string,input:Partial<ListFeedCommentsQuery>,signal:AbortSignal){const body=ListFeedCommentsQuerySchema.parse(input),row=await requestJson(FeedCommentPageSchema,endpoint+'/posts/'+id(postId)+'/comments?'+query(body),signal);matches(row.postId===postId);return row;}
 async comment(postId:string,input:CreateFeedCommentRequest,signal:AbortSignal){const body=CreateFeedCommentRequestSchema.parse(input),row=await requestJson(FeedCommentSchema,endpoint+'/posts/'+id(postId)+'/comments',signal,'POST',body);matches(row.postId===postId&&row.parentCommentId===body.parentCommentId&&row.body===body.body);return row;}
 async updateComment(commentId:string,body:string,signal:AbortSignal){const input=UpdateFeedCommentRequestSchema.parse({body}),row=await requestJson(FeedCommentSchema,endpoint+'/comments/'+id(commentId),signal,'PATCH',input);matches(row.id===commentId&&row.body===input.body);return row;}
 async removeComment(commentId:string,reason:string,signal:AbortSignal){return requestJson(ok,endpoint+'/comments/'+id(commentId),signal,'DELETE',DeleteFeedContentRequestSchema.parse(reason?{reason}:{}));}
 async upload(file:File,signal:AbortSignal){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<1||file.size>5242880||!file.name||file.name.length>255)throw new ActionApiError(422);
  const form=new FormData();form.set('purpose','FEED_POST');form.set('file',file);
  let response:Response;try{response=await fetch('/api/v1/uploads/images',{method:'POST',body:form,signal,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});}catch(error){if(signal.aborted)throw error;throw new ActionApiError(0);}
  if(!response.ok)throw new ActionApiError(response.status);let value:unknown;try{value=await response.json();}catch{throw new ActionApiError(0,true);}if(signal.aborted)throw new DOMException('Request expired','AbortError');const row=parsed(FeedUploadReceiptSchema,value);matches(Date.parse(row.expiresAt)>Date.now());return row;
 }
}
