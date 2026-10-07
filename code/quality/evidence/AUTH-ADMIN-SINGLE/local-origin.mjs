import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const url=new URL(env.BETTER_AUTH_URL||env.PUBLIC_ORIGIN);
assert(['localhost','127.0.0.1'].includes(url.hostname),'This run is local only');
assert.equal(url.protocol,'http:');
console.log(JSON.stringify({origin:url.origin,publicOrigin:env.PUBLIC_ORIGIN,apiPort:Number(env.PORT||3000),localOnly:true}));
