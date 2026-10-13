import {build} from 'vite';import path from 'node:path';
await build({configFile:false,root:path.resolve('quality/evidence/T32/provider-https-src'),build:{target:'es2022',outDir:path.resolve('quality/evidence/T32/provider-https-build2'),emptyOutDir:false}});
