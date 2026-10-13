# T30 Isolated Read-Only DB Route Latency Diagnostic Control Plan

This plan specifies the implementation and safety boundaries for the isolated read-only DB route latency diagnostic control under [AGENTS.md](file:///E:/FGweb/AGENTS.md), [.agents/rules/08-testing-and-evidence.md](file:///E:/FGweb/.agents/rules/08-testing-and-evidence.md), and [.agents/rules/09-voice-and-live.md](file:///E:/FGweb/.agents/rules/09-voice-and-live.md).

---

## 1. Context and Diagnostic Hypothesis

In Native58 switching window observations (`16:13:35.930Z` to `16:13:39.059Z`):
- The gateway executed 158 database queries with aggregate costs: p50 41.64ms, p95 140.1ms, max 287.46ms, 0 failed, 0 RPC, gateway loop max 33.85ms.
- In `private-gateway-observer-reviewed2.mjs:92`, the gateway observer forces the database connection string host to `host.docker.internal`, traversing the Docker bridge and Windows host port forwarding loopback.
- Meanwhile, the FG PostgreSQL container `fg-local-postgres-1` runs healthy on the existing `fg-local_default` Docker network with internal alias `postgres`/`fg-local-postgres-1` on port 5432.

**Hypothesis**: The host gateway route (`host.docker.internal:<publishedPort>`) may introduce measurable network stack latency compared to the direct container-to-container bridge route (`fg-local-postgres-1:5432`), potentially contributing to cumulative latency across high query volumes.

> [!IMPORTANT]
> This control is an isolated read-only diagnostic benchmark to measure network route latency differential. It is **NOT** an application fix, does **NOT** alter gateway configuration or authentication policy, and does **NOT** claim native acceptance (`nativeAcceptance: false`).

---

## 2. Comparison Route Topologies

| Route | Target Host | Port | Network Path |
|---|---|---|---|
| **Route A** | `host.docker.internal` | Published port (e.g. 55432) | Container &rarr; Docker bridge &rarr; Windows host network stack &rarr; Port forwarding loopback &rarr; PG Container |
| **Route B** | `fg-local-postgres-1` | 5432 (Internal) | Container &rarr; Direct Docker bridge `fg-local_default` &rarr; PG Container |

Both routes connect to the identical PostgreSQL instance with identical credentials, database, SSL settings, and query semantics.

---

## 3. Protocol: Sequential A-B-A-B Benchmark

To isolate transient host fluctuations, the benchmark executes four sequential cycles in alternating order (**A &rarr; B &rarr; A &rarr; B**):

1. **Cycle 1 Route A**: Fresh `pg.Pool({ max: 1, connectionTimeoutMillis: 5000, statement_timeout: 3000 })` &rarr; connect &rarr; measure connect duration and backend PID &rarr; 3 warmup `SELECT 1` &rarr; 20 measured sequential `SELECT 1` on reused connection &rarr; release client &rarr; settle and end pool.
2. **Cycle 1 Route B**: Identical pool options and sequence against Route B.
3. **Cycle 2 Route A**: Identical pool options and sequence against Route A.
4. **Cycle 2 Route B**: Identical pool options and sequence against Route B.

### Measurement Characteristics
- **Warmup Queries**: Exactly 3 explicit warmup `SELECT 1` queries per cycle to stabilize internal driver state; strictly a diagnostic control measure, never an acceptance wait.
- **Measured Queries**: 20 sequential `SELECT 1` queries per cycle (total 40 measured queries per route).
- **Recorded Metrics**:
  - Connection duration (ms) and actual positive backend PID.
  - Per-query duration array (ms).
  - Statistical summary: min, p50, p95, max, mean.
  - Verified result value equals `1` on every query (zero writes, zero schema/data changes).
  - Comparison deltas: `p50DeltaMs`, `p95DeltaMs`, `connectDeltaMs`.

---

## 4. Architectural Boundaries and Privacy

### 4.1 Child Benchmark (`bench-child.mjs`)
- Runs within an unprivileged read-only Docker container.
- Mounts `node_modules` read-only from the project workspace to use installed `pg`.
- Classifies client errors into an allowlisted enum:
  `CONNECTION_TIMEOUT` | `POOL_ACQUIRE_TIMEOUT` | `SQLSTATE` | `REFUSED` | `RESET` | `UNKNOWN`
- Never logs or serializes raw error messages, stack traces, queries, connection strings, hostnames, usernames, or passwords.
- Writes strict sanitized JSON to `/app/output/result.json`.

### 4.2 Runner Orchestrator (`runner.mjs`)
- **Pre-flight Validation**:
  - Privately reads authorized `.env.local` using `parseEnv` with zero logging of values.
  - Validates `DATABASE_URL` protocol (`postgres:` / `postgresql:`) and host (`localhost` / `127.0.0.1`).
  - Inspects `fg-local-postgres-1` via Docker API: asserts running, healthy, attached to `fg-local_default`, has alias `postgres`, and published host port matches.
  - Snapshots PostgreSQL container ID and network configuration.
- **Resource Ownership**:
  - Allocates dedicated runtime directory `.runtime/t30/db-route-<UUID>/`.
  - Writes `input.json` with mode `0600` containing route URLs; never passes credentials in argv, env, console, or container inspect metadata.
  - Launches container with:
    - Image: `node:24.21.0-bookworm-slim@sha256:51b1100cc2a83d370c6a60952e3f2989c8a43159d0e38586e090f3b3326efefd`
    - Security: `--cap-drop ALL`, `--security-opt no-new-privileges`, `--user node`, `--read-only`
    - Network: `--network fg-local_default`, `--add-host host.docker.internal:host-gateway`
    - Label: `fg-owner=t30-db-route-<UUID>`
- **Checked Cleanup (`finally`)**:
  - Removes owned container and verifies removal via filtered Docker inspection.
  - Inspects `fg-local-postgres-1` and asserts container ID and network endpoints are byte-unchanged.
  - Deletes `.runtime/t30/db-route-<UUID>/` completely.
  - Preserves sanitized failure metadata honestly if any step fails.

---

## 5. Deliverables & Safety Checklist

- [x] [bench-child.mjs](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native58-db-route-1/bench-child.mjs) delivered.
- [x] [runner.mjs](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native58-db-route-1/runner.mjs) delivered.
- [x] [proposal.json](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native58-db-route-1/proposal.json) delivered.
- [x] [shortplan.md](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native58-db-route-1/shortplan.md) delivered.
- [ ] Truthful delivery entry appended to [.doc/history.md](file:///E:/FGweb/.doc/history.md).

> [!NOTE]
> In accordance with user instructions, no test, Docker, or process execution has been performed by the assistant. The runner and benchmark files are prepared for root execution.
