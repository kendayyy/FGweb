# CHATCRYPTO-BE: limited error and logging source review

Read-only review of the twelve files pinned in security-log-boundaries-review.json.
The recorded command checks hashes against the current progress audit where that
audit includes the path. This is source provenance, not a new behavioral test.

- Transit converts token acquisition, HTTP, TLS, status and response parsing failures
  to fixed TransitFailure categories. It does not include remote response bodies,
  request plaintext or token values in those errors. Custody configuration exposes
  a fixed unavailable message; token sink buffers are cleared after conversion.
- Lobby wrappers use fixed unavailable/integrity errors. The chat exception filter
  returns a generic response for non-HttpException errors without logging the raw
  error. HttpException response objects are forwarded, so this finding does not
  establish that every application exception payload is safe.
- The reviewed cleanup and realtime logger calls use fixed warning strings. Socket
  denial replies use a fixed message and request ID rather than a raw error object.
- The private PUSH worker logs status and processed/delivered counters. Its top-level
  failure message is fixed. The dispatcher inspects transport status codes to decide
  retirement/retry and does not log the raw transport error or subscription keys.

No runtime source, quota, timer or application policy changed. Existing full301/17
and separate room12/admission16/backlog1 evidence remains the current evidence;
no new full run was performed for this read-only review.

Limits: no production log collection or external custody activation was performed.
This is not an exhaustive exception-payload, heap-zeroization, protocol, supply-chain
or security audit. Existing production/aggregate ingestion gates remain open. The
actual ban/unban epoch producer remains absent pending the user sequencing decision
documented in ban-producer-gate-review.md. No PASS or T37 advancement is claimed.
