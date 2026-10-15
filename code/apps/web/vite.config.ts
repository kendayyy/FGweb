import {fgSecurityHeadersPlugin} from './security-headers.mjs';
import { defineConfig, loadEnv } from 'vite';
import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({mode})=>{
  // Read only public browser connection origins. Keep private credentials out of config
  // values sent to the browser and bind dev/preview to the same OAuth origin.
  const env=loadEnv(mode,fileURLToPath(new URL('../../',import.meta.url)),['PUBLIC_ORIGIN','LIVEKIT_URL']);
  const port=Number(new URL(env.PUBLIC_ORIGIN||'http://localhost:5173').port||5173);
  const workerBuildId=createHash('sha256');
  for(const file of ['sw.ts','cache-runtime.ts','worker-policy.ts'])workerBuildId.update(readFileSync(new URL('./src/pwa/'+file,import.meta.url)));
  return {
  define:{__FG_SW_BUILD_ID__:JSON.stringify(workerBuildId.digest('hex'))},
  build: { target: 'es2022' },
  plugins: [react(), tailwindcss(), VitePWA({strategies:'injectManifest',srcDir:'src/pwa',filename:'sw.ts',injectRegister:false,manifest:false,includeAssets:[],injectManifest:{globPatterns:['index.html','assets/**/*.{js,css,woff2,wasm,png,svg,webp}','brand/{icon,maskable}-{192,512}.png','favicon.svg','favicon.ico','apple-touch-icon.png'],maximumFileSizeToCacheInBytes:8*1024*1024},devOptions:{enabled:false}}), fgSecurityHeadersPlugin([new URL(env.PUBLIC_ORIGIN||'http://localhost:5173').origin,...(env.LIVEKIT_URL?[new URL(env.LIVEKIT_URL).origin]:[])])],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '127.0.0.1', port, strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
  preview:{port,strictPort:true},
  };
});
