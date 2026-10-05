import path from 'node:path';
import {preview} from 'vite';
const port=Number(process.env.FG_T11_WEB_PORT);
const apiPort=Number(process.env.FG_T11_API_PORT);
if(!Number.isInteger(port)||!Number.isInteger(apiPort)||port<1024||apiPort<1024)throw new Error('Missing owned test ports');
await preview({root:path.resolve('apps/web'),configFile:path.resolve('apps/web/vite.config.ts'),preview:{host:'127.0.0.1',port,strictPort:true,proxy:{'/api':`http://127.0.0.1:${apiPort}`}}});
console.log(`Owned preview ready: ${port}`);
