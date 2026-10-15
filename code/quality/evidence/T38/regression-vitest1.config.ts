import {defineConfig} from 'vitest/config';
import react from '../../../apps/web/node_modules/@vitejs/plugin-react/dist/index.js';
import path from 'node:path';
export default defineConfig({plugins:[react()],test:{environment:'jsdom',globals:true,setupFiles:[path.resolve('apps/web/test/setup.ts')],include:['quality/evidence/T38/regression-tests/rooms.test.tsx','quality/evidence/T38/regression-tests/call-controls.test.tsx']},resolve:{alias:{'@':path.resolve('apps/web/src')}}});
