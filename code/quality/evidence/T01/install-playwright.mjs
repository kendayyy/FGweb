import { execSync } from 'child_process';
import path from 'path';

const cwd = process.cwd();
const cacheDir = path.join(cwd, '.cache', 'ms-playwright');

console.log(`Setting PLAYWRIGHT_BROWSERS_PATH=${cacheDir}`);
process.env.PLAYWRIGHT_BROWSERS_PATH = cacheDir;

try {
  console.log('Running npx playwright install chromium...');
  const output = execSync('npx playwright install chromium', {
    encoding: 'utf8',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cacheDir }
  });
  console.log(output);
  console.log('Playwright installation successful!');
} catch (err) {
  console.error('Playwright installation failed:', err.message);
  process.exit(1);
}
