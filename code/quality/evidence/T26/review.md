# T26 — review tạm dừng, chưa PASS

Database/setup/contracts prerequisites T07-FIX2, T01-FIX2 và T03-FIX14 đã PASS trước logic. T26 triển khai actual CallsModule, reservation/capacity10, lease/session/member ACL, gateway signaling private, microphone-only token60s, native logout/remove/dissolve hooks. Room/team/call giữ riêng; T27 còn sở hữu lifecycle/webhooks/grace30s/last leave.

## Kiểm chứng thật

- `codex-admission-final-1.json`:13/13 HTTP/PostgreSQL/native SFU admission PASS.
- `codex-gateway-native-4.json`:13/13 native private SFU/gateway tests PASS. Logout/remove/self-leave/dissolve/native refreshed-token/replay/DB outage/grant isolation/session binding đã kiểm; race RemoveParticipant not_found được xử lý idempotent, các lỗi khác vẫn fail.
- Auth/rooms regression đầu fail setup npm cwd, giữ log. Root runner có4 suites PASS/3 T08 fails do origin fixture5173 vs local18080. `codex-auth-original-origin-1.json`: nguyên16/16 frozen T08 PASS tại đúng fixture origin. Không sửa assertions/source/env để xanh.
- `codex-final-types-1.json`, `codex-gateway-build-4.json`, `codex-final-lint-3.json`: exit0.
- `codex-hold-audit-3.json`: frozen readonly, latest prior output ngoài phạm vi, historical PASS records, env SHA và8 baseline giữ nguyên. Không dùng gate T27 hoặc tuyên bố task PASS.

## Blocker media và quyết định chờ

Bốn headed probes qua gateway chưa đạt. Native embedded TURN TCP local hoàn tất WebRTC ban đầu và SFU nhận microphone track, nhưng SDK2.22.3 timeout negotiation rồi reconnect. Probe4 chỉ quan sát native SDK answer (gọi nguyên hàm): offerId0, latestOfferId2. Lease/session chưa revoke. SDK chờ acknowledgement lớn hơn checkpoint nên answer0 không giải quyết negotiation. Không đổi assertion connected hoặc patch SDK/node_modules để giả thành công. Fixture schema/containers đã dọn.

`media-version-proposal.md` đề xuất checkpoint T01-FIX3 nâng self-hosted SFU1.8.4→1.9.12, registry manifest/digest đã đọc thật. Chưa nâng/cài/chạy ứng viên, chưa biết toàn bộ compatibility sẽ PASS. Đề xuất gateway trước ghi không đổi LiveKit version nên cần quyết định mới. T26 BLOCKED, chưa mở T27.

Chưa chứng minh receiver inbound audio RTP, âm thanh nghe được, production TURN TLS hoặc tải1.000 media. Main local DB chưa migrate0007 và preview media chưa được kích hoạt.

## Deviation compiler và audit

Build native tạo4 declarations teams/play-sessions đổi thứ tự literal unions ngoài danh sách outputs dự kiến. Giữ failure audit1. Các build proof độc lập chưa tái tạo SHA cũ; không nhận chúng là restoration/PASS. `declaration-equivalence.json` phân tích đọc-only tất cả hoán vị literal unions, khớp chính xác4 SHA predecessor: chứng minh không đổi thành phần type. Source và compiled runtime JS vẫn đúng SHA owner trước. Theo quyền mở rộng Write Scope/touch locked files đã có, pin chính xác4 derived files trong `generated-scope-review.json`, giữ compiler output thật; không sửa declaration text/old hashes/checker. Native T26 gate đầu task đã đạt; current unfinished task không được gắn PASS để vượt gate.

Các failure setup, diagnostics, RED, helper audit và lint được giữ cùng command/time/exit code/log SHA. T26 chỉ được chốt sau compatibility setup và headed native RTP/replay đạt.
