import fs from 'fs';

const pkgs = ['vitest', 'vite', 'eslint', 'jest', 'ts-jest'];

async function main() {
  const results = {};
  for (const p of pkgs) {
    try {
      const res = await fetch(`https://registry.npmjs.org/${p}`);
      if (!res.ok) continue;
      const data = await res.json();
      results[p] = {
        latest: data['dist-tags'].latest,
        versions: Object.keys(data.versions).slice(-15)
      };
    } catch (err) {
      results[p] = err.message;
    }
  }
  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync('quality/evidence/T01/security-fix-versions.json', JSON.stringify(results, null, 2), 'utf8');
}

main();
