import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {AuthEmailSchema,AuthPasswordSchema,IdSchema} from '@fg/contracts';

export function loadAdminConfig(){
 const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
 if(path.resolve(process.cwd())!==root)throw new Error('Run from FG code directory');
 const app=parseEnv(fs.readFileSync('.env.local','utf8')),input=parseEnv(fs.readFileSync('.runtime/auth-admin/admin-input.env','utf8'));
 const userId=input.FG_ADMIN_USER_ID??'',email=input.FG_ADMIN_EMAIL??'',password=input.FG_ADMIN_INITIAL_PASSWORD??'';
 const fixedIdValid=IdSchema.safeParse(userId).success&&!/[\s,]/.test(userId);
 const binding=app.ADMIN_USER_IDS?.trim();
 const checks={fixedIdValid,emailValid:AuthEmailSchema.safeParse(email).success,passwordValid:AuthPasswordSchema.safeParse(password).success,appBindingCompatible:!binding||binding===userId};
 if(Object.values(checks).some(value=>!value))return {checks,ready:false};
 return {checks,ready:true,app,input:{userId,email,password}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const config=loadAdminConfig();console.log(JSON.stringify({ready:config.ready,...config.checks}));process.exitCode=config.ready?0:1;}
 catch{console.error('Cannot read safe local admin input; no configuration was changed.');process.exitCode=1;}
}
