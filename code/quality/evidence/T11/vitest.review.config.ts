import {defineConfig} from 'vitest/config';
import react from '../../../apps/web/node_modules/@vitejs/plugin-react/dist/index.js';
export default defineConfig({root:'apps/web',plugins:[react()],test:{environment:'jsdom',globals:true,setupFiles:['./test/setup.ts'],include:['../../quality/evidence/T11/codex-review.test.tsx']}});
