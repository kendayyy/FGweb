import type {NativePushSubscription} from './push-controller.js';
export function nativeSubscription(_subscription:PushSubscription):NativePushSubscription{throw new Error('Not implemented');}
export async function pushRequest(_path:string,_signal:AbortSignal,_method='GET',_body?:unknown):Promise<unknown>{return undefined;}
