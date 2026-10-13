import {spawnSync} from 'node:child_process';
const tasks=[
 ['assets','quality/evidence/GAME-LOGO-FE/asset-checks.mjs'],
 ['web-types','node_modules/typescript/bin/tsc','--noEmit','-p','apps/web/tsconfig.json'],
 ['test-types','node_modules/typescript/bin/tsc','--noEmit','-p','quality/evidence/GAME-LOGO-FE/test-types.json'],
 ['unit','node_modules/vitest/vitest.mjs','run','--root','apps/web','test/game-logos.test.tsx','test/lobby.test.tsx','--maxWorkers=1'],
 ['lint','node_modules/eslint/bin/eslint.js','apps/web/src/components/ui/GameLogo.tsx','apps/web/src/components/ui/FGLogo.tsx','apps/web/src/features/lobby/LobbyPage.tsx','apps/web/src/App.tsx','apps/web/src/features/auth/AuthFields.tsx','apps/web/src/features/onboarding/OnboardingForm.tsx','apps/web/src/features/profiles/ProfileEditor.tsx','apps/web/src/features/profiles/ProfilePage.tsx','apps/web/test/game-logos.test.tsx','apps/web/test/lobby.test.tsx','tests/e2e/game-logos.spec.ts','quality/evidence/GAME-LOGO-FE'],
];
const results=[];for(const [label,...args]of tasks){const result=spawnSync(process.execPath,['quality/evidence/GAME-LOGO-FE/record.mjs',`final-${label}-1`,process.execPath,...args],{cwd:process.cwd(),stdio:'inherit',windowsHide:true});results.push({label,exitCode:result.status});}
console.log(JSON.stringify(results));process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
