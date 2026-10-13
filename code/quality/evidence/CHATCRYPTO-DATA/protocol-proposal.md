# FG — đề xuất CHAT-CRYPTO-01 để chốt

Ngày08/10/2026. Trạng thái: **đề xuất, chưa chọn thư viện/chưa cài/chưa triển khai**. Spec17 đã duyệt phạm vi E2EE DM/nhóm, Lobby mã hóa lưu trữ. T28 và hai checkpoint metadata đã PASS; CHATCRYPTO-DATA đang mở, BE/FE/QA/T29 chưa mở.

## Lựa chọn đề xuất

Đề xuất **Matrix Rust crypto WASM18.6.0 + OpenBao Transit self-hosted cho Lobby**. Giữ React/Vite, NestJS, PostgreSQL, Redis, Socket.IO và LiveKit. Thư viện chạy ở trình duyệt; backend FG làm routing ciphertext/public keys theo định dạng SDK. Đây là adapter cho state machine, không thêm tài khoản Matrix hoặc vận hành homeserver/federation. Backend adapter và kiểm tra quyền vẫn là công việc bảo mật phải được kiểm thử, không được coi tự an toàn nhờ tên thư viện.

| Phương án | Lợi ích | Công việc/rủi ro còn phải giải quyết |
| --- | --- | --- |
| Matrix Rust WASM18.6.0 — đề xuất | Có npm/WASM cho web và Node, state machine cho Olm/Megolm, verification và backup; không cần thêm dịch vụ chat bên ngoài | Adapter key/query/claim/to-device/sync, membership epochs, nhiều tab, gửi lại và migration phải kiểm chứng thật; Megolm không có cùng đặc tính forward secrecy/PCS của MLS |
| OpenMLS0.9.0 | MLS RFC9420, thư viện đã có audit, phù hợp nhóm/epochs | WASM bindings vẫn được nhà phát triển gọi là experiment, target wasm CI build nhưng không test; cần Rust/WASM bindings/persistence và browser compatibility gate lớn hơn |
| Matrix homeserver tự host + SDK đầy đủ | Tận dụng server/client protocol đầy đủ | Thêm dịch vụ chat, đồng bộ tài khoản/ACL/room, vận hành và migration phức tạp hơn; phải review lại architecture FG |

Nhận định về chi phí/công triển khai là đánh giá của Codex, chưa là benchmark. OpenBao thêm một dịch vụ quản lý khóa do FG vận hành; không mua cloud KMS hoặc dịch vụ trả phí. Chi phí CPU/RAM/disk/egress sẽ đo; không hứa tổng vận hành bằng0. Phiên bản/digest OpenBao chỉ khóa sau lựa chọn và kiểm metadata/advisory/checksum chính thức tại setup, không dùng latest.

## Thiết bị, lịch sử và recovery

Mỗi thiết bị có key pair riêng client-side trong crypto store IndexedDB. Người dùng xác minh thiết bị/identity qua luồng SDK; người nhận chưa được xác minh hoặc đổi khóa phải thấy cảnh báo/chặn chia khóa theo policy. Không auto-trust thiết bị chỉ vì đăng nhập thành công. Thiết bị mới nhận secret từ thiết bị đã xác minh hoặc backup mã hóa bằng **mã khôi phục ngẫu nhiên riêng**, không dùng mật khẩu FG. Khóa riêng/recovery code không lên server; reset password chỉ khôi phục đăng nhập, không giải mã lịch sử. Recovery tạo một thiết bị mới, không clone outbound ratchet/device identity giữa hai máy.

FG lưu public keys/signatures, queue to-device ciphertext, membership revision và envelopes. Mỗi thay đổi join/leave/kick/ban/device revoke tăng revision và buộc mọi sender tạo outbound group session mới trước tin tiếp theo. Gửi theo revision cũ bị từ chối/retry; offline sender phải sync và rotate. Welcome/key share chỉ đến thành viên/thiết bị được xác minh đúng revision. Session lịch sử không chia cho người mới; rejoin không chia khóa khoảng bị loại. Khôi phục chỉ lấy lịch sử mà chính user đã được quyền/đã có khóa, không nhận toàn bộ backup của người khác. Client kiểm envelope/room/sender/key trust trước hiển thị, không chỉ tin ACL server.

## Lobby, ảnh và báo cáo

Lobby dùng AES-256-GCM qua OpenBao Transit: key không export, quyền ứng dụng chỉ encrypt/decrypt; rotate/rewrap bằng quyền vận hành riêng. Khóa và unseal/recovery tách DB/object backups. Keys cho Lobby/report tách nhau; nonce/randomness do engine quản lý, không convergent mode. Outage/sealed/unknown key/tamper phải lỗi thật, không plaintext fallback. Private E2EE keys không đi qua OpenBao.

Ảnh private theo encrypted-attachment format của protocol, key/hash/filename/thumbnail nằm trong nội dung đã mã hóa; endpoint chỉ nhận ciphertext và metadata tối thiểu. **Thay validation ảnh private:** client gửi/nhận kiểm chữ ký ảnh,5MiB/20MP và decode an toàn; server kiểm byte quota/ACL/cipher envelope, không thể Sharp-decode ciphertext để xác minh pixels. Lobby vẫn server kiểm ảnh rồi mã hóa. Điểm này cần chốt cùng lựa chọn vì thay cách enforce hiện tại, không được tuyên bố server đã kiểm được pixels private. Wire overhead phải bounded/documented, không lặng tăng giới hạn ảnh gốc.

