# FG — dependency lock verified at T01

Date: 2026-10-04. Node24.21.0/npm11.19.0. Current product baseline: Discord-only AUTH-CHANGE-01.

All direct dependency versions are exact; package-lock.json is the resolved inventory. TypeScript5.9.3 satisfies ts-jest >=4.3 <7 and typescript-eslint >=4.8.4 <6.1. Jest30.5.2 is supported by ts-jest29.4.14 peer metadata. Vite8.3.2/plugin-react6.1.1/Vitest5.0.3 support the installed runtime. jsdom30.1.2 and types included for frontend unit DOM tests.

A pinned esbuild0.28.2 override removes GHSA-67mh-4wv8-2f99 from Drizzle tooling. Actual TypeScript config/schema SQL generation and Vite React/Inter production probe pass after resolution; no migration applied. Fresh npmci, npmls and npmaudit all exit0, audit reports0 vulnerabilities. Old attempt evidence preserved. No forced peer resolution.

Install scripts: only reviewed native/tooling packages approved at exact installed versions; unused approvals removed.

## fg-root

| Package | Exact version | Group |
| --- | --- | --- |
| @playwright/test | 1.63.0 | devDependencies |
| @types/node | 24.0.0 | devDependencies |
| @typescript-eslint/eslint-plugin | 8.71.0 | devDependencies |
| @typescript-eslint/parser | 8.71.0 | devDependencies |
| eslint | 10.12.0 | devDependencies |
| jest | 30.5.2 | devDependencies |
| ts-node | 10.9.2 | devDependencies |
| tsx | 4.23.15 | devDependencies |
| typescript | 5.9.3 | devDependencies |
| typescript-eslint | 8.71.0 | devDependencies |
| vitest | 5.0.3 | devDependencies |
| @eslint/js | 10.0.1 | devDependencies |
| globals | 17.4.0 | devDependencies |

## @fg/web

| Package | Exact version | Group |
| --- | --- | --- |
| @fontsource/inter | 5.3.0 | dependencies |
| @tailwindcss/vite | 4.3.3 | dependencies |
| @tanstack/react-query | 5.104.1 | dependencies |
| better-auth | 1.7.7 | dependencies |
| livekit-client | 2.22.3 | dependencies |
| lucide-react | 1.52.0 | dependencies |
| react | 19.3.0 | dependencies |
| react-dom | 19.3.0 | dependencies |
| react-router-dom | 7.18.4 | dependencies |
| socket.io-client | 4.8.4 | dependencies |
| tailwindcss | 4.3.3 | dependencies |
| zod | 4.6.5 | dependencies |
| @testing-library/jest-dom | 7.0.1 | devDependencies |
| @testing-library/react | 16.3.3 | devDependencies |
| @testing-library/user-event | 14.6.7 | devDependencies |
| @types/node | 24.0.0 | devDependencies |
| @types/react | 19.3.0 | devDependencies |
| @types/react-dom | 19.3.0 | devDependencies |
| @vitejs/plugin-react | 6.1.1 | devDependencies |
| typescript | 5.9.3 | devDependencies |
| vite | 8.3.2 | devDependencies |
| vite-plugin-pwa | 2.0.0 | devDependencies |
| vitest | 5.0.3 | devDependencies |
| workbox-window | 7.4.1 | devDependencies |
| jsdom | 30.1.2 | devDependencies |
| @types/jsdom | 30.0.0 | devDependencies |

## @fg/api

