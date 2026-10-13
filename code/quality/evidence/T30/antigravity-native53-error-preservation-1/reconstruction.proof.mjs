import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

export function verifyReconstruction(diagnosticPath, canonicalPath) {
  const diag = fs.readFileSync(diagnosticPath, 'utf8');
  const canonical = fs.readFileSync(canonicalPath, 'utf8');

  const reverted = diag
    .replace(
      "import {captureUiStep} from '../../../../tools/telegram-bridge/demo-stream.mjs';",
      "import {captureUiStep} from '../../tools/telegram-bridge/demo-stream.mjs';"
    )
    .replace(
      "import {observeFailure,persistSanitizedFailure} from './failure-observer.mjs';\n",
      ""
    )
    .replace(
      "fs.appendFileSync(evidence+'/measured-rtp-windows.jsonl',JSON.stringify({before,after,delta:rows})+'\\n');",
      ""
    )
    .replace(
      " }catch(error){try{persistSanitizedFailure(evidence,error,{step,activeActor:activePage?Array.from(windows.entries()).find(([,w])=>w.page===activePage)?.[0]:undefined});}catch{}try{await observeFailure(evidence,windows);}catch(observationError){}if(activePage&&!activePage.isClosed())await checkpoint(activePage,'Kiểm thử dừng tại assertion lỗi','Giữ bằng chứng thật; chưa nghiệm thu T30','FAILED');throw error;}",
      " }catch(error){if(activePage&&!activePage.isClosed())await checkpoint(activePage,'Kiểm thử dừng tại assertion lỗi','Giữ bằng chứng thật; chưa nghiệm thu T30','FAILED');throw error;}"
    );

  const diagHash = crypto.createHash('sha256').update(diag).digest('hex');
  const revertedHash = crypto.createHash('sha256').update(reverted).digest('hex');
  const canonicalHash = crypto.createHash('sha256').update(canonical).digest('hex');

  assert.equal(revertedHash, canonicalHash, 'Reverted diagnostic spec must match canonical frozen test byte-for-byte');
  assert.equal(reverted, canonical, 'String contents must be identical');

  return {
    verified: true,
    canonicalHash,
    revertedHash,
    diagnosticHash: diagHash,
    byteCount: canonical.length,
    lineCount: canonical.split('\n').length
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('quality/evidence/T30/antigravity-native53-error-preservation-1/reconstruction.proof.mjs')) {
  const result = verifyReconstruction(
    path.resolve('quality/evidence/T30/antigravity-native53-error-preservation-1/screen-share-diagnostic.spec.ts'),
    path.resolve('tests/e2e/screen-share.spec.ts')
  );
  console.log(JSON.stringify(result, null, 2));
}
