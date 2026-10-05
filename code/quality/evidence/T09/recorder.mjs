import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const evidenceDir = path.resolve('quality/evidence/T09');

const commandsToRun = [
  {
    name: 'source_test_typecheck',
    command: 'node node_modules/typescript/bin/tsc -p quality/evidence/T09/tsconfig.check.json',
    logFile: 'loop2-typecheck.txt',
  },
  {
    name: 'original_acceptance_test',
    command: 'npm run test --workspace @fg/web -- test/auth.test.tsx',
    logFile: 'loop2-acceptance.txt',
  },
  {
    name: 'all_web_tests',
    command: 'npm run test --workspace @fg/web',
    logFile: 'loop2-all-tests.txt',
  },
  {
    name: 'web_build',
    command: 'npm run build --workspace @fg/web',
    logFile: 'loop2-build.txt',
  },
  {
    name: 'workspace_lint',
    command: 'npm run lint',
    logFile: 'loop2-lint.txt',
  },
  {
    name: 'redirect_security_regression',
    command: 'node quality/evidence/T09/codex-redirect-regression.mjs',
    logFile: 'loop2-redirect.txt',
  },
  {
    name: 'git_diff_check',
    command: 'git diff --check',
    logFile: 'loop2-diff.txt',
  },
  {
    name: 'real_api_browser_harness',
    command: 'node --env-file=.env.local quality/evidence/T09/run-real-api-harness.mjs',
    logFile: 'loop2-api-harness.txt',
  },
];

const targetFiles = [
  'apps/web/src/styles/tokens.css',
  'apps/web/src/styles/global.css',
  'apps/web/src/components/ui/Button.tsx',
  'apps/web/src/components/ui/Card.tsx',
  'apps/web/src/components/ui/Spinner.tsx',
  'apps/web/src/components/ui/Alert.tsx',
  'apps/web/src/features/auth/utils.ts',
  'apps/web/src/features/auth/lifecycle.ts',
  'apps/web/src/features/auth/api.ts',
  'apps/web/src/features/auth/AuthProvider.tsx',
  'apps/web/src/features/auth/ProtectedRoute.tsx',
  'apps/web/src/features/auth/LoginForm.tsx',
  'apps/web/src/features/auth/HeaderAuthWidget.tsx',
  'apps/web/src/features/auth/index.ts',
  'apps/web/src/App.tsx',
  'apps/web/src/main.tsx',
  'apps/web/index.html',
  'apps/web/vitest.config.ts',
  'apps/web/test/setup.ts',
  'apps/web/test/auth.test.tsx',
  'quality/evidence/T09/run-real-api-harness.mjs',
];

async function main() {
  console.log('Starting T09 Loop 2 Verification Recorder...');
  const commandResults = [];

  for (const c of commandsToRun) {
    console.log(`Executing: ${c.command}...`);
    const startedAt = new Date().toISOString();
    let exitCode = 0;
    let logOutput;

    try {
      logOutput = execSync(c.command, {
        cwd: path.resolve('.'),
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      exitCode = err.status || 1;
      logOutput = `${err.stdout || ''}\n${err.stderr || ''}\n${err.message || ''}`;
    }

    const completedAt = new Date().toISOString();
    const logPath = path.join(evidenceDir, c.logFile);
    fs.writeFileSync(logPath, logOutput);

    const logSha256 = crypto.createHash('sha256').update(fs.readFileSync(logPath)).digest('hex');

    commandResults.push({
      name: c.name,
      command: c.command,
      startedAt,
      completedAt,
      exitCode,
      passed: exitCode === 0,
      evidencePath: `quality/evidence/T09/${c.logFile}`,
      evidenceSha256: logSha256,
    });

    console.log(`Finished ${c.name} with exit code ${exitCode}`);
  }

  const fileHashes = {};
  for (const relPath of targetFiles) {
    const fullPath = path.resolve(relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath);
      fileHashes[relPath] = crypto.createHash('sha256').update(content).digest('hex');
    }
  }

  const loop2Verification = {
    task: 'T09',
    loop: 2,
    timestamp: new Date().toISOString(),
    cwd: path.resolve('.'),
    allPassed: commandResults.every((c) => c.passed),
    commands: commandResults,
    fileHashes,
  };

  fs.writeFileSync(
    path.join(evidenceDir, 'loop2-verification.json'),
    JSON.stringify(loop2Verification, null, 2)
  );

  console.log('Loop 2 Recorder completed. Results saved in quality/evidence/T09/loop2-verification.json');
}

main().catch((err) => {
  console.error('Recorder failed:', err);
  process.exit(1);
});
