import assert from 'node:assert/strict';import {SignalRequest,UpdateSubscription} from '@livekit/protocol';
import {pendingFramesSnapshot,decodePendingFrames} from './antigravity-native58-pending-frames-1/failure-observer.mjs';
const data=Array.from(new SignalRequest({message:{case:'subscription',value:new UpdateSubscription({subscribe:true,trackSids:['TR_ControlNewVideo']})}}).toBinary());
globalThis.window={t30SubscriptionFrames:Array.from({length:257},()=>({at:Date.now(),data}))};
const snapshot=pendingFramesSnapshot(),decoded=decodePendingFrames(snapshot,'viewer');
assert.equal(decoded.health.observationComplete,false,'A truncated 257-frame browser queue must not be called complete');
