import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('apps/api/package.json'));
fs.mkdirSync('.cache', { recursive: true });
const rootDir = fs.mkdtempSync(path.resolve('.cache/jest-setup-'));
fs.writeFileSync(path.join(rootDir, 'compiler.spec.ts'), "test('TypeScript/Jest compiler setup', () => { const label: string = 'FG'; expect(label).toBe('FG'); });\n");
const config = { ...require(path.resolve('apps/api/jest.config.js')), rootDir,
  transform: { '^.+\\.(t|j)s$': [require.resolve('ts-jest'), { tsconfig: path.resolve('apps/api/tsconfig.json') }] },
  cacheDirectory: path.resolve('.cache/jest'), coverageDirectory: path.resolve('.cache/coverage/api') };
const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--config', JSON.stringify(config), '--runInBand'], { encoding: 'utf8', timeout: 30000 });
assert.equal(result.status, 0, result.stderr || 'Jest/ts-jest actual compilation failed');
console.log('PASS: Jest30/ts-jest actual TypeScript test compilation, project cache only');
