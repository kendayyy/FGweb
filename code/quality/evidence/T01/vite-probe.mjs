import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.resolve('apps/web/package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);

fs.mkdirSync('.cache', { recursive: true });
const root = fs.mkdtempSync(path.resolve('.cache/vite-setup-'));
fs.writeFileSync(path.join(root, 'index.html'), '<div id="root"></div><script type="module" src="/main.tsx"></script>');
fs.writeFileSync(path.join(root, 'main.tsx'), "import React from 'react'; import { createRoot } from 'react-dom/client'; import '@fontsource/inter/400.css'; createRoot(document.getElementById('root')!).render(<span>FG setup probe</span>);\n");
await build({ root, configFile: false, plugins: [react()], logLevel: 'error',
  resolve: { alias: Object.fromEntries(['react', 'react-dom', '@fontsource/inter'].map(name => [name, path.dirname(require.resolve(`${name}/package.json`))])) },
  build: { outDir: 'output' } });
assert.ok(fs.existsSync(path.join(root, 'output/index.html')));
assert.ok(fs.readdirSync(path.join(root, 'output/assets')).some(name => name.endsWith('.woff2')));
console.log('PASS: Vite/React/Inter TypeScript build in project cache (not product UI)');
