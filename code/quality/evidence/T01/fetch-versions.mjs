import fs from 'fs';

const pkgs = [
  '@nestjs/common', '@nestjs/core', '@nestjs/platform-express', '@nestjs/config',
  '@nestjs/websockets', '@nestjs/platform-socket.io', 'reflect-metadata', 'rxjs',
  'better-auth', 'drizzle-orm', 'drizzle-kit', 'pg', 'socket.io', 'socket.io-client',
  '@socket.io/redis-adapter', 'ioredis', 'bullmq', 'livekit-server-sdk', 'livekit-client',
  'helmet', 'multer', 'sharp', 'zod', 'nodemailer', 'web-push', 'react', 'react-dom',
  'react-router-dom', '@tanstack/react-query', '@fontsource/inter', 'lucide-react',
  'tailwindcss', '@tailwindcss/vite', 'typescript', 'vite', '@vitejs/plugin-react',
  'vite-plugin-pwa', 'workbox-window', 'vitest', '@testing-library/react',
  '@testing-library/user-event', '@testing-library/jest-dom', '@playwright/test',
  'eslint', 'typescript-eslint', '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin',
  'jest', 'ts-jest', 'supertest', 'tsx', 'ts-node',
  '@types/node', '@types/react', '@types/react-dom', '@types/express', '@types/pg',
  '@types/multer', '@types/supertest', '@types/jest', '@types/nodemailer', '@types/web-push'
];

async function main() {
  const results = {};
  await Promise.all(pkgs.map(async (p) => {
    try {
      const res = await fetch(`https://registry.npmjs.org/${p}/latest`);
      if (!res.ok) {
        results[p] = `HTTP ${res.status}`;
        return;
      }
      const data = await res.json();
      results[p] = data.version;
    } catch (err) {
      results[p] = `ERROR: ${err.message}`;
    }
  }));

  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync('quality/evidence/T01/npm-versions-query.json', JSON.stringify(results, null, 2), 'utf8');
}

main();