Báo cáo chỉ các tin/ảnh người báo chọn, preview/xác nhận; lưu evidence AEAD, ACL admin duy nhất, audit và retention. Không gửi private key hoặc group key. Phân biệt dữ liệu báo cáo do người dùng cung cấp, tin có thể chứng minh sender bằng protocol, và legacy import; không mặc nhiên gọi mọi plaintext là chứng cứ xác thực. Private push chỉ có tin mới; reply/mention xử lý client-side, server chỉ routing IDs hợp lệ, không text preview trong queue/log.

## Chuyển dữ liệu cũ, giữ ID và quyền

Inventory read-only tại máy hiện tại:7 tin Lobby có text,0 tin DM,0 ảnh/pending uploads; không đọc nội dung hoặc user IDs. Đây chỉ là snapshot của máy, không chứng minh mọi DB/backup khác trống.

Migration thêm trạng thái LEGACY_PENDING/MIGRATING/ENCRYPTED, không drop/reset hoặc đổi IDs/cursors/dedup. Lobby backfill qua Transit và đối soát count/hash. DM/room backfill phải do thiết bị thành viên đủ quyền: download bounded batch qua ACL/membership interval, mã hóa bằng SDK, upload có idempotent provenance và verify/reconcile trước chuyển trạng thái. Tin cũ chỉ được chia khóa tới cohort có quyền lịch sử, không dùng khóa nhóm hiện tại để cấp cho người mới. Thiếu membership history/thiết bị đủ quyền thì giữ trạng thái pending và báo blocker, không tự chia hoặc xóa dữ liệu.

Archive import giữ tác giả/time/ID legacy nhưng đánh dấu nguồn import, không giả chữ ký tác giả cũ. Việc loại bỏ plaintext active columns/objects là bước chuyển sau đối soát và backup đã xác nhận, không destructive cleanup tự động trên DB thật. Không nhãn E2EE toàn hệ thống khi còn legacy plaintext/backup chưa có kế hoạch xử lý. Local tests phải có cả DB trống và fixture chứa private text/ảnh/membership cũ, dù máy hiện tại không có private messages.

## Threat model và điều kiện nghiệm thu

Mục tiêu: DB/object/backup/relay bị đọc không giải mã DM/room; sender/device giả, ciphertext tamper/replay/cross-room, revoked member/device và stale session không được nhận tin mới. Metadata tối thiểu (IDs, thành viên, thời gian, kích thước) còn thấy trên server. Thiết bị bị chiếm/XSS hoặc website phát JavaScript độc hại có thể đọc lúc client giải mã; phải CSP/escaping/dependency integrity/key-change warnings, không tuyên bố E2EE loại bỏ rủi ro client. Audit thư viện không là audit tích hợp FG.

Sau chọn: checkpoint setup riêng pin npm exact+lock/integrity và OpenBao version/digest/TLS/ACL; smoke native crypto2 thiết bị/restore/tamper và Transit rotation/rewrap/outage trước code nghiệp vụ. Sau setup, DATA làm RED contracts/migrations thật, BE API/DB/object/socket ACL và crypto routing, FE headed nhiều user/device/recovery/rejoin/ảnh/report, QA threat-model/security/regression. Mỗi checkpoint PASS riêng; giữ giới hạn10call/3screen/720p30/1.000media và lịch sử tests. Không mua/publish/migrate main DB tự động.

Các scope đã pin cần tinh chỉnh đúng producer paths trước BE/FE: backend thực ở modules/chat, realtime, social, rooms, uploads; frontend có direct-messages và lobby. Không tạo module/messages giả hoặc bỏ producer khỏi review.

## Nguồn đã kiểm08/10/2026

- [Matrix Rust WASM repository](https://github.com/matrix-org/matrix-sdk-crypto-wasm): no-network state machine, web/Node packaging, IndexedDB.
- [Release18.6.0](https://github.com/matrix-org/matrix-sdk-crypto-wasm/releases/tag/v18.6.0); metadata registry-candidate.json xác nhận phiên bản stable/engines/license/integrity, chưa install.
- [OlmMachine API](https://matrix-org.github.io/matrix-sdk-crypto-wasm/classes/OlmMachine.html): outgoing requests, verification/backup, invalidateGroupSession/shareRoomKey; optional experimental APIs không dùng mặc định.
- [Matrix client/server spec](https://spec.matrix.org/v1.17/client-server-api/#end-to-end-encryption): encryption/device/key backup/attachments.
- [Vodozemac public audit2022](https://www.matrix.org/blog/2022/05/16/independent-public-audit-of-vodozemac-a-native-rust-reference-implementation-of-matrix-end-to-end-encryption/): historical audit of crypto implementation, không chứng minh18.6.0 hoặc FG adapter đã audited.
- [OpenMLS](https://github.com/openmls/openmls), [release/audit notices](https://blog.openmls.tech/), [WASM experiment](https://github.com/openmls/openmls/blob/main/openmls-wasm/README.md): bản0.9.0 và giới hạn browser đã nêu, không suy audit là đã kiểm mọi wrapper.
- [OpenBao Transit](https://openbao.org/docs/secrets/transit/), [install/checksum](https://openbao.org/docs/install/): AES-GCM/default, ACL, rotation/rewrap và key separation.

## Cần người dùng chốt

Chọn phương án kiến trúc trên, bao gồm quản lý khóa Lobby bằng OpenBao self-hosted, policy thiết bị/recovery và validation ảnh private client-side/byte-quota server. Chưa chốt thì DATA giữ IN_PROGRESS với decision blocker, không cài thêm stack, không tạo migration/contracts giả rồi mở BE.
