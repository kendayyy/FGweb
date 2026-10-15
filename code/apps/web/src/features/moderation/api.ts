import {CreateReportRequestSchema,DeleteMessageRequestSchema,ReportSchema,IdSchema,type CreateReportRequest} from '@fg/contracts';import {z} from 'zod';import {ActionApiError,pathId,requestJson} from './request.js';
export async function createReport(actorId:string,input:CreateReportRequest,signal:AbortSignal){
 IdSchema.parse(actorId);const body=CreateReportRequestSchema.strict().parse({...input,reason:input.reason.trim()});if(!body.reason)throw new ActionApiError(422);pathId(body.targetId);
 const row=await requestJson(ReportSchema,'/api/v1/reports',signal,'POST',body);if(row.reporterId!==actorId||row.targetId!==body.targetId||row.targetType!==body.targetType||row.reason!==body.reason)throw new ActionApiError(0,true);return row;
}
export async function deleteMessage(conversationId:string,messageId:string,reason:string,signal:AbortSignal){const body=DeleteMessageRequestSchema.parse({reason});await requestJson(z.object({success:z.literal(true)}).strict(),'/api/v1/conversations/'+pathId(conversationId)+'/messages/'+pathId(messageId),signal,'DELETE',body);}
