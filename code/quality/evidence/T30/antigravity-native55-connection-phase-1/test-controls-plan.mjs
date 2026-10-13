import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import { parseEnv } from 'node:util';
import pg from 'pg';

/**
 * FG T30 — Controls Plan for PostgreSQL Client Connection Phase Observation
 *
 * Verifies:
 * 1. Callback & Promise identity preservation on pg.Client.prototype.connect.
 * 2. TCP accept without PG ready timeout: confirms tcpConnectedAt is recorded while pgConnectedAt is null.
 * 3. Connection refused failure: confirms tcpConnectedAt is null when TCP handshake fails.
 * 4. Bounded listener cleanup: confirms only own listeners are removed on close/stop without modifying pg-pool or error handlers.
 * 5. ALS context attribution: confirms spanIndex, parentSpanIndex, and fixed owner propagate to phase record.
 */

export const CONTROLS_MATRIX = [
  {
    id: 'CTRL-01-CALLBACK-PROMISE-IDENTITY',
    title: 'Actual normal PG callback and promise identity preservation',
    expected: 'Exact callback (err, client) arguments, exact promise return identity, positive integer backend PID'
  },
  {
    id: 'CTRL-02-TCP-ACCEPT-WITHOUT-PG-READY',
    title: 'Controlled TCP accept without PostgreSQL ready timeout',
    expected: 'tcpConnectedAt populated (<50ms), pgConnectedAt null, finalPhase socket-closed, bytesWritten > 0, bytesRead 0'
  },
  {
    id: 'CTRL-03-REFUSED-CONNECT',
    title: 'Controlled connection refused failure (ECONNREFUSED)',
    expected: 'tcpConnectedAt null, pgConnectedAt null, finalPhase socket-closed, bytesWritten 0'
  },
  {
    id: 'CTRL-04-LISTENER-CLEANUP',
    title: 'Observer listener removal and no writes after stop',
    expected: 'activeConnectionCleanups cleared, only own listeners removed, 0 buffered records post-stop'
  },
  {
    id: 'CTRL-05-HTTP-OWNER-CONTEXT',
    title: 'ALS context attribution under real HTTP/service owner',
    expected: 'owner matches approved enum, spanIndex and parentSpanIndex correctly linked'
  }
];

export async function createTcpAcceptOnlyMockServer() {
  const server = net.createServer((socket) => {
    // Intentionally hold TCP socket open and send 0 bytes back to simulate server stalls
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    port,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

export function validatePhaseRecord(record) {
  assert.equal(record.type, 'client-connection-phase');
  assert(Number.isInteger(record.clientConnectionIndex) && record.clientConnectionIndex >= 1);
  assert(['starting', 'tcp-connected', 'pg-ready', 'socket-closed'].includes(record.finalPhase));
  assert(['pg-ready', 'socket-closed', 'sync-error', 'stopped'].includes(record.closeReason));
  assert(['opening', 'open', 'readOnly', 'writeOnly', 'closed', 'other'].includes(record.socketReadyState));
  assert(typeof record.socketDestroyed === 'boolean');
  assert(Number.isInteger(record.bytesRead) && record.bytesRead >= 0);
  assert(Number.isInteger(record.bytesWritten) && record.bytesWritten >= 0);
  if (record.backendPid !== null) {
    assert(Number.isInteger(record.backendPid) && record.backendPid > 0);
  }
  return true;
}
