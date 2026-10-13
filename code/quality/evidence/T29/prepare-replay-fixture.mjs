import fs from 'node:fs';import assert from 'node:assert/strict';const p='quality/evidence/T29/headed-native-policy.mjs';let s=fs.readFileSync(p,'utf8');const edits=[
 ['const target=winners[0];await api','const target=winners[0],oldScreenGrant=await claim(target);await api'],
 ['await connect(target,joins[target]);','assert((await new TokenVerifier(env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET).verify(oldScreenGrant.token)).exp>Date.now()/1000);await connect(target,oldScreenGrant);'],
 ["await moderate('MUTE_MIC','viewer');","const oldMicGrant=await api('calls/'+call.id+'/join','viewer');await moderate('MUTE_MIC','viewer');"],
 ["await connect('viewer',joins.viewer);","assert((await new TokenVerifier(env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET).verify(oldMicGrant.token)).exp>Date.now()/1000);await connect('viewer',oldMicGrant);"],
 ["await moderate('KICK',loser);","const oldKickGrant=await claim(loser);await moderate('KICK',loser);assert((await new TokenVerifier(env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET).verify(oldKickGrant.token)).exp>Date.now()/1000);"],
 ['},joins[loser]);','},oldKickGrant);'],
 ];for(const [before,after]of edits){assert(s.includes(before),before);s=s.replace(before,after);}fs.writeFileSync(p,s);
