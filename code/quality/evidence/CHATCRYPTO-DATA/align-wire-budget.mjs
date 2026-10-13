import fs from 'node:fs';
import assert from 'node:assert/strict';
const sourceFile='packages/database/src/crypto-envelope-validation.sql';let source=fs.readFileSync(sourceFile,'utf8');assert(source.includes('length(body)>24576'));source=source.replace('length(body)>24576','length(body)>131072');fs.writeFileSync(sourceFile,source);
const migration='packages/database/migrations/0009_outgoing_shatterstar.sql';let sql=fs.readFileSync(migration,'utf8');const end=sql.indexOf('END $$;')+7;assert(end>7);sql=source.trimEnd()+sql.slice(end);fs.writeFileSync(migration,sql);
console.log('Align ciphertext-only budget with rich encrypted content; image source policy unchanged.');
