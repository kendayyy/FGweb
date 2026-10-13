# T30 Source-Backed Diagnosis Notes: Native62 Run & Error Origin Analysis

## 1. Timeline of the Native62 Failure

From the root evidence in `native62-photo-timing-review1.json`, `codex-headed-t30-native-62.txt`, and runtime artifacts:

- **03:12:15.325Z**: Actor Linh joins the call (7,310 ms).
- **03:12:28.406Z**: Actor Hoàng Nam joins the call (5,564 ms).
- **03:12:42.122Z**: Actor Hà joins the call (7,587 ms).
- **03:12:52.307Z**: Actor Linh initiates the first screen-share (10,167 ms). First real `getDisplayMedia` capture succeeds (1280×698, 30 fps, live state).
- **03:13:00.000Z**: Two `GET /api/v1/rooms/:id/play-sessions` requests return **HTTP 500**!
- **03:13:03.160Z**: `POST /api/v1/calls/:id/screen-share/claim` by actor Hoàng Nam returns **HTTP 500**!
- **03:13:15.000Z**: `GET /api/v1/rooms/:roomId/calls` returns **HTTP 500**!
- **Result**: The UI displays alerts `"Không thể kết nối cuộc gọi. Hãy thử lại"` and `"Không thể bắt đầu chia sẻ màn hình. Hãy thử lại"`. Hoàng Nam's button never changes to `"Dừng chia sẻ"`, and Playwright fails on line 54 after the 45,000 ms assertion timeout.

---

## 2. Root Cause Ambiguity under `logger: false`

In `fixture-server-canonical-direct-reviewed1.mjs`:
```javascript
app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
```
Setting `logger: false` suppresses all NestJS framework error logs. When any uncaught exception is thrown in a service, repository, or controller:
1. NestJS default `ExceptionsHandler` catches the error.
2. It detects that the error is not an `HttpException` (or has no specific HTTP status) and wraps it as a generic `500 Internal Server Error`.
3. Because logging is disabled, the error message, stack trace, PG error code, and SDK status are completely discarded.
4. Absence of error output in the test console is **not** evidence that errors did not occur.

---

## 3. Structural Path Analysis of Failing Endpoints

### Path 1: `POST /api/v1/calls/:id/screen-share/claim`
- **Controller**: `CallControlsController.claim` (line 18).
- **Service**: `PublishingService.claim` (line 15) invokes `CallsService.withControlGroup`.
- **Locking Sequence**:
  1. `CallsService.withControlGroup` calls `this.controlsGroup(db, id, user, session)`.
  2. `this.controlsGroup` executes:
     `SELECT id FROM rooms WHERE id=ANY(...) FOR UPDATE` (locks the room row `FOR UPDATE`).
     `SELECT id FROM "user" WHERE id=$1 FOR UPDATE` (locks the user row `FOR UPDATE`).
  3. Inside the open transaction:
     `SELECT ordinal FROM call_publish_slots WHERE call_group_id=$1`
     `INSERT INTO call_publish_slots(...)`
     `await this.calls.syncNativePermissions(db, lease)` -> invokes `RoomServiceClient.getParticipant` and `updateParticipant`.
- **Vulnerability**: Network I/O to the LiveKit SFU occurs **while holding PostgreSQL row locks** on `rooms` and `user` inside an active transaction. If LiveKit SDK responds slowly or is unavailable (503), the database transaction holds the lock for that entire duration.

### Path 2: `GET /api/v1/rooms/:roomId/calls`
- **Controller**: `CallsController.list` (line 18).
- **Service**: `CallsService.list` (line 64).
- **Locking Sequence**:
  1. Opens transaction.
  2. Runs `this.room(db, roomId, user, session, [], 'FOR SHARE')`.
  3. Attempts to acquire `FOR SHARE` on the `rooms` row.
- **Vulnerability**: If `POST screen-share/claim` is holding `FOR UPDATE` on `rooms`, `GET calls` is forced to wait in PostgreSQL lock queue (`LockMode: 'FOR SHARE'` vs `'FOR UPDATE'`). If this wait exceeds the 15,000 ms `statement_timeout`, PostgreSQL throws `57014 (query_canceled)`, resulting in HTTP 500!

### Path 3: `GET /api/v1/rooms/:id/play-sessions`
- **Service**: `PlaySessionsService.listRoom`.
- **Vulnerability**: Requires a connection from the pool. If the pool is exhausted waiting for slow transactions, `pg.Pool` times out after 5,000 ms (`connectionTimeoutMillis: 5000`) with `Error: timeout exceeded when trying to connect`, which NestJS returns as HTTP 500.

---

## 4. The Diagnostic Role of the Error-Origin Observer

Without modifying product code, adding blind retries, or relaxing timeouts, `api-error-origin-observer.mjs` provides definitive answers by recording:
1. **PG SQL State**: Differentiates `57014` (statement timeout / lock wait cancel) from `53300` (connection limit exceeded) and `40001`/`40P01` (serialization/deadlock).
2. **Pool Connection Timeouts**: Specifically detects `POOL_ACQUIRE_TIMEOUT` when `connect()` fails after 5,000 ms.
3. **LiveKit SDK Status**: Detects Twirp `unavailable` (503) or `deadline_exceeded` during `getParticipant` / `updateParticipant`.
4. **Lock Hold Duration**: Measures exact milliseconds that `FOR UPDATE` on `rooms` is held by the claim transaction.

This telemetry will identify whether the primary trigger is LiveKit RPC latency or database lock contention.
