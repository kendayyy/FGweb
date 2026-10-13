import base from '../../../apps/web/vite.config.ts';
import {fgSecurityHeadersPlugin} from '../../../tests/security/chat-crypto/security-headers-proposed.mjs';
import {fileURLToPath} from 'node:url';
export default async environment=>{
  const config=typeof base==='function'?await base(environment):base;
  return {...config,cacheDir:fileURLToPath(new URL('../../../.cache/chatcrypto-qa/vite',import.meta.url)),plugins:[...config.plugins,fgSecurityHeadersPlugin()]};
};
