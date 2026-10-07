import assert from 'node:assert/strict';
import {loadAdminConfig} from '../../../scripts/check-admin-config.mjs';
const config=loadAdminConfig();assert(config.ready);assert(!config.app.ADMIN_USER_IDS,'Reproduce only before server activation');
try{
 const origin='http://localhost:18080';
 const response=await fetch(`${origin}/api/auth/fg/sign-in/admin`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'kingame',password:config.input.password})});
 const body=await response.json();
 const code=typeof body.code==='string'&&/^[A-Z_]{1,64}$/.test(body.code)?body.code:'omitted';
 console.log(JSON.stringify({nativeAliasStatus:response.status,errorCode:code,serverBindingConfigured:false,privateValuesLogged:false}));
 assert.equal(response.status,401,'Missing sole configuration must reject the reserved alias');assert.equal(code,'INVALID_EMAIL_OR_PASSWORD');
}catch{console.error('Alias pre-activation reproduction did not match; private details omitted.');process.exitCode=1;}