| Package | Exact version | Group |
| --- | --- | --- |
| @nestjs/common | 12.1.2 | dependencies |
| @nestjs/config | 12.0.1 | dependencies |
| @nestjs/core | 12.1.2 | dependencies |
| @nestjs/platform-express | 12.1.2 | dependencies |
| @nestjs/platform-socket.io | 12.1.2 | dependencies |
| @nestjs/websockets | 12.1.2 | dependencies |
| @socket.io/redis-adapter | 8.3.0 | dependencies |
| better-auth | 1.7.7 | dependencies |
| bullmq | 6.3.11 | dependencies |
| drizzle-orm | 0.45.3 | dependencies |
| helmet | 8.3.0 | dependencies |
| ioredis | 6.0.0 | dependencies |
| livekit-server-sdk | 2.19.1 | dependencies |
| multer | 2.4.0 | dependencies |
| pg | 8.23.1 | dependencies |
| reflect-metadata | 0.2.2 | dependencies |
| rxjs | 7.8.2 | dependencies |
| sharp | 0.35.5 | dependencies |
| socket.io | 4.8.4 | dependencies |
| zod | 4.6.5 | dependencies |
| @types/express | 5.0.6 | devDependencies |
| @types/jest | 30.0.0 | devDependencies |
| @types/multer | 2.3.0 | devDependencies |
| @types/node | 24.0.0 | devDependencies |
| @types/pg | 8.23.1 | devDependencies |
| @types/supertest | 7.2.1 | devDependencies |
| jest | 30.5.2 | devDependencies |
| supertest | 7.3.1 | devDependencies |
| ts-jest | 29.4.14 | devDependencies |
| ts-node | 10.9.2 | devDependencies |
| tsx | 4.23.15 | devDependencies |
| typescript | 5.9.3 | devDependencies |

## @fg/worker

| Package | Exact version | Group |
| --- | --- | --- |
| bullmq | 6.3.11 | dependencies |
| drizzle-orm | 0.45.3 | dependencies |
| ioredis | 6.0.0 | dependencies |
| nodemailer | 10.0.14 | dependencies |
| pg | 8.23.1 | dependencies |
| web-push | 3.6.7 | dependencies |
| zod | 4.6.5 | dependencies |
| @types/node | 24.0.0 | devDependencies |
| @types/nodemailer | 8.0.2 | devDependencies |
| @types/pg | 8.23.1 | devDependencies |
| @types/web-push | 3.6.4 | devDependencies |
| ts-node | 10.9.2 | devDependencies |
| tsx | 4.23.15 | devDependencies |
| typescript | 5.9.3 | devDependencies |
| vitest | 5.0.3 | devDependencies |

## @fg/contracts

| Package | Exact version | Group |
| --- | --- | --- |
| drizzle-orm | 0.45.3 | dependencies |
| pg | 8.23.1 | dependencies |
| zod | 4.6.5 | dependencies |
| @types/node | 24.0.0 | devDependencies |
| @types/pg | 8.23.1 | devDependencies |
| typescript | 5.9.3 | devDependencies |
| vitest | 5.0.3 | devDependencies |

## @fg/database

| Package | Exact version | Group |
| --- | --- | --- |
| drizzle-orm | 0.45.3 | dependencies |
| pg | 8.23.1 | dependencies |
| zod | 4.6.5 | dependencies |
| @types/node | 24.0.0 | devDependencies |
| @types/pg | 8.23.1 | devDependencies |
| drizzle-kit | 0.31.11 | devDependencies |
| typescript | 5.9.3 | devDependencies |
| vitest | 5.0.3 | devDependencies |

## Local service images

- PostgreSQL17: postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24; localhost55432.
- Redis7: redis:7-alpine@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499; localhost56379.
- LiveKit: livekit/livekit-server:v1.8.4@sha256:621fd87bd64a0c83e1f2418ee0323eb920d00acdd73e5f79b303c64f6cc532af; localhost57880/57881/57882UDP.

Digests confirmed by docker pull (image-*.txt). Dedicated fg-local project; unrelated existing Supabase containers untouched. Generated credentials ignored in infra/.env.local; secret configs/data .runtime/services/. Ports loopback only; no public deployment.

Start: `docker compose --env-file infra/.env.local -f infra/compose.local.yml up -d --wait`. Prepare generated configs once using `node quality/evidence/T01/prepare-local-services.mjs` (idempotent, preserves credentials). LiveKit HTTP and authenticated SDK readiness are checked by npmrunverify; container running/version alone not sufficient. No media capacity/voice quality claim.

Project npmcache .cache/npm; browser cache .cache/ms-playwright; runtime .runtime/services. Install browser with node quality/evidence/T01/install-browser.mjs. Product application build/test entrypoints are not ready until owning feature tasks, and missing implementation fails explicitly. T01 probes are setup only.

Evidence: quality/evidence/T01/verification.json, final-*.txt, output-hashes.json.

## T02 configured local services

Discord only, authenticated SMTP Gmail TLS465, generated local Better Auth/VAPID keys, PostgreSQL/Redis/LiveKit from existing local service credentials. Actual probes and limits: quality/evidence/T02/review.md. No dependency version changes.
