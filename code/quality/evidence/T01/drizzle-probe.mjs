import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

fs.mkdirSync('.cache', { recursive: true });
const dir = fs.mkdtempSync(path.resolve('.cache/drizzle-setup-'));
fs.writeFileSync(path.join(dir, 'schema.ts'), "import { pgTable, text } from 'drizzle-orm/pg-core';\nexport const setupProbe = pgTable('_fg_setup_probe', { id: text('id').primaryKey() });\n");
const output = path.join(dir, 'output');
const config = path.join(dir, 'drizzle.config.ts');
fs.writeFileSync(config, `import { defineConfig } from 'drizzle-kit';\nexport default defineConfig(${JSON.stringify({ dialect: 'postgresql', schema: path.join(dir, 'schema.ts').replaceAll('\\', '/'), out: output.replaceAll('\\', '/') })});\n`);
const result = spawnSync(process.execPath, [path.resolve('node_modules/drizzle-kit/bin.cjs'), 'generate', '--config', config], { encoding: 'utf8', timeout: 30000 });
assert.equal(result.status, 0, result.stderr || 'Drizzle configuration/schema compilation failed');
const sql = fs.readdirSync(output).filter(name => name.endsWith('.sql'));
assert.equal(sql.length, 1);
assert.match(fs.readFileSync(path.join(output, sql[0]), 'utf8'), /CREATE TABLE "_fg_setup_probe"/);
console.log('PASS: Drizzle TypeScript config/schema compilation and SQL generation with patched esbuild; no database migration applied');
