import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';let s=fs.readFileSync(d+'/prepare-build26-reviews-native85.mjs','utf8');
// Preserve the two partial files created by prepare1; all other writes remain exclusive.
s=s.replace("write('review-gateway-linux-smokes7-restored137.mjs',sm)","write('review-gateway-linux-smokes7-restored140.mjs',sm.replaceAll('restore-137','restore-140').replaceAll('resource137','resource140').replaceAll('Supabase137','Supabase140'))");
s=s.replace("write('review-publishing-build26-photos1.mjs',photos)","assert.equal(read('review-publishing-build26-photos1.mjs'),photos)");
s=s.replaceAll('assert.equal(coalescing.checks.length,17)','assert.equal(c.checks.length,17)').replaceAll('assert.equal(coalescing.checks.length,18)','assert.equal(c.checks.length,18)');
s=s.replace('coalescing-build26-web3-review1.json','coalescing-build26-web3-review2.json');
s=s.replace("const anchor='const result={backendFixtureVariantOnly:true'", "guard=guard.replaceAll('codex-t30-coalescing-build26-green-1.json','codex-t30-coalescing-build26-green-2.json').replaceAll('restore-137','restore-140').replaceAll('resource137','resource140').replaceAll('Supabase137','Supabase140');const anchor='const result={backendFixtureVariantOnly:true'");
assert(!s.includes('assert.equal(coalescing.checks.length,'));
fs.writeFileSync(d+'/prepare-build26-reviews-native85-corrected2.mjs',s,{flag:'wx'});
await import('./prepare-build26-reviews-native85-corrected2.mjs');
