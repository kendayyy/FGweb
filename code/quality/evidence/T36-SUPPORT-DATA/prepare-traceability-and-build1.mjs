import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T36-SUPPORT-DATA',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),json=p=>JSON.parse(fs.readFileSync(p));
const contract=`

## T36-SUPPORT-DATA — authenticated private support data boundary

SUPPORT-AUTH-ONLY-01 (human decision15/10/2026): signed-in accounts alone may submit FEEDBACK/BUG forms or CHAT. Guests cannot submit or read private support; a login URL grants no data authority. This checkpoint declares shared schemas and additive migration0025 only. T37 implements API/session/ban/owner/sole-server-admin checks and realtime revocation; no support route is claimed operational here.

All routes below are under /api/v1 and use strict shared Support schemas. Actor, owner, admin role, timestamps, sequence, current status/revision and unread state come from the server. Unknown client fields are rejected. Authenticated user routes must verify the current owner on every request; Admin routes must verify the unique configured server admin, never helper/displayName/email/client role.

| Method | Path | Authority | Request → response |
| --- | --- | --- | --- |
| POST | /support/requests | Authenticated | SupportCreateRequest → SupportCreateResponse |
| GET | /support/requests | Authenticated owner | SupportListQuery → SupportUserRequestPage |
| GET | /support/requests/:id | Authenticated owner | path id → SupportUserDetail |
| GET | /support/requests/:id/messages | Authenticated owner | SupportMessageQuery → SupportMessagePage |
| POST | /support/requests/:id/messages | Authenticated owner | SupportSendMessageRequest → SupportSendMessageResponse |
| POST | /support/requests/:id/read | Authenticated owner | SupportReadRequest → SupportReadState |
| GET | /admin/support/requests | Admin | SupportListQuery → SupportAdminRequestPage |
| GET | /admin/support/requests/:id | Admin | path id → SupportAdminDetail |
| GET | /admin/support/requests/:id/messages | Admin | SupportMessageQuery → SupportMessagePage |
| POST | /admin/support/requests/:id/messages | Admin | SupportSendMessageRequest → SupportSendMessageResponse |
| POST | /admin/support/requests/:id/read | Admin | SupportReadRequest → SupportReadState |
| PATCH | /admin/support/requests/:id/status | Admin | SupportStatusPatch → SupportAdminRequest |
| GET | /admin/support/requests/:id/notes | Admin | SupportInternalPageQuery → SupportNotePage |
| POST | /admin/support/requests/:id/notes | Admin | SupportCreateNoteRequest → SupportNote |
| GET | /admin/support/requests/:id/audit | Admin | SupportInternalPageQuery → SupportAuditPage |

Forms have a trimmed1–160 Unicode-code-point title, CHAT has server title “Chat hỗ trợ”; all bodies are trimmed1–4000 code points and plain text. No attachment/HTML/AI feature is added. Bounded clientRequestId/clientMessageId/clientNoteId are scoped idempotency keys. NEW/IN_PROGRESS/RESOLVED status changes carry expectedVersion; server transactions must serialize revisions and message ordinals, return the existing outcome on retries and reject stale conflicting updates. Read requests supply a message id only; server derives its same-request sequence, applies a monotonic per-reader cursor and computes unread from authorized messages. No user request can set actor/role/cursor ordinal directly.

SupportUserRequest/UserDetail and user events are strict and contain no internal notes/audit or account email. AdminDetail alone adds bounded note/audit pages and an owner display-name summary without credentials/email. Message pages are bounded100, ascending and parent-consistent; request pages max50. Receipt text is exactly “FG đã nhận tin nhắn của bạn.”, emitted only after durable commit in T37. The one initial SYSTEM receipt has null actor/client id, never AI text or a time promise; authored USER/ADMIN messages require real actors. Creation response correlates owner/request/message/receipt identities. Subsequent send receipts acknowledge that authored message, not a second bot message.

Separate support realtime namespace: support.subscribe/unsubscribe carry only requestId; support.admin.subscribe/unsubscribe carry an empty strict body. Server emissions support.message.created and support.request.updated expose user-safe DTOs only; support.admin.request.updated and support.admin.note.created remain admin-only. Current session/ban/owner/admin authorization and revoke on logout/ban/role change belong to T37, including before each emission. Event names or stored role labels do not grant subscriptions. Existing chat/crypto socket contracts remain unchanged.

Migration0025 creates support_requests/messages/notes/read_cursors/audit. Owner/client uniqueness and request/author/client uniqueness deduplicate writes; positive int32 message ordinals are unique per request, with one fixed SYSTEM receipt. Composite cursor FK binds request/message/id/sequence; note-audit FK binds request/note/author. Audit requires explicit non-null statuses/revision for CREATED/STATUS_CHANGED, distinct transition statuses, unique revision and no copied note body. Notes are separate from user messages. Request-owned children cascade; actor FKs restrict deletion to retain history. UTC timestamps and owner/status/activity/message/note/audit indexes support bounded reads. These constraints preserve relationships; application ACL and transactional allocation remain mandatory in T37.

Verification lives in quality/evidence/T36-SUPPORT-DATA/: observed contract/real-PG REDs, strict contracts, disposable fresh/populated pre0025 migration/retry/legacy fingerprints, concurrent uniqueness/rollback/cursor/audit/cascade/SQL-NULL checks, serial regressions and source-pinned exact package builds. Main database migration, admin provisioning, backend/frontend implementation and production activation are outside this checkpoint. closure.json governs completion.
`;
const coverage=`

| Authenticated-only support form/chat contracts, separate user/admin/notes payloads, ordered private messages, status/read/audit and additive migration0025 | T36-SUPPORT-DATA | Strict shared schema/endpoint/event tests; real disposable fresh/populated pre0025 PostgreSQL migration/retry, legacy row fingerprints, concurrency/idempotency/rollback/Unicode/composite FK/SQL-NULL/cascade checks; unchanged auth/social regressions, lint and source-pinned contracts/database builds | code/quality/evidence/T36-SUPPORT-DATA/acceptance-review.md and closure.json govern completion. Human guest-policy decision recorded; source/RED/failures retained. No support API/frontend, admin provisioning, main migration, production activation or new crypto protocol. T37 must enforce current session/ban/owner/sole-admin and realtime revoke. |
`;
const files=[];for(const[p,text,name]of [['quality/api-contract.md',contract,'api-contract1.md'],['quality/spec-coverage.md',coverage,'spec-coverage1.md']]){const proposed=d+'/'+name;fs.writeFileSync(proposed,fs.readFileSync(p,'utf8')+text,{flag:'wx'});files.push({path:p,proposed,beforeSha256:hash(p),afterSha256:hash(proposed)});}
const pins=[];for(const kind of ['contracts','database']){const b=d+'/'+kind+'-build1',input=json(b+'/build-inputs.json');assert.equal(json(d+'/codex-support-'+kind+'-build-1.json').exitCode,0);for(const pin of input.sourcePins){assert.equal(hash(pin.path),pin.sha256);pins.push({path:pin.path,sha256:pin.sha256});}const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):[p+'/'+e.name]);for(const proposed of walk(b+'/dist')){const path=input.canonical+'/dist/'+proposed.slice((b+'/dist/').length),prior=fs.existsSync(path)?hash(path):null;if(prior!==hash(proposed))files.push({path,proposed,beforeSha256:prior,afterSha256:hash(proposed)});}}
fs.writeFileSync(d+'/traceability-build-plan1.json',JSON.stringify({reviewer:'Codex',unresolvedSourceFindings:[],reason:'Exact source-pinned support contracts/database compiled exports and DATA-only API/coverage mapping; preserve existing APIs/crypto and87priorPASS, no main migration or production activation.',sourcePins:pins,files},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({proposedTransitions:files.length,pinnedSources:pins.length}));
