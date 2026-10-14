export type DeliveryOutcome={status:'accepted'|'retryable'|'uncertain'|'gone'|'failed'};
export type PushTarget={endpoint:string;keys:{p256dh:string;auth:string}};
export type DeliveryPayload={title:string;body:string;url:string;tag:string};
export interface DeliveryWorkerOptions {databaseURL:string;redisURL:string;queueName?:string;autoPoll?:boolean;pollMs?:number;publicOrigin:string;push:{send:(target:PushTarget,payload:DeliveryPayload,id:string)=>Promise<DeliveryOutcome>};email:{send:(recipient:string,payload:DeliveryPayload,id:string)=>Promise<DeliveryOutcome>};}
/** T35 RED baseline: external delivery is not implemented. */
export class NotificationDeliveryWorker {
 readonly prefix='t35-red-baseline';constructor(private readonly options:DeliveryWorkerOptions){}
 async start(){} async schedule(){return 0;} async process(_id:string){return{status:'ignored'};} async close(){}
}
