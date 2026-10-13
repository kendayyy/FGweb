# Existing migration regression review

2026-10-08, CHATCRYPTO-DATA, approved additive schema scope.

Native database-regression-1: 75 passed, two failures. The T07 migration test
compares SELECT * before migrating from 0000–0002 with SELECT * after all current
migrations. Exact diff consists of three newly approved message columns:
encryption_mode=LEGACY_PENDING, crypto_envelope=null, crypto_revision=null.
All original values are identical. Its expected object must include these exact
new defaults, while keeping every original field/value and row order. Do not
switch to partial matching, drop rows, discard columns or change fixtures.
This asserts additive compatibility, not a relaxation to hide lost data.
CHATCRYPTO-DATA owns packages/database/test/**; old PASS records are immutable.

T05 completed its forward migration work after the default 5-second Vitest window.
The schema now includes fourteen migration entries rather than its original two.
Use the runner's explicit 30-second test timeout for the native regression, with
unchanged assertions/test source. This is an I/O execution window, not a latency
benchmark or permission to skip a test. Preserve both failed command records.

The new empty/populated migration suite independently verifies legacy message,
image, member, original IDs/times/cursors, unknown history, no automatic cohorts,
constraints, reapplication and cleanup. No main application migration occurs.
