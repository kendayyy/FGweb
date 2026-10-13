import {execFileSync} from 'node:child_process';
import path from 'node:path';
execFileSync('docker',['compose','-f','infra/chat-crypto/local.compose.yml','config','--quiet'],{env:{...process.env,FG_BAO_LOCAL_DIR:path.resolve('.runtime/chatcrypto-setup/operator-local')},stdio:'pipe'});
console.log('Local isolated compose syntax passed; no main service started.');
