import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';const d='quality/evidence/T30',r=n=>fs.readFileSync(d+'/'+n,'utf8'),w=(n,s)=>fs.writeFileSync(d+'/'+n,s,{flag:'wx'}),h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const old=r('codex-gateway-pg-only4.cjs'),start=old.indexOf('function writeStdoutSync(str) {'),end=old.indexOf('\nfunction flushBufferSync()',start);assert(start>=0&&end>start);
const fn=`function writeStdoutSync(str) {
  const buf = Buffer.from(str, 'utf8');
  let written = 0;
  const deadline = Date.now() + 2000;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  while (written < buf.length) {
    let bytes;
    try {
      bytes = fs.writeSync(1, buf, written, buf.length - written);
    } catch (error) {
      // Linux stdout can temporarily refuse a nonblocking pipe write without consuming bytes.
      // Retry that exact remaining offset only, with a bounded deadline; permanent IO errors fail.
      if (!['EAGAIN', 'EWOULDBLOCK', 'EINTR'].includes(error?.code) || Date.now() >= deadline) throw error;
      Atomics.wait(pause, 0, 0, 1);
      continue;
    }
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes > buf.length-written) {
      throw new Error('Invalid or zero byte stdout write');
    }
    written += bytes;
  }
}
`;
let next=old.slice(0,start)+fn+old.slice(end);const catchPoint="    writeStdoutSync(payload);\n  } catch {\n    failureCount++;";assert(next.includes(catchPoint));next=next.replace(catchPoint,"    writeStdoutSync(payload);\n  } catch (error) {\n    failureCount++;\n    try { fs.writeSync(2, '[FG_GATEWAY_IO_FAILURE] ' + JSON.stringify({operation:'flush',code:['EAGAIN','EWOULDBLOCK','EINTR','EPIPE','EIO'].includes(error?.code)?error.code:'OTHER'}) + '\\n'); } catch { /* The original observation failure remains strict. */ }");w('codex-gateway-pg-only5.cjs',next);
w('gateway-nonblocking-write-source-review1.json',JSON.stringify({at:new Date().toISOString(),reviewer:'Codex',before:{path:d+'/codex-gateway-pg-only4.cjs',sha256:h(d+'/codex-gateway-pg-only4.cjs')},after:{path:d+'/codex-gateway-pg-only5.cjs',sha256:h(d+'/codex-gateway-pg-only5.cjs')},actualRed:'gateway-pipe-pressure-red3.json',change:'Only stdout writer: bounded 2000ms retries of real EAGAIN/EWOULDBLOCK/EINTR at unchanged byte offset; invalid/permanent/deadline errors still fail strict health. Safe failure enum adds diagnostics. No application query/RPC/timer sampling/health schema/assertion/deadline changes.',native95Cause:'Unproven: original health records only aggregate failure1. Actual Linux nonblocking-pipe defect independently reproduced; fresh real native run required.'},null,2)+'\n');console.log('Writer5 prepared from measured Linux EAGAIN RED; strict observer health unchanged.');
