# T26 — checkpoint tương thích LiveKit

## Blocker đã tái hiện

- Gateway-native-4: 13/13 native HTTP/PostgreSQL/SFU tests PASS, gồm logout/kick/replay và SFU-refreshed token.
- Headed gateway-rtc-4 vẫn FAIL sau microphone publish. WebRTC ban đầu connected, native SFU có audio track, lease/session chưa revoke.
- Instrumentation chỉ quan sát và gọi nguyên hàm SDK: answer nhận offerId=0, latestOfferId=2. SDK 2.22.3 PCTransportManager chờ OfferAnswered > checkpoint; answer 0 không hoàn tất negotiation, timeout rồi reconnect. Không đổi assertions hoặc giả trạng thái connected.
- Containers/schema thử đã dọn. Chưa chứng minh audio RTP phía nhận, chất lượng audio hoặc tải 1.000.

## Đề xuất cần duyệt

Thêm checkpoint **T01-FIX3** trước khi resume T26, nâng **LiveKit self-hosted 1.8.4 → 1.9.12**, giữ SDK 2.22.3, gateway admission và toàn bộ limits. Image registry đã xác nhận:

`livekit/livekit-server:v1.9.12@sha256:2c13cbf2edcbf13ea7b20d05c10b394d04d8fb3fe358269cff845a90b4de9576`

Đây mới là ứng viên tương thích, chưa cài/chạy hoặc tuyên bố PASS. Source chính thức 1.9.12 echo remote offer ID trong answer và có data-track channel:

- https://raw.githubusercontent.com/livekit/livekit/v1.9.12/pkg/rtc/transport.go
- https://raw.githubusercontent.com/livekit/client-sdk-js/v2.22.3/src/room/PCTransportManager.ts

Scope setup dự kiến: `infra/compose.local.yml` đúng image stanza; cấu hình private-SFU/gateway mới trong `infra/media/`; evidence `quality/evidence/T01-FIX3/`; runtime `.runtime/t01-fix3/`. Pin scope và checklist trước sửa. Không sửa lại setup/evidence PASS cũ hoặc package-lock; cập nhật tài liệu phiên bản/traceability qua rebaseline có review nếu baseline hiện chứa version khóa.

T01-FIX3 khóa digest, kiểm config, startup/health native và tương thích SDK bằng fixture riêng. Sau PASS, T26 nhận output owner mới rồi chạy lại toàn bộ admission/gateway/headed audio RTP/replay. Chỉ thay main SFU sau kiểm fixture đạt và xác nhận cấu hình lưu; không reset PostgreSQL/Redis, thay secrets hoặc publish production.

## Vì sao cần quyết định mới

Đề xuất gateway trước đã duyệt ghi rõ **không đổi phiên bản LiveKit**. Rule 03 yêu cầu phiên bản khóa và compatibility gate tại task setup. Quyền mở rộng files trước đó không tự thay quyết định phiên bản đã ghi; vì vậy chưa thực hiện nâng SFU trong T26.

Nếu không duyệt, T26 giữ BLOCKED và không mở T27; không patch node_modules, hạ yêu cầu microphone hoặc làm fake success.
