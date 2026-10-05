import assert from 'node:assert/strict';
import { validateSafeRedirect } from '../../../apps/web/src/features/auth/utils.ts';

const origin = 'http://localhost:5173';
globalThis.window = { location: { origin } };

for (const input of ['/\\outside.invalid', '/\n/outside.invalid', '//outside.invalid', 'https://outside.invalid']) {
  const actual = validateSafeRedirect(input);
  assert.equal(new URL(actual, origin).origin, origin, 'Callback path must stay same origin after browser URL normalization');
}
console.log('PASS: unsafe normalized callback paths rejected');
