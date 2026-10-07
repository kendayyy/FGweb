import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-BE';
for(const args of [
 ['native-3','node','--env-file=.env.local',`${dir}/native-probe.mjs`],
 ['regression-2','node','--env-file=.env.local','--experimental-vm-modules','node_modules/jest/bin/jest.js','--config','apps/api/jest.config.js','--runInBand'],
 ['test-types-4','node','node_modules/typescript/bin/tsc','-p',`${dir}/test-types.json`,'--noEmit'],
 ['lint-2','node','node_modules/eslint/bin/eslint.js','apps/api/src/modules/auth','apps/api/src/modules/profiles/profiles.service.ts','apps/api/test/auth-email.integration.spec.ts','apps/api/test/auth.integration.spec.ts',dir],
 ['audit-1','node',`${dir}/audit.mjs`],
 ['diff-1','git','diff','--check'],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit',cwd:process.cwd()});
