import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
// Frozen T08 tests explicitly exercise the original local 5173 origin.
// Load services in memory and use that fixture origin without editing .env.local.
Object.assign(process.env,parseEnv(fs.readFileSync('.env.local','utf8')),{PUBLIC_ORIGIN:'http://localhost:5173',BETTER_AUTH_URL:'http://localhost:5173'});
const child=spawn(process.execPath,['--experimental-vm-modules','node_modules/jest/bin/jest.js','--config','apps/api/jest.config.js','--runInBand','apps/api/test/auth.integration.spec.ts'],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:'inherit'});
child.on('error',()=>{process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
