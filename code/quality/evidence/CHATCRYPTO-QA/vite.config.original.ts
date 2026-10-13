import { defineConfig, loadEnv } from 'vite';
import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({mode})=>{
  // Read only the public origin. Keep private local credentials out of config
  // values sent to the browser and bind dev/preview to the same OAuth origin.
  const env=loadEnv(mode,fileURLToPath(new URL('../../',import.meta.url)),['PUBLIC_ORIGIN']);
  const port=Number(new URL(env.PUBLIC_ORIGIN||'http://localhost:5173').port||5173);
  return {
  build: { target: 'es2022' },
  plugins: [react(), tailwindcss()],
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
