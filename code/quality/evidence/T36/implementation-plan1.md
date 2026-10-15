# T36 — FG PWA, installation and explicit Push permission

Execute inline with Codex; user directs continuous sequential completion, unchanged approved FG design and workspace E:/FGweb/code. T35 PASS and verified masterb364e1a632084a6dd826f989181b4a4d23670b55 are prerequisites. Existing approved spec7/design/task36 are the binding architectural brief. No agents/Antigravity/Anti2/cockpit, installs, service purchases, production publication or future task work.

Goal: install/help for Android/iPhone, user-gesture Push opt-in, denied/revoked/unsupported truthful states, authenticated per-device registration/revoke, safe background notification click routing, public-shell-only offline caching and update behavior preserving current drafts/calls/session. Existing FG manifest/canonical brand assets are retained. Actual T35 adapters and target lookup are consumed; no backend authority changes or fake auth/inbox fixtures.

## Boundaries and rulings

- Preserve authenticated notification preferences and current source resolution. Push permission/subscription does not enable channels automatically or mark preferences saved. Default/denied states never prompt on mount, login, installation or focus. iPhone installation guidance follows feature detection and standalone/Home Screen eligibility; no unsupported install prompt.
- Service worker caches only build-listed public shell/versioned assets, fetched without credentials; no chat/private API/token/media/user response caching. Private APIs, websocket paths, mutations, query-bearing assets and external URLs remain network-only. Offline app shell displays truthful disconnected state; no synthetic send success. Worker update never auto reloads a live session/call/draft.
- Native Push payload is generic and bounded, with approved same-origin /notifications/:id target only. notificationclick closes notification and focuses/navigates a same-origin client or opens the guarded target. Current session/source ACL is checked in the app/API, not trusted from payload/cache.
- Add a before-sign-out resource phase so authenticated subscription DELETE occurs before session revocation; retain all existing post-logout cleanup and error behavior. Pending actor work is canceled and stale actor responses cannot bind subscriptions or navigate. Native subscription cleanup still runs after failure/revocation; no fake unregister confirmation. Cross-tab/stale subscription races require current endpoint/key identity checks.
- T35 existing external target API supports independently enabled PUSH with IN_APP off. Target route must consume it without changing inbox unread/preferences or authorizing stale source content. Restore normal current-source routing, login and unavailable states.
- Physical iPhone+Android and reachable HTTPS test origin requested directly from human. PC Chrome verification does not replace those receipts. Missing hardware/origin prevents PASS but does not stop implementation/local verification. No main migration/deployment or1,000-call/live claim.

## Sequential implementation

1. Stock gate, reviewed current-spec lineage, scope and86frozen priorPASS snapshot. Record every actual round/history. Necessary App/Auth lifecycle/notification target/Vite/public SW/build/doc integrations use exact byte-reviewed adoption; no frozen evidence/helper changes.
2. RED apps/web/test/pwa.test.ts before implementation: no automatic permission; explicit gesture/default-granted/denied/unsupported/insecure/iPhone standalone; per-device register/unregister API failures and logout-before-session ordering; abort/actor switch/key rotation; installation prompt acceptance/dismissal; offline/update truth. Add owned worker policy/click/cache tests proving real behavior, not mirrors.
3. Implement apps/web/src/pwa/ controller/API/provider/controls/styles and service worker policy. Existing manifest/canonical icons are reused. Integrate installation/help and Push controls into existing approved app/settings with accessible labels/focus,44px targets, dark/light and compact responsive FG layout.
4. RED auth lifecycle and independent-channel external notification target regressions; exact reviewed integration, preserving original tests and source rules. No IN_APP preference override, unsigned external routes or old-account metadata.
5. GREEN serial DOM/worker policy tests, affected auth/notification/call/crypto regressions. Meaningful existing test copies only where necessary, reversible import/evidence rebase; source originals unchanged. Lint/types and source-pinned fresh Vite/PWA build with reviewed canonical adoption, public cache manifest and build source/privacy audit.
6. Genuine headed canonical FG/API/PG/Redis/worker E2E, fresh Telegram start/groups/end/errors: real browser permission through click, rejection/no repeat, registration/logout, native Push event and guarded notification navigation, stale/revoked source, network-offline CacheStorage privacy and update lifecycle, desktop/mobile viewport/theme/accessibility. API/DB are actual; synthetic actor/owned schema only. No headless or desktop emulation as physical mobile proof.
7. Real installed iPhone and Android: install, permission/denied/revoke, background delivery and correct current-authorized room click on supplied HTTPS origin. Save device/version/time/action/receipt evidence; no fake physical observation. Continue only T36 until all acceptance or genuine missing device/origin blocker.
8. Final source/acceptance/checker/baseline86PASS/original pins/env/canonical brand/current build/Telegram/owned cleanup/historical schema review and actual history. PASS only after full evidence; scoped staged-blob privacy scan, normal public origin/master commit/push and verified bounded receipts before T36-SUPPORT-DATA.

## Most important failure conditions

1. Session changes while permission/subscribe/POST awaits: reject late binding, cleanup owned native target and show truthful status.
2. Logout revokes cookie before subscription DELETE: before-sign-out phase preserves authenticated revoke, while logout and all private cleanup still complete after failures.
3. Accepted Push with IN_APP off: current external-target lookup resolves source without manufacturing inbox/unread or modifying opt-outs.
4. Cached navigation/asset query leaks private data: exact public build allowlist and no credential/private-response caching; inspect actual CacheStorage offline.
5. Update/revoke/background click during live use: no automatic reload, old account/source stale navigation rejected, actual hardware receipts required.

Primary references consulted: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ ; https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable ; https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers . Existing locked vite-plugin-pwa2.0.0 may be used; no new dependency install.
