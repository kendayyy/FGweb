# FG — Task Implementation Plan

> **GITHUB-AUTO-PUSH-01 — 13/10/2026:** Người dùng cấp quyền thường trực tự commit/push mỗi task hoàn tất hợp lệ lên repo PUBLIC kendayyy/FGweb, origin/master, không hỏi lại từng lần. Sau gate acceptance/tests/review/checker, chốt ledger/evidence/history, kiểm staged scope và secrets, commit task rồi push và xác minh remote SHA; ghi kết quả thật trước bàn giao theo .agents/rules/12-github-auto-push.md. Giữ secrets/runtime/evidence riêng tư ở local và originals frozen; không thay PASS/checker/thứ tự hoặc tự deploy production. Lỗi push phải báo riêng, không ghi đã sync.

> **CODEX-ONLY-01 — 12/10/2026:** Theo chỉ định mới của người dùng, toàn bộ task FG chỉ dùng Codex trực tiếp triển khai, review, áp dụng, kiểm thử và chốt. Tắt hoàn toàn việc dùng skill/dashboard/monitor Anti2; không dùng/giao việc cho Antigravity. Không tự bật, khởi động lại hoặc phục hồi cockpit-tools; quyền phục hồi tự động cũ đã bị thu hồi. Nội dung giao Antigravity/model Gemini bên dưới là quy trình lịch sử đã được chỉ định này thay thế. Tiếp tục T30 đang IN_PROGRESS, giữ thứ tự/scope/acceptance/checker/evidence/headed UI/E2E/Telegram và 80 PASS hiện có; không mở T31 trước PASS. Evidence cũ được giữ nguyên; driver mới phải tuân thủ chỉ định này.

> **For agentic workers:** Thực hiện tuần tự, mỗi lần đúng một task theo giao thức dưới đây. Có thể dùng superpowers:executing-plans nếu môi trường có skill; Antigravity không cần skill đó để hiểu tài liệu này. Không tự tạo subagent hoặc chạy task song song.
>
> **Goal:** Build đủ bản ra mắt theo spec, không nhảy nhiệm vụ, không tự bỏ tính năng; mỗi task có kiểm thử và bằng chứng trước khi chuyển tiếp.
>
> **Architecture:** npm workspace, frontend SPA riêng, backend REST/realtime riêng, PostgreSQL là nguồn dữ liệu nghiệp vụ, Redis phục vụ session coordination/queue/presence. LiveKit SFU xử lý media; âm thanh/video không đi qua Socket.IO. Worker backend riêng xử lý notifications/reminders.
>
> **Tech Stack đã chốt ở T00:** Node24, TypeScript, React+Vite, Tailwind, TanStack Query, React Router, NestJS, Better Auth (Discord), Drizzle+PostgreSQL, Redis/BullMQ, Socket.IO, self-hosted LiveKit, Nodemailer, Web Push. Không bổ sung dịch vụ trả phí nếu chưa được người dùng chọn; người dùng chốt trần chi phí trước khi chạy paid tests/chi tiêu, dự toán tại T41.
>
> **Spec:** [01-product-spec.md](./01-product-spec.md). Spec đã duyệt và các quyết định bổ sung ghi trong đó là nguồn chuẩn. Task không được tự ghi đè spec.
>
> **Mockup:** [Lobby desktop/mobile](./mockups/01-lobby-desktop-mobile.png), [phòng nhóm/gọi/live](./mockups/02-group-call-live.png) và [Bảng tin desktop/mobile](./mockups/03-community-feed-desktop-mobile.png). Người dùng đã duyệt tên FG và bố cục/phong cách ba ảnh; ảnh03 duyệt ngày07/10/2026. Bắt buộc đọc [02-frontend-design.md](./02-frontend-design.md). Dữ liệu và logo minh họa không phải asset production.
>
> **Status:** Trạng thái thực thi và task sửa lỗi xem `code/quality/tasks.json` cùng evidence, không suy ra từ checkbox trong tài liệu. Ba task Bảng tin bổ sung dưới đây chưa triển khai; chưa thay ledger hoặc đánh PASS trong lần cập nhật tài liệu này.

### CHAT-CRYPTO-01 — checkpoint mã hóa chat mới, duyệt08/10/2026

- Phạm vi chuẩn ở spec mục17: DM/chat nhóm E2EE chữ/ảnh/reply; Lobby mã hóa lưu trữ bằng khóa server riêng và TLS, giữ quyền public. Mã khôi phục riêng, báo cáo chỉ gửi tin người dùng chọn, người mới không đọc lịch sử nhóm cũ. Không tự E2EE voice/live hoặc chat support/bảng tin trong thay đổi này.
- Khi ghi yêu cầu, T28 IN_PROGRESS. Sau task hiện tại review PASS, review tác động/rebaseline và pin chuỗi `CHATCRYPTO-DATA → CHATCRYPTO-BE → CHATCRYPTO-FE → CHATCRYPTO-QA` trước task tiếp theo chưa bắt đầu; giữ hàng đợi logo/auth/theme/FIX đã có theo quyết định rebaseline, không tự vượt task hoặc chạy song song. Lần này chỉ ghi task đề xuất; chưa sửa dependencies/writeAllowlist/ledger/checker/PASS.

| Checkpoint mới | Scope / outputs trong code/ | Acceptance và evidence trước chuyển tiếp |
| --- | --- | --- |
| CHATCRYPTO-DATA | Contracts/schema/ADR threat model, protocol/library version đã review, envelope/version/key IDs, device verification/key distribution/recovery, group membership epochs, private attachments/reply/mention/report, migration dữ liệu cũ và compatibility | Khóa protocol thực, không custom crypto; DTO không lộ khóa hoặc plaintext; tất cả producer/consumer nằm trong scope; migrate DB trống/có dữ liệu giữ ID/lịch sử/quyền. Chốt backfill lịch sử cũ client-assisted và cutoff, không đánh dấu server-encrypted là E2EE; có blocker thì dừng chuỗi |
| CHATCRYPTO-BE | API/realtime key/ciphertext routing và ACL, Lobby AEAD/rotation/server key management, encrypted objects, backup/migration, report owner/admin và worker notifications | API/DB/object/realtime thật: private ciphertext only, server không giữ private recovery/device keys; không đọc chéo/lấy khóa sau kick/ban/revoke; ciphertext bị sửa bị từ chối; DB backup không kèm master key Lobby; không log/push plaintext; test rotation/restore và failures, không fake success |
| CHATCRYPTO-FE | Client mã hóa/giải mã qua protocol đã duyệt, verify thiết bị/key changes, backup mã khôi phục, ảnh/reply/mention, trạng thái khóa/lỗi/migration, báo cáo xem trước/xác nhận | Headed E2E DM/nhóm giữa user/device thật, add-member không có tin cũ, rejoin không mở khoảng bị loại, revoked device không đọc tin mới; recovery đúng/sai/mất khóa, password reset không bypass; draft/session/reconnect/dedup và theme/mobile360px giữ đúng; không plaintext fallback |
| CHATCRYPTO-QA | Security/integration regression, scans log/bundle/API/object storage/cache, tamper/replay/protocol tests, old-data migration/restore, threat-model verification và bàn giao | Evidence thật đủ encrypt/recovery/report/ACL/legacy flows; review độc lập các rủi ro web/XSS/device/metadata và thư viện, không lấy UI khóa ổ làm bằng chứng E2EE; không PASS còn plaintext cũ hoặc chưa có migration đối soát; không destructive production cleanup để vượt test |

- T39/T42 phải bao phủ spec17; T40 kiểm backup ciphertext, recovery/khóa riêng và rotation/restore; T41 giữ1.000 media concurrent, đo overhead chat, không giảm mục tiêu hoặc giới hạn user hợp lệ để có PASS. Raw logs/test artifacts chỉ ở code/, UI/E2E local headed; mỗi phiên update history.md.

### CHATCRYPTO-BAN-T37-01 — quyết định thứ tự ngày10/10/2026

- Người dùng chốt "để vào task 37": producer ban/unban thuộc T37, không đưa vào prerequisite hay triển khai trong CHATCRYPTO-BE. Giữ thứ tự task hiện hành; T37 chưa bắt đầu.
- Bàn giao T37 dùng route/DTO đã có: PATCH /api/v1/admin/users/:id/ban, AdminUserActionRequestSchema. BAN phải atomic audit/revoke session/đổi private epoch/đóng intervals; UNBAN không phục hồi stale session hoặc quyền đọc khoảng bị ban. Repeated actions idempotent, giữ device/recovery ciphertext, broadcast revoke chỉ sau commit.
- T37 phải có native HTTP/auth/PG/socket và SDK-backed routing/history evidence; kiểm sole-admin/CSRF/latest authority, lock ordering, rollback khi lỗi/race và logout/ban/thu hồi quyền. Không dùng SQL fixture ban như bằng chứng producer đã tích hợp.
- Rebaseline được người dùng xác nhận10/10/2026 sau đề xuất gate: CHATCRYPTO-BE nghiệm thu consumer ACL/latest BAN/session/epoch/revocation bằng native evidence; producer ban/unban atomic thuộc acceptance T37, không còn là điều kiện producer để đóng BE. T37 vẫn phải đạt toàn bộ kiểm thử bàn giao trước release, chưa triển khai/chưa PASS. Giữ lịch sử quyết định ban-producer-t37-decision.json; không gọi SQL fixture là producer thật. Evidence rebaseline: code/quality/evidence/CHATCRYPTO-BE/spec-gate-adoption.json và spec-gate-manifest.json.

### LOADING3D-CHANGE-01 — checkpoint mới LOADING3D-FE, duyệt09/10/2026

- Người dùng yêu cầu đưa demo logo FG3D xoay đủ360 độ quanh trục dọc, nổi nhẹ phía trên thanh progress vào spec/task để **Coding and build 2** triển khai. Spec mục18/design mục14 là nguồn chuẩn; demo [preview R2](../code/scratch/fg-3d-loading-preview/index.html) chỉ tham chiếu chuyển động, không là implementation sản phẩm. SHA256 HTML R2: `1B5D3E6970E688520A6510887D82EB75FCB27356C5E23CD84310D420E92D71F6`; evidence demo ở code/scratch/fg-3d-loading-preview/evidence-r2.json.
- Xếp tuần tự: `CHATCRYPTO-BE → CHATCRYPTO-FE → CHATCRYPTO-QA → LOADING3D-FE → T29`, giữ các gate/FIX đã có. Khi ghi09/10/2026, BE IN_PROGRESS; GAME-LOGO-FE/LIGHT01-FE đã PASS. Không chen vào BE/FE/QA hoặc mở lại task logo/theme đã PASS. Chỉ mở LOADING3D-FE sau CHATCRYPTO-QA review PASS và review tác động/rebaseline có evidence; pin thêm tiền nhiệm GAME-LOGO-FE và LIGHT01-FE, cập nhật dependency T29 trong bước rebaseline được review.
- Lần này chỉ tài liệu/metadata, chưa thêm task vào ledger hoặc sửa checker/writeAllowlist/PASS/frozen hashes. Coding and build 2 rà outputs thuộc owner cũ, pin allowlist assets/shared loading component/app bootstrap hoặc route initial-loading boundaries/tests/evidence trước triển khai; giữ nguyên evidence và các task FIX lịch sử.

| Checkpoint | Scope / outputs trong code/ | Acceptance trước chuyển tiếp |
| --- | --- | --- |
| LOADING3D-FE | Shared loading/skeleton component; dùng logo SVG canonical đã triển khai tại GAME-LOGO-FE và CSS chiều sâu/xoay; tích hợp app bootstrap và tải đầu trang Lobby/DM/nhóm/Bảng tin khi các màn đã tồn tại; semantic light/dark tokens, accessibility/reduced-motion; unit/component và headed UI/E2E; quality/spec-coverage.md và evidence | Logo đúng silhouette, xoay360/6giây, nổi nhẹ và progressbar vô định thay dòng đang tải; chỉ hiển thị khi pending thật, ready/error/cancel không bị màn chờ che; không phần trăm giả, remount form/session/socket hoặc ngắt gọi; keyboard, reduced-motion, tab hidden và mobile360px đạt; build/lint/typecheck package + review/evidence thật |

- Component nhận pending/error/ready từ state hiện có; không tạo API/DB/migration hoặc timer giả hoàn thành. Hiện loader sau150ms pending để tránh nháy, bỏ ngay khi ready/error/cancel, không trì hoãn nội dung cho đủ vòng xoay. Chỉ tải đầu vùng nội dung/app bootstrap; refetch nền hoặc thao tác gửi tin giữ nội dung hiện có và loading nhỏ tại control, không phủ logo lên cuộc gọi/luồng live.
- Error dùng trạng thái lỗi/retry thật của boundary hiện có, không quay vô hạn che lỗi hoặc báo thành công giả. Logo/animation không tự hiển thị plaintext chat hoặc vượt trạng thái khóa/recovery E2EE. Các màn chưa triển khai dùng component này khi đến task sở hữu, không xây màn giả trong checkpoint.
- Tests: pending nhanh/chậm, ready/error/retry/cancel/unmount; role progressbar không aria-valuenow khi vô định và status đọc một lần; reduced-motion không animation, hidden tab dừng animation và trở lại chạy, không layout shift/tràn ngang. Headed API/DB thật kiểm initial loading tại các route đã có, slow network/failure rồi recovery, light/dark, reload, keyboard, desktop1440/1280 và mobile390/360; draft/session/socket/call hiện có không mất. Lưu command/time/exit/log/hash/ảnh thật trong code/, chưa kiểm phần nào ghi rõ.
- T39/T42 thêm hồi quy loader; mọi phiên Coding and build 2 ghi history.md với task ID LOADING3D-FE và evidence. Demo/duyệt hình không là PASS sản phẩm; chỉ chuyển T29 sau checkpoint được review PASS.

### FG-BRAND-LOGO-01 — bổ sung logo/icon FG đã duyệt08/10/2026

- Người dùng chọn ảnh đầu tiên [01 — FG ghép khối](./mockups/fg-logo-concepts/01-monogram.png) và yêu cầu thêm vào task để coding/build thực hiện. Bổ sung scope vào checkpoint GAME-LOGO-FE cùng logo game/sidebar; không tạo task chạy song song, không thay thứ tự gate đang có. Phân biệt logo thương hiệu FG với7 logo game.
- SHA256 ảnh chọn: `3E65406B8C69FF7E67D65D41099CAD8703E8A528F651DCEA7A8940CAE2189934`.
- Dựng asset logo FG sạch dạng SVG paths từ monogram đã chọn: F/G ghép khối, góc cắt, giữ silhouette/tỷ lệ, F trắng trên dark hoặc navy trên light, G xanh FG. Không lấy cả board raster làm logo, không dùng font thay hình đã chọn, không thêm tagline/khung/mascot. Các mẫu02/03 chưa được chọn.
- Runtime assets chỉ trong code/: logo dark/light SVG có nền trong suốt, favicon SVG và ICO16/32/48px; apple-touch-icon180px; PWA icons192/512px và maskable192/512px. Maskable có nền navy đặc và toàn bộ monogram nằm trong vùng an toàn; tối ưu padding để favicon nhỏ vẫn rõ FG.
- Áp dụng shared FG logo vào sidebar72px, header và khung đăng nhập có branding hiện tại; cập nhật favicon/document links và PWA manifest, tên app vẫn FG. Sidebar logo vừa khung40px, không mở rộng rail hoặc thay theme/layout/icon điều hướng; hiện accessible name FG, tránh screen reader đọc lặp. Không đổi API/DB/auth/session vì logo.
- Review tác động/rebaseline có hash ảnh đã duyệt và phạm vi assets/components/manifest/test trước build. Acceptance: đồng nhất hình giữa logo/icon, không méo/cắt/nền caro, đọc rõ16/24/32/40px trên light/dark, tất cả icon URLs trả đúng file/MIME không404, manifest đủ icon và maskable an toàn. Kiểm favicon browser và preview PWA thật trên môi trường hỗ trợ; phần chưa kiểm được báo rõ.
- UI/E2E local headed kiểm sidebar/header/login desktop/mobile360px, đổi theme/reload, không mất draft/session; lưu ảnh/logo/icon previews, command/time/exit/log/hash/evidence thực trong code/. Ghi mỗi phiên vào history.md, không tự đổi PASS từ duyệt mockup.

### GAME-LOGO-01 — yêu cầu logo game và sidebar07/10/2026

- Người dùng yêu cầu tìm và gắn logo7 game; xem spec mục2, design mục1 và [nguồn/logo tham chiếu](./game-logos/README.md). Đã chuẩn bị nguồn trong .doc/, chưa sửa ứng dụng hoặc đánh PASS. Ledger tại thời điểm chuẩn bị đang LIGHT01-FE IN_PROGRESS; giữ task này, không thực hiện task logo song song.
- Sau LIGHT01-FE PASS, review tác động/rebaseline có evidence rồi bổ sung checkpoint GAME-LOGO-FE vào hàng đợi, pin dependencies/writeAllowlist theo thứ tự các task chưa bắt đầu. Không đổi PASS hoặc hash outputs lịch sử để hợp thức hóa yêu cầu mới.
- Scope frontend: local assets trong code/apps/web/public/game-logos/, shared mapping GameTitle, logo sidebar/header Lobby và màn chọn game quan tâm/hồ sơ đã có. Bảng tin dùng shared mapping khi T38-FEED-FE triển khai. Không thay API/DB/gameId, theme hoặc layout đã duyệt.
- Trước tích hợp: xác nhận điều kiện dùng assets từng hãng, sanitize SVG và tối ưu kích thước mà không biến dạng. Dota2 đã có ảnh người dùng cung cấp tại .doc/game-logos/dota-2-user.png (800×800 RGB24); nền caro là pixel thật, cần bản trong suốt/tách nền trước dùng trong UI. Người dùng xác nhận quyền dùng Roblox cho FG ngày07/10/2026; cho phép dùng logo trong mockup06 và bàn giao mapping, không suy ra đã xác minh giấy phép từ hãng hoặc đã triển khai. Không dùng badge Experience cho ngữ cảnh khác.
- Acceptance: đúng game/nguồn, không ảnh hỏng hoặc hotlink, logo rõ trên light/dark/system, tỷ lệ/màu gốc, tên/fallback/a11y vẫn có. Chọn game/route/dữ liệu đang nhập/session không bị ảnh hưởng. Phạm vi thiếu asset/quyền dùng phải được báo rõ, không đánh PASS yêu cầu đủ7 logo nếu chưa đủ.
- UI/E2E headed local kiểm chọn game bằng chuột/bàn phím, reload/theme, ảnh lỗi, sidebar thu và mobile360px; lưu ảnh desktop/mobile và command/time/exit/log/hash evidence thật trong code/. Không mở terminal/log chỉ để trình diễn.
- SIDEBAR-CHANGE-01 cập nhật: người dùng bỏ toggle, chọn sidebar hẹp cố định theo ảnh08; supersede yêu cầu208px mở/local persistence/mockup07. Bổ sung cùng checkpoint GAME-LOGO-FE sau gate/rebaseline: desktop/tablet72px chỉ logos, tooltip/accessibility, mobile drawer theo design mục6. Không mở task song song hoặc coi duyệt hình là PASS.
- Chốt hình thức07/10/2026: [SIDEBAR-COMPACT-APPROVED](./mockups/08-sidebar-fixed-compact-preview.png), SHA256 `45A533F27096B6DEF259DF45AE18793730FFED112161818CC634CAC05AD4B814`. Include ảnh/hash trong review tác động và rebaseline trước build. Phân biệt theo path/key với mockup08 theme sáng; không lấy số08 để lựa chọn nhầm asset. Giữ evidence cũ, không sửa trạng thái PASS hoặc checker trong lần ghi tài liệu này.
- Acceptance bổ sung: không còn nút toggle hoặc chế độ mở rộng, tên đầy đủ ở tooltip/focus và accessible name; chọn đủ7 game bằng chuột/keyboard, trạng thái active rõ, reload giữ bố cục hẹp, responsive1024/1200/360px không tràn. Bố cục không làm mất draft/session/scroll hoặc tạo socket mới. Headed E2E + ảnh sidebar hẹp/mobile thật lưu trong code/. Giữ evidence/test lịch sử; review cập nhật acceptance theo yêu cầu mới, không nới checker.

### FEED-CHANGE-01 — bàn giao yêu cầu duyệt 07/10/2026

- Bảng tin là phần bản ra mắt theo spec mục13 và frontend-design mục10; mockup03 đã duyệt bố cục. Mặc định kỹ thuật được ghi rõ trong spec để implementer không suy diễn tính năng từ ảnh.
- Thêm tuần tự `T38-FEED-DATA → T38-FEED-BE → T38-FEED-FE` sau T38, trước T39. Kế hoạch cơ sở gồm48 checkpoint (45 cũ +3 Bảng tin); các task FIX trong ledger vẫn giữ nguyên thứ tự/quyền review. Tiếp tục xử lý task hiện tại và các blocker, không nhảy sang Bảng tin.
- Trước tiếp tục build, Codex review thay yêu cầu và ghi evidence rebaseline với hash spec/design/task/ba mockup; bổ sung ba task NOT_STARTED cùng dependencies/writeAllowlist vào ledger và cho T39 phụ thuộc T38-FEED-FE. Đối chiếu checker có nhận hash ảnh03; chỉ cập nhật checker để kiểm thêm nguồn mới, không nới kiểm tra cũ. Không tự đổi PASS/hash các task cũ mà không đánh giá tác động và bằng chứng. Việc này cần được ghi nhận là migration baseline do yêu cầu người dùng, không phải tính năng đã pass.
- T03/T05/T07 cũ là nguồn contracts/schema để mở rộng tại T38-FEED-DATA; không triển khai feed ngầm trong task hiện tại. T39 coverage phải gồm mục13; T40 backup/restore gồm bài/ảnh/bình luận; T41 thêm workload API feed mà vẫn giữ nguyên media benchmark; T42 phải có Bảng tin đầy đủ.

## 1. Luật thực thi bắt buộc

### HISTORY-CHANGE-01 — nhật ký mọi phiên coding/build

- HISTORY-CODING2-01 (09/10/2026): chat **Coding and build 2** phải ghi từng phiên vào history.md, tiêu đề có tên chat và ID checkpoint thực. Ghi lúc bắt đầu, cập nhật từng vòng sửa/build/test/review, đóng mục trước báo hoàn tất/bàn giao/blocker. Acceptance bàn giao: có mục history tương ứng, giờ/agent/files/commands/exit code/evidence/kết quả/việc còn lại đầy đủ và khớp ledger; agent trỏ mục vừa ghi. Thiếu history phải bổ sung, không tuyên bố bàn giao đủ.
- Chỉ bổ sung muộn phiên cũ khi có evidence thực và ghi rõ thời gian bổ sung; không tự suy diễn hoặc đổi PASS lịch sử. Đây là tiêu chí tài liệu xuyên task, không mở checkpoint ứng dụng khác, gửi lệnh sang chat hoặc triển khai tự động ghi/checker trong lần này.

- Người dùng yêu cầu07/10/2026: mọi phiên build/sửa lỗi/refactor/cấu hình/migration/test phải ghi vào [history.md](./history.md), kể cả phiên bị ngắt, thất bại hoặc blocked. Đọc các mục gần nhất trước resume; mở mục khi bắt đầu, cập nhật vòng sửa/test/review, chốt thời gian/kết quả/blocker trước bàn giao theo rule11.
- Yêu cầu tài liệu xuyên task: history được phép cập nhật cùng task hiện tại nhưng không mở task khác hoặc sửa trạng thái PASS. Ghi commands đã che secrets, exit code thật, links evidence tại code/. Thiếu test thì ghi chưa chạy, không giả success; giữ lịch sử cũ, đính chính bằng mục mới.
- Bàn giao/review kiểm có mục history của phiên và kết quả khớp evidence/ledger. Nếu allowlist/gate hiện tại chưa cho .doc/history.md thì review tác động/rebaseline phạm vi tài liệu có evidence; không nới checker hoặc sửa PASS lịch sử. Lần này chỉ thêm hướng dẫn, chưa sửa ledger/checker.

### SUPPORT-ADMIN-01 / AUTH-PASSWORD-03 — bàn giao bổ sung

Mockup05 admin dark được người dùng duyệt; spec mục16, design mục13. Task AUTH02-FE đang triển khai ở thời điểm ghi yêu cầu, không làm song song hoặc tự sửa outputs/ledger của task này. Sau task hiện tại review PASS, rebaseline gồm hash mockup05 có evidence và bổ sung AUTH-ADMIN-SINGLE trước task kế tiếp chưa bắt đầu. Trạng thái/allowlist/tiền nhiệm cần pin trong ledger khi migration review; không tự đánh PASS lịch sử.

**AUTH-ADMIN-SINGLE (checkpoint bổ sung):** phạm vi code/packages/contracts/src/auth.ts và tests; code/apps/api/src/modules/auth/ và tests; code/apps/web/src/features/auth/ và tests; provisioning script trong code/scripts/, server-only local configuration; quality/api-contract.md, spec-coverage.md và evidence. Dùng Better Auth cơ chế đã lock, không hardcoded password/email. Provision duy nhất kingame idempotent sau xác minh email người dùng đã chỉ định, userId cố định ADMIN_USER_IDS, bỏ fallback Discord/nhiều IDs. Login chung nhận kingame; không cấp role theo username client. Chưa có mật khẩu đáp ứng policy mới thì không provision tài khoản.

**Policy mới:**8–128 Unicode code points, ít nhất1 chữ hoa Lu và1 dấu câu/ký hiệu P/S, không trim/normalize, whitespace không tính special. Áp dụng FE/BE khi signup/change/reset/attach/provision; login xác minh hash không chặn account cũ vì composition. Không reset/xóa hash user cũ. Mật khẩu kingame đã chỉ định chưa có special; ngoại lệ cũ chỉ độ dài, cần input mới qua local bảo mật, không gửi vào docs/logs. Không chép email riêng người dùng vào tài liệu này.

**Kiểm thử bắt buộc checkpoint:**7/8/128/129 code points; thiếu uppercase/special, whitespace-only special, Unicode chữ hoa/emoji/dấu câu, giữ password nguyên bản; FE/BE consistent, login credential cũ còn dùng; scrypt salted khác nhau và không plaintext; provision retry không duplicate/reset password, account kingame đã tồn tại do người khác thì từ chối, chỉ một ID được admin, Discord/helper/user không nâng quyền. API/DB thật, UI/E2E headed, rate limit sai mật khẩu, revoke/logout/ban, không secrets trong logs/public DTO. Chạy tests phạm vi+lints/typecheck và lưu commands/exit codes/hashes, Codex review rồi mới PASS.

**T36-SUPPORT-DATA (bổ sung trước T37, sau T36):** contracts/schema support_requests, support_messages, support_notes, read cursors/status/audit và migration DB thật; code/packages/{contracts,database}/, tests và quality/api-contract.md/spec-coverage.md/evidence. Chốt form/chat/write ACL và payload user/admin riêng, notes không có trong user response; SUPPORT-AUTH-ONLY-01 (15/10/2026, người dùng chốt): chỉ tài khoản đã đăng nhập được gửi form và chat; khách không gửi/đọc hỗ trợ private, không dùng route login làm quyền đọc/ghi private. Task này không tự triển khai BE/FE hoặc admin provisioning.

**T37 mở rộng BACKEND:** thêm code/apps/api/src/modules/support/, app wiring và test/support.integration.spec.ts; owner/admin APIs, admin inbox/status/notes, realtime private có auth/revoke và unread, receipt sau DB commit. Tests guest/user/helper denied admin, owner-only support, cross-user/id tamper, notes leak, logout/ban/role revoked trên socket/API và status/read idempotency. Không AI tự trả lời. Scope cụ thể chốt allowlist trước task; run integration API/DB thật + lint/typecheck.

**T38 mở rộng FRONTEND:** thêm code/apps/web/src/features/support/, admin support components, navigation, test/support.test.tsx và code/tests/e2e/support.spec.ts. Form góp ý/báo lỗi và chat riêng, hộp thư/admin chat/chi tiết/notes theo mockup05, /admin chỉ admin và không fetch private trước xác thực, labels/nút/login dựa quyền thật. Tests gửi thất bại giữ draft, unread/status server, direct URL/user/helper không lộ notes, guest/revoked cache clear; headed E2E và screenshots desktop/mobile. Admin online chỉ presence thật; tên MinhAnh/số liệu ảnh chỉ mẫu.

Chuỗi bổ sung sau rebaseline: T36 → T36-SUPPORT-DATA → T37 → T38 → các FEED tasks → T39; cập nhật dependencies ledger/bảng khi review migration, giữ các FIX và task khác. T39/T42 cover support/admin/password mới; T40 backup/restore gồm support/notes ACL. Lần này chỉ docs/metadata, chưa tạo account/triển khai code hay đổi PASS.

### THEME-CHANGE-01 — checkpoint LIGHT01-FE, chờ task hiện tại PASS

**LIGHT01-FE — review đóng checkpoint08/10/2026:** giữ nguyên checker và PASS/hash/evidence lịch sử. Audit ownership theo closure T00-REBASE-SUPPORT01: xác minh outputs ngoài owner còn nguyên, các thay đổi theme/Classic thuộc scope đã pin và tests/evidence thật; freeze replacement snapshots khi đóng owner. Pin thêm đúng metadata `code/quality/spec-baseline.json` (amendments THEME/HISTORY/FG-BRAND đã được người dùng yêu cầu) và `code/AGENTS.md` (HISTORY-CHANGE-01 đã xác minh) vào scope output ownership để gate task tiếp kiểm snapshot mới; không sửa nội dung AGENTS hoặc coi logo đã triển khai. Regression frontend và audit required đạt trước chốt. Sau LIGHT PASS, GAME-LOGO-FE được thêm tuần tự, trước T24-FIX1; gate gốc của task kế tiếp bắt buộc đạt.

**THEME-COMPACT-02 — mockup được duyệt và triển khai08/10/2026:** người dùng xác nhận “đúng như vậy đấy làm đi”. Pin scope theme.ts/ThemeProvider.tsx/ThemeSwitcher.tsx/theme.css, apps/web/index.html, apps/web/test/theme.test.tsx, tests/e2e/theme.spec.ts và quality/evidence/LIGHT01-FE/. Bỏ ba-choice acceptance do yêu cầu mới; giữ test lịch sử trong evidence, cập nhật tests sở hữu thành hai-mode contracts với mapping yêu cầu. Test RED → implementation → green: direct toggle/native keyboard/no menu hoặc nhãn hiển thị;44px desktop/mobile; saved/reload/tab sync/storage denied+invalid; legacy system migrate một lần theo màu máy, mặc định dark; before-paint, Classic/reduced motion, composer/auth/socket không đổi; contrast/headed screenshots. Review baseline amendment có ảnh/hash, không đổi historical PASS/outputs/checker. Giữ logo/sidebar checkpoint riêng.

**THEME-COMPACT-02 — yêu cầu08/10/2026:** trong LIGHT01-FE, tạo mockup nút chỉ icon đổi Sáng/Tối; bỏ Hệ thống/menu theo yêu cầu mới, thay acceptance ba chế độ trước đó. Evidence tại `code/quality/evidence/LIGHT01-FE/compact-toggle-preview/`; ảnh chờ người dùng duyệt. Phiên này chỉ tạo preview/ghi nhận tài liệu, không sửa runtime, ledger hoặc spec-baseline. Sau duyệt hình, pin/review migration lưu trữ/mặc định, cập nhật tests kiểm chứng hai chế độ và chạy headed app thật; không sử dụng kết quả tests ba chế độ cũ để đánh PASS mới. Giữ thứ tự task và strict gate hiện có.

User duyệt bản preview FG thật07/10/2026, spec mục15/design mục12. Tại kiểm tra yêu cầu này T03-FIX12 đang IN_PROGRESS, T25 BLOCKED; không thực thi theme song song hoặc vượt gate. Sau task hiện tại/tiền nhiệm review PASS, xử lý rebaseline có evidence và thêm LIGHT01-FE sau các AUTH02 checkpoints đã xếp trước đó, trước khi tiếp tục task kế tiếp. Giữ thứ tự FIX/ledger đang có; cập nhật bảng/ledger khi migration được review, không tự đổi PASS các task cũ. Phê duyệt này cho phép light khác dark palette, vẫn giữ layout/phong cách.

**THEME-VISUAL-02 — cập nhật07/10/2026:** Người dùng chốt LIGHT-SMOKE-APPROVED (mẫu1 Xám khói), thay trắng kem. Theo design mục12, dùng cùng bố cục/Inter/sidebar hẹp và CTA xanh tiết chế. DARK-SMOKE-APPROVED đã được người dùng chốt cùng light ngày07/10/2026. Bộ chọn giao diện mới đang ở bước mockup theo yêu cầu, giữ Sáng/Tối/Hệ thống; chưa có implementation/tests/PASS mới. Bổ sung trong LIGHT01-FE hiện tại theo gate/rebaseline và scope đã pin; phần logo/sidebar vẫn theo checkpoint sở hữu, không thực thi task song song. Lưu hash ảnh, before/after, contrast và headed app thực tế; không đánh PASS từ duyệt mockup.

**Files trong code/:** apps/web/src/features/theme/{theme,ThemeProvider,ThemeSwitcher}.{ts,tsx} theo trách nhiệm; apps/web/src/{App,main}.tsx; apps/web/index.html và bootstrap theme trước paint; apps/web/src/styles/{tokens,global}.css; CSS/components đang có màu hardcoded cần đổi sang semantic (pin đường dẫn vào allowlist trước task); apps/web/test/theme.test.tsx; tests/e2e/theme.spec.ts; quality/spec-coverage.md; quality/evidence/LIGHT01-FE/. Không sửa API/contracts/data/business logic để đổi theme.

**Chuẩn bị Classic — yêu cầu trực tiếp07/10/2026:** cài `@toggles/classic` bằng shadcn trong frontend, pin `apps/web/components.json`, `apps/web/src/components/ui/classic.tsx`, alias TypeScript/Vite và evidence trong LIGHT01-FE. Chỉ thêm component/config; chưa ghép header, chưa chọn mockup bộ chọn, chưa thay baseline hoặc đánh PASS. Cài đặt và kiểm tra lint/typecheck/build có evidence riêng; integration và kiểm thử UI headed thuộc bước tiếp theo sau review hình thức/baseline.

**Triển khai Classic + Xám khói — yêu cầu tiếp theo07/10/2026:** người dùng yêu cầu gắn Classic vào bộ chọn, build light/dark đã chốt. Trong cùng LIGHT01-FE, giữ menu ba lựa chọn, tách SVG Classic để không lồng button, áp palette theo design12, kiểm reduced motion/controlled icon/keyboard và contrast thật. Phạm vi bổ sung `apps/web/src/components/ui/classic.tsx`, utilities Tailwind không preflight trong global CSS; scope/evidence pin trước write. Review/migrate baseline có snapshots và hashes, giữ kết quả/outputs lịch sử; logo/sidebar vẫn ở checkpoint riêng. Mockup bộ chọn chưa chọn được thay bằng review app thật, không tự đánh PASS.

**Deliverable:** app local hiện tại/API DB thật + bộ chọn hoạt động ba giá trị; lưu fg.theme và đồng bộ tabs, storage fallback, system device changes, init trước paint, không remount/query invalidation/auth/socket restart. Rà màu theo spec/design; không mock feature chưa triển khai. Header global hiển thị control ở login; không nhân đôi control gây focus thừa.

- [ ] **RED:** unit hành vi selection/persistence/device changes/storage denied+invalid/multi-tab; một composer chưa gửi giữ nội dung qua chuyển theme và auth provider không bị remount. Unit DOM mock không thay UI headed acceptance.
- [ ] **Build:** implement tokens/initialization/provider/switcher; whitelist theme values và menu keyboard/Escape/focus;44px hit targets; CSS mobile không tràn. Theme chạy được cho guest và user hiện có, không API/migration mới.
- [ ] **PASS kỹ thuật:** npm run test --workspace @fg/web -- test/theme.test.tsx; npm run test:e2e -- tests/e2e/theme.spec.ts --headed; lint/typecheck web; Vite build; evidence commands/time/exit codes/hashes. E2E dùng services thật: đổi/reload/system emulation/storage và keyboard; đo contrast cả themes,360px overflow; guest và authenticated session/composer. Không có auth credential/test account thì ghi phần thiếu thật.
- [ ] **Review hình thức:** mở app local cho người dùng quan sát, lưu screenshots1440×900/1280×800/390×844/360×800 ở evidence, báo URL và limitations. Kỹ thuật PASS không thay user chốt light hình thức; không đánh PASS khi thiếu required evidence. Giữ trình tự Codex review/chốt và T39 regression cả themes.

### AUTH-CHANGE-02 — tài liệu bàn giao, chưa triển khai

**Xác nhận bố cục07/10/2026:** Người dùng “tôi chốt mockup này”; ảnh04-login-desktop-mobile.png đã duyệt. Khi rebaseline AUTH-CHANGE-02, đưa hash ảnh04 vào manifest và kiểm tra baseline bắt buộc bên cạnh ba ảnh cũ, lưu review/evidence; không nới kiểm tra cũ hoặc sửa historical outputs. Không cần hỏi lại bố cục đăng nhập.

Người dùng đã duyệt phạm vi spec mục14, sau đó chỉ định chỉ ghi tài liệu và tạo mockup đăng nhập để chốt trước coding/build. Người dùng đã chốt mockup04 ngày07/10/2026; lần cập nhật này chỉ ghi nhận duyệt, không triển khai hoặc thay ledger/baseline để vượt gate.

Bố cục mockup04 đã duyệt. Sau khi task đang thực hiện được Codex review PASS, bên coding/build lập rebaseline có evidence, thêm tuần tự `AUTH02-DATA → AUTH02-BE → AUTH02-FE` ngay trước task kế tiếp chưa bắt đầu. Giữ task FIX và lịch sử PASS/hash/commands/evidence cũ; không chèn vào task đang chạy. Ba checkpoint bổ sung vào48 cơ sở, tổng51 khi được tích hợp vào bảng/ledger. Không tự biến đề xuất bố cục thành baseline đã duyệt.

| Checkpoint bổ sung | Phạm vi files trong code/ | Deliverable / acceptance / tests |
| --- | --- | --- |
| AUTH02-DATA | packages/contracts/src/{auth,profiles,index}.ts; packages/contracts/test/auth-email.test.ts; packages/database/src/schema/auth.ts và migrations/test chỉ nếu cần; quality/api-contract.md | Khóa DTO discordId nullable, auth endpoints dưới /api/auth theo Better Auth hiện có; dữ liệu email riêng của owner; rà schema credential/verification hiện có, chỉ tạo migration cần thiết giữ dữ liệu Discord. Contract tests, producers/consumers tương thích và migration DB thật nếu có. |
| AUTH02-BE | apps/api/src/modules/auth/; guards/hook session/ban liên quan; mail adapter trong API; apps/api/test/auth-email.integration.spec.ts; cấu hình SMTP/check-env và package manifest nếu cần; quality/api-contract.md | Enable email/password, verification24h/reset1h,8–128 có1 chữ hoa+1 ký tự đặc biệt theo AUTH-PASSWORD-03, không trim/normalize, scrypt, rate limit, email trùng generic, reset revoke, xác minh mới để thêm mật khẩu vào user hiện có. SMTP thật; thiếu credential/test recipient ghi blocker. DB/API integration kiểm hash/salt, replay/expiry/race, ban/session, ownership liên kết, log redaction và hồi quy Discord. Không tự ghép email hoặc setPassword endpoint thiếu xác minh. |
| AUTH02-FE | apps/web/src/features/auth/ và router/CTA login/account settings liên quan (chốt allowlist cụ thể trước task); apps/web/test/auth-email.test.tsx; tests/e2e/auth-email.spec.ts; quality/spec-coverage.md | Login/register/verify/resend/forgot/reset/change/add-password dùng DTO/API thật, giữ FG và mockup04 đã duyệt. Unit tests form/error/pending/accessibility; headed E2E nhiều user + SMTP test được chỉ định, onboarding/Discord regression, ảnh thật1440/1280/390/360. Không fake email success, token vào logs hoặc snapshot che lỗi. |

Mỗi checkpoint viết test RED hành vi → implementation → tests PASS + lint/typecheck + Codex review + evidence command/time/exitCode/hashes; chưa đủ bằng chứng không mở checkpoint sau. T39/T42 bổ sung nghiệm thu hai phương thức; T40 chứng minh HTTPS, disk/backup encryption và restore bằng evidence vận hành thật, không tuyên bố đã đạt từ feature test. Update mọi chỗ Discord-only trong docs/rules/CTA theo AUTH-CHANGE-02; AUTH-CHANGE-01 giữ như lịch sử bị thay thế, không xóa dấu vết.

1. Working directory triển khai luôn là `E:\FGweb\code`. Chỉ đọc tài liệu ngoài thư mục này. Mọi source, tests, package manifests, lockfiles, configs, migrations, Docker/Caddy, scripts, .env, runtime assets, logs, build outputs và browser-test artifacts phải nằm trong `code/`.
2. Ngoài `code/`, chỉ được sửa tài liệu trong `.doc/` khi có thay đổi yêu cầu do người dùng xác nhận hoặc cập nhật trạng thái task. `.agents/rules/*.md` và `AGENTS.md` là metadata hướng dẫn agent được người dùng yêu cầu; chỉ cập nhật theo yêu cầu, không chứa logic/cấu hình ứng dụng. Không tạo package.json, node_modules, scripts hay scaffolding ở `E:\FGweb` hoặc `.doc/`.
3. Thứ tự đúng là **T00 → T01 → T02 → … → T16-FE → T17-BE → T17-FE → … → T42** theo bảng trong file. Không skip, không chạy đồng thời, không tự tick task tiền nhiệm. Một task BLOCKED/FAILED thì dừng tiến trình ở task đó, báo lý do và phần cần người dùng cung cấp.
4. T00 là gate review cụ thể, không phải quyền để tự thay đổi sản phẩm. T01 cài thư viện; T02 cấu hình APIs/dịch vụ và smoke test. Chỉ sau hai task này PASS mới viết code nghiệp vụ. Manifest, cấu hình bootstrap và probes phục vụ cài đặt là ngoại lệ chuẩn bị cần thiết, không được chèn chức năng vào đó.
5. Đầu mỗi task: đọc spec, quyết định T00, mô tả task, test và ledger; chạy `npm run task:check -- <ID>` sau khi script đã tồn tại. T00–T02 dùng checklist thủ công cùng bằng chứng cho đến khi gate script được cài.
6. Không mock production, không trả success giả, không ghi TODO thay implementation, không comment-out tests, không dùng skip/only để giả pass, không bỏ kiểm thử media/thiết bị thật rồi tuyên bố hoàn thành.
7. Với code nghiệp vụ: viết test mô tả hành vi cần đạt, chạy chứng minh fail vì thiếu hành vi, triển khai vừa đủ, chạy lại pass. Lỗi cài thư viện/import không được dùng làm bằng chứng RED hành vi. Test DB phải dùng PostgreSQL thật; tests SDK mocked không thay integration SFU.
8. Chỉ sửa files task đang cho phép. Nếu cần thêm file/phạm vi, ghi lý do và xác định task sở hữu trước khi đổi; không tự refactor phần không liên quan. Sửa lỗi trong task trước phải cập nhật lại bằng chứng các task phụ thuộc bị ảnh hưởng.
9. Sau mỗi task, chạy test riêng, lint/typecheck package thay đổi và kiểm tra diff/path/spec hash. Ghi log lệnh, exit code, timestamp, file hashes, phạm vi thay đổi và test results. Chỉ PASS khi tất cả kiểm tra bắt buộc thành công.
10. Thay spec hash khiến gate dừng. Nếu người dùng thay yêu cầu: sửa spec có changelog/xác nhận, cập nhật task/contract/tests tương ứng rồi tái lập baseline; không tự “nới spec cho test qua”.
11. Secret ở `code/.env.local` phải được ignore ngay tại T01. Không in key/token/password trong log/chat, không prefix secret bằng VITE_, không commit secrets. API keys phía backend, frontend chỉ nhận public origin/key cần thiết như VAPID public key.
12. Không tự mua dịch vụ, đăng ký tài khoản thay người dùng, gửi email cho người khác hoặc publish production. Có thể kiểm tra read-only cấu hình hiện có; thiếu tài khoản/keys/test device thì ghi BLOCKED, không fabricate.
13. Sau task PASS: báo “ID — kết quả — files — kiểm thử — còn thiếu gì”, rồi chuyển đúng task tiếp theo. Có Git thì lưu checkpoint với files trong task, không dùng `git add .` để gom thay đổi ngoài phạm vi. Không mở nested repo nếu đã có repo cha.
14. Không tuyên bố đạt 1.000 gọi/live dựa trên test 1.000 socket chat, mock load, kết quả của nhà cung cấp hoặc máy local nhỏ. T41 phải có bằng chứng trên cấu hình triển khai đo được.

### Quan sát kiểm thử trực tiếp — TEST-VISIBILITY-01 (07/10/2026)

Người dùng điều chỉnh ngày07/10/2026: chỉ UI tương tác trên ứng dụng và E2E local phải hiện cửa sổ browser/app để quan sát thao tác thật, gồm các vòng RED/sửa lỗi/regression thuộc loại này. Chạy headed (`npm run test:e2e -- --headed`, hoặc thêm `--headed` vào lệnh suite cụ thể); không sửa timeout/assertion để trình diễn. Không cần hiện terminal/log cho bất kỳ loại test nào. Unit/component test DOM giả lập, integration/API/DB/smoke/load được chạy nền, không cần cửa sổ browser giả.

Evidence vẫn bắt buộc cho mọi test: command/time/exitCode/hashes/logs của chính lần chạy đó; với UI/E2E thêm ghi nhận cửa sổ quan sát hoặc lý do không hiển thị. Launcher/logger nếu cần nằm code/ và có phạm vi task cho phép; giữ exit code test khi tee log, không lộ secret. Người dùng cho phép mở browser/app phục vụ UI/E2E; terminal/helper không cần hiện. Không tự bật watch vô hạn hoặc task song song. UI/E2E không có GUI/CI hoặc công cụ không mở được cửa sổ thì báo trước và ghi hạn chế; headless không được tính đạt quan sát trực tiếp local. Các test khác chạy nền không vi phạm tiêu chí này. Không đánh PASS task hoặc nới chất lượng test chỉ vì thay yêu cầu.

### Trạng thái và bằng chứng

- `NOT_STARTED → IN_PROGRESS → PASS`, hoặc `IN_PROGRESS → FAILED/BLOCKED`. Sau sửa lỗi quay lại IN_PROGRESS rồi chạy kiểm tra. Không có trạng thái “bỏ qua”.
- Ledger `code/quality/tasks.json`: mỗi task có id, status, dependencies, specSha256, inputsHash, outputsHash, commands với exitCode, evidencePaths, startedAt/completedAt, blockers.
- Evidence: `code/quality/evidence/<ID>/`; không lưu credential hay private user content thật.
- `code/quality/spec-coverage.md`: requirement → task(s) → test(s) → evidence. Requirement chưa có test/bằng chứng không được đánh hoàn thành.
- Tự động gate là hỗ trợ kiểm tra, không thay review: không sửa checker, ledger hoặc baseline để hợp thức hóa task chưa làm.

## 2. Thư mục và trách nhiệm

```text
E:/FGweb/
  AGENTS.md                     # hướng dẫn workspace
  .agents/rules/                # rules native Antigravity
  .doc/
    01-product-spec.md           # nguồn yêu cầu sản phẩm
    task.md                     # kế hoạch này
    02-frontend-design.md        # tên FG, màu/font/layout đã duyệt
    03-antigravity-rules.md      # cách nạp rules và prompt khởi động
    mockups/                    # ảnh, prompt và ghi chú thiết kế
  code/                         # vùng duy nhất cho mã nguồn/cấu hình/test
    AGENTS.md                   # lặp lại luật code-only + task gates
    package.json
    package-lock.json
    .npmrc
    .env.example
    .env.local                  # không commit
    apps/
      web/                      # @fg/web: frontend React
      api/                      # @fg/api: NestJS REST/realtime, authorization
      worker/                   # @fg/worker: backend jobs/delivery
    packages/
      contracts/                # @fg/contracts: Zod schemas/DTO/event names
      database/                 # @fg/database: Drizzle schema/migrations/repositories
    infra/                      # Docker, HTTPS, LiveKit, Redis/Postgres configs
    scripts/                    # env/service/gate/deploy/backup checks
    tests/
      e2e/
      load/
    quality/                    # baseline/ledger/reports/evidence/runbook
    .cache/                     # caches/install browser artifacts của dự án
    .runtime/                   # local DB, Redis, uploads và dữ liệu thử
```

Tất cả đường dẫn task dưới đây tương đối với `E:/FGweb`; mọi lệnh chạy từ `E:/FGweb/code`. Các nhóm file dùng `{a,b}` là danh sách file/thư mục riêng, không phải một file tên có dấu ngoặc.

**Phân lớp:** FE không truy cập DB hoặc giữ server secret. BE enforce toàn bộ quyền, capacity, ownership và transaction. Database sở hữu schema/migrations/query constraints; FE/BE dùng contracts đã khóa. Worker là backend, không là frontend. Infra không có code nghiệp vụ.

## 3. Dependencies và API phải chuẩn bị trước tính năng

### Thư viện dự án — cài tại T01

| Workspace | Dependencies |
| --- | --- |
| web | react, react-dom, react-router-dom, @tanstack/react-query, @fontsource/inter, better-auth client, socket.io-client, livekit-client, lucide-react, tailwindcss, @tailwindcss/vite, zod |
| api | @nestjs/common, @nestjs/core, @nestjs/platform-express, @nestjs/config, @nestjs/websockets, @nestjs/platform-socket.io, reflect-metadata, rxjs, better-auth, drizzle-orm, pg, socket.io, @socket.io/redis-adapter, ioredis, bullmq, livekit-server-sdk, helmet, multer, sharp, zod |
| worker | bullmq, ioredis, drizzle-orm, pg, nodemailer, web-push, zod |
| database/contracts | drizzle-orm, pg, zod |
| development/testing | typescript, vite, @vitejs/plugin-react, vite-plugin-pwa, workbox-window, drizzle-kit, tsx, ts-node, jest, ts-jest, supertest, vitest, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, @playwright/test, eslint, typescript-eslint, @types/* cần thiết |

Không dùng Arctic vì tài liệu hiện ghi deprecated. Dùng Better Auth Discord provider và Drizzle adapter. Không dựng lại OAuth thủ công.

T01 chọn phiên bản **stable không prerelease**, NestJS12 theo docs hiện tại, TypeScript tương thích toàn toolchain; kiểm peer deps/engines, khóa exact versions bằng lockfile và ghi version thực tế. LiveKit/Postgres/Redis/Caddy Docker images khóa version/digest, không dùng `:latest`. Dự kiến PostgreSQL17 và Redis7. Phiên bản chỉ được đổi cùng compatibility test; không cài thêm framework giữa task mà không cập nhật inventory.

Không cài CLI global cho dự án. Playwright browsers và LiveKit CLI load-test binary đặt trong `code/.cache` hoặc `code/tools`; npm cache cấu hình `code/.cache/npm`. Docker engine/Node đã có trên máy; kiểm daemon/WSL trước T01. Nếu thiếu công cụ hệ thống, báo nhu cầu cài riêng, không tự đặt code ngoài thư mục.

### APIs/dịch vụ — cấu hình tại T02

| Dịch vụ | Chuẩn bị | Smoke trước code nghiệp vụ |
| --- | --- | --- |
| PostgreSQL/Redis | connection URLs; local compose và persistence | connect, ping, tạo/xóa dữ liệu probe riêng |
| Discord OAuth | client ID/secret, callback `/api/auth/callback/discord`, scopes identify/email | đối chiếu app/redirect/scopes; không gọi token giả thành pass |
| LiveKit | ws/public URL, API key/secret, signed webhook URL, TURN/TLS | server health, create/delete test room, issue probe token; real tracks kiểm T28–T30 |
| Email SMTP | host/port/TLS, sender, credential, mailbox test của người dùng | Nodemailer verify kết nối/auth; delivery thật kiểm T35 |
| Web Push | VAPID public/private keys, contact, HTTPS origin | keys hợp lệ và config; push thực tế kiểm T35–T36 sau service worker |
| YouTube/Twitch | iframe embed domains, Twitch parent bằng hostname thực tế | iframe providers reachable; manual embed proof T32, không cần Data API/Helix cho embed cơ bản |

API là dịch vụ được đăng ký/cấu hình/tích hợp, không phải “thư viện cần cài”. Không cần Riot/Steam/game account APIs vì rank/tên game là người dùng tự khai.

Env tối thiểu: DATABASE_URL, REDIS_URL, PUBLIC_ORIGIN, BETTER_AUTH_URL, BETTER_AUTH_SECRET, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, UPLOAD_ROOT. UPLOAD_ROOT trỏ vào runtime volume của dự án.

Scripts root phải được T01–T02 cung cấp: `lint`, `typecheck`, `build`, `test`, `verify`, `test:e2e`, `env:check`, `services:smoke`, `task:check`, `verify:staging`, `backup:test`, `restore:test`, `load:api`, `load:chat`, `load:media`, `load:network`. Scripts thuộc task chưa làm phải fail với “not implemented”, không trả exit0 giả. Test workspace: frontend/database/contracts/worker dùng Vitest run; api dùng Jest/ts-jest và Supertest. E2E dùng Playwright với backend/DB/services thật.

## 4. Quy tắc sản phẩm và quyết định T00

### Bất biến đã chốt — mọi task đều phải giữ

- Tên website FG; frontend giữ thiết kế đã duyệt theo 02-frontend-design.md, dùng Inter self-host và shared tokens/components. Không tự đổi phong cách giữa các task.
- 7 game, **một Lobby/game**, chat tìm bạn và tán gẫu; “+1 flex” là ví dụ, không là cú pháp.
- Guest xem Lobby/thẻ; tương tác cần Discord login; onboarding không bắt rank.
- Cards cạnh chat desktop, mobile tabs; rank/vai trò tham khảo, chủ đội duyệt.
- Kết bạn hai chiều; DM không cần friendship; có block/report.
- Room lâu dài giữ chat, có public/private, tùy chỉnh lời mời và từng quyền helper.
- Mỗi user một đội chơi ngay đang hoạt động; nhiều room và nhiều request được giữ, accept một đội hủy request chơi-ngay khác.
- Chủ đội/helper đúng quyền duyệt người xin tham gia buổi chơi; spectator không chiếm roster slot.
- End/leave team khác leave call và leave room. Chủ phòng transfer/dissolve, helper không ownership.
- Nhiều nhóm gọi/room; member-only;10 người/call tính cả viewers; viewers tự mic, có volume/local mute.
- Max3screen publishers/call; một video chính;720p30 thích ứng mạng; ưu tiên audio.
- PC share, mobile mic/view; cả screen share và YouTube/Twitch; không camera/recording.
- Last participant leaves thì call closes, room/history vẫn giữ.
- IN_APP/PUSH/EMAIL tùy chọn riêng; PWA iOS push16.4+ installed + explicit consent.
- Đủ tính năng ngay v1;1.000 người gọi/live đồng thời; không giảm mục tiêu xuống200 để giảm chi phí.

### Quyết định mặc định đã được người dùng phê duyệt tại T00

Toàn bộ các mục đề xuất đã được người dùng chốt với câu trả lời "tôi chốt" ngày 04/10/2026. Spec và các task đã được cập nhật đồng bộ trước T01.

| Hạng mục | Quy định đã chốt |
| --- | --- |
| Giao diện — ĐÃ DUYỆT | Tên FG; giữ bố cục, màu và typography ba mockup theo 02-frontend-design.md. Không hỏi lại hoặc tự redesign; ảnh minh họa không là asset có license |
| Tech stack | Stack mục 3; media self-hosted LiveKit có thể nhiều node theo benchmark, chưa chọn/mua VPS |
| Room lâu dài | Max50member/room; playerCapacity (tổng quy mô đội gồm chủ đội) do owner chọn1–10; đây không phải giới hạn game chính thức |
| Thẻ từng game | gameId, free-text mode, title, playerCapacity (tổng đội gồm chủ đội), now/scheduledAt, requirementText; Roblox thêm experienceName/URL; rank/role không hard gate |
| Phòng private | Chuyển PRIVATE đóng public recruitments; không đổi member/history |
| Lời mời | OWNER_APPROVAL mặc định; ROOM invite chỉ vào phòng; PLAY_SESSION invite mới xét roster/active slot |
| Lịch hẹn | Người đã duyệt giữ chỗ hẹn; start thủ công bởi owner/helper có quyền MANAGE_RECRUITMENT, giờ hẹn không tự start, cấp active slots atomic; nếu bất kỳ conflict thì chưa start, không tự loại người khỏi đội khác |
| Call | Một user ở một call tại một thời điểm; vào call khác cần rời call cũ; xem không khóa active team slot |
| Disconnect | Explicit leave đóng call ngay khi trống; mất mạng grace30s, sau đó cleanup/reconcile; heartbeat15s, presence TTL45s |
| Live ngoài | Một source/call do current member đặt; viewers chọn tab phía mình; không sync playback và không relay qua SFU |
| Notifications | In-app/push cho DM, mentions, friend/team invitations, requests/results, reminders; email cho lời mời (bạn bè, đội/phòng) và reminders; reminder trước10phút; không mỗi tin Lobby |
| Block | Chặn DM/invite mới; Lobby ẩn nội dung từ người bị chặn ở phía người chặn; không tự kick khỏi room hoặc xóa lịch sử |
| Upload | JPG/PNG/WebP tối đa5MiB và20MP, re-encode WebP; attachment quyền theo conversation; không SVG/GIF trong v1 |
| Hiệu năng | p95 REST<500ms, p95 chat delivery<1s, p95 call join<3s, lỗi<1%, audio packet loss<2% trong bài tải; chất lượng âm thanh cần nghe thật |
| Chi phí | Dự toán từ traffic/egress/TURN đo được; người dùng chốt trần chi phí trước khi chạy paid tests và chi tiêu vận hành sau khi thấy dự toán |

### Review focus — phải có test sở hữu

1. Duyệt/mời/start đồng thời không cấp cùng user vào hai đội hoặc vượt last slot — T22/T23/T24.
2. Cookie/socket/SFU/token cũ khi logout/ban/kick hoặc rời private room không lấy lại quyền trái phép — T08/T12/T26/T29/T37/T39.
3. Room membership, roster và call membership tách biệt; viewer không occupied, end team không mất room — T24/T27/T28.
4. Webhook mất/trùng/đến muộn và reconnect không tạo ghost seat hoặc đóng nhầm call — T27.
5. Opt-out/channel permission, retries và thay đổi ACL không gửi duplicate hoặc lộ private content — T33/T35/T36.

## 5. Contracts và data flow cho implementer

- Business REST prefix `/api/v1`; Better Auth `/api/auth/*`; Socket.IO path `/socket.io`; LiveKit WSS riêng. Vite dev proxy và production reverse proxy giữ auth/api cùng origin.
- ID là opaque string; timestamp UTC ISO8601. UI hiển thị Asia/Bangkok mặc định. Chat cursor là cặp createdAt/id, page50, stable order.
- DTO ở `packages/contracts/src`: UserSummary, ProfileDTO, GameDTO, MessageDTO, RoomDTO, RoomSettingsDTO, Permission, PlaySessionDTO, RecruitmentDTO, JoinRequestDTO, InvitationDTO, CallGroupDTO, CallJoinDTO, ExternalLiveDTO, NotificationDTO, NotificationPreferencesDTO, ReportDTO, Page<T>.
- Permission: MANAGE_CHAT, MANAGE_CALLS, MANAGE_RECRUITMENT, MANAGE_MEMBERS. Owner implicit all, OWNER_TRANSFER/ROOM_DISSOLVE không cấp helper. Role ADMIN website riêng.
- Room.visibility PUBLIC/PRIVATE; invitePolicy OWNER_APPROVAL/DIRECT_MEMBER. InviteTarget ROOM/PLAY_SESSION; PlaySession state SCHEDULED/ACTIVE/ENDED; Recruitment OPEN/CLOSED; JoinRequest PENDING/ACCEPTED/REJECTED/CANCELLED; CallGroup OPEN/CLOSED.
- Response error `{code,message,requestId}`: LOGIN_REQUIRED401, FORBIDDEN403, NOT_FOUND404, CAPACITY_FULL409, ACTIVE_PLAY_CONFLICT409, CALL_CLOSED409, PUBLISH_LIMIT409, INVALID_INPUT422, RATE_LIMITED429. Không dùng HTTP200 báo business error.
- REST mutations authorize server-side; realtime event chỉ phát dữ liệu sau DB commit, không tự gán quyền. Socket event names: message.created/message.deleted, presence.changed, recruitment.updated, team.updated, room.updated, call.updated, notification.created/notification.read.
- Business endpoints nhóm: /me, /users/:id/profile, /games, /conversations/:id/messages, /uploads/images, /attachments/:id, /friends/requests, /friends, /direct-conversations, /blocks, /rooms, /recruitments, /join-requests, /invitations, /play-sessions, /calls, /notifications, /push/subscriptions, /reports, /admin/reports, /admin/users. T03 ghi đủ method/request/response/auth vào api-contract.md trước khi implement.
- OAuth→session→onboarding; Lobby history REST + WS merge; recruit approve DB transaction→active slot + room membership→outbox→clients. ROOM invitation không phải team admission.
- Call join session/ACL→atomic reservation→LiveKit token→SDK connect→signed webhook confirmation. Expired reservation cleanup. Media quota/permissions phải enforce server/SFU, không chỉ hide buttons.
- LiveKit webhook/auth APIs kiểm signature/token membership, refresh current permissions; test rejoin/replay thực tế. Nếu platform không đáp ứng rule revoke, giữ task BLOCKED để sửa thiết kế, không bỏ test.
- DB models được phân theo T04–T07; Better Auth schema theo generator của version đã lock. Domain deletes theo lifecycle; room/session history không cascade-xóa bởi end call/end game.

## 6. Các task nhỏ — làm đúng thứ tự

Chu kỳ mỗi task: kiểm tiền nhiệm/path/hash → viết test và chạy RED → build → test PASS + lint/typecheck package → lưu evidence/ledger và review checkpoint. T00–T02 dùng kiểm tra chuẩn bị thay cho RED nghiệp vụ. Quy trình này áp dụng cho mọi task, không được bỏ các bước vì không lặp lại trong từng mục.

Mỗi task dưới đây là một checkpoint độc lập. Files và tests được chỉ rõ; triển khai bodies dựa contract chứ không sao chép code từ ảnh. Những task frontend chỉ pass khi UI và endpoint tương ứng hoạt động đúng; MSW/test adapters chỉ dùng trong unit tests, không đóng vai API production.

| ID | Phần | Task | Tiền nhiệm |
| --- | --- | --- | --- |
| T00 | SPEC / UI | Chốt baseline spec và mockup | Không có — bắt đầu tại đây |
| T01 | SETUP | Cài toàn bộ dependencies và môi trường local | T00 |
| T02 | SETUP / API | Cấu hình dịch vụ ngoài, smoke test và bộ chặn nhảy task | T01 |
| T03 | CONTRACT | Khóa kiểu dữ liệu, REST và realtime trước triển khai | T02 |
| T04 | DATABASE | Schema identity, hồ sơ và danh mục game | T03 |
| T05 | DATABASE | Schema chat, quan hệ bạn bè và chặn | T04 |
| T06 | DATABASE | Schema phòng, quyền, buổi chơi và tuyển đội | T05 |
| T07 | DATABASE | Schema cuộc gọi, thông báo và quản trị | T06 |
| T08 | BACKEND | Đăng nhập Discord và session guard | T07 |
| T09 | FRONTEND | Đăng nhập, đăng xuất và guest guards | T08 |
| T10 | BACKEND | API hồ sơ và sở thích game | T09 |
| T11 | FRONTEND | Hồ sơ, chỉnh sửa và tích hợp onboarding thật | T10 |
| T12 | BACKEND | Lịch sử Lobby và chat chữ realtime | T11 |
| T13 | FRONTEND | Khung Lobby desktop/mobile và chat chữ | T12 |
| T14 | BACKEND | Gửi ảnh, reply và mention | T13 |
| T15 | FRONTEND | Ảnh, emoji, reply và mention trong chat | T14 |
| T16 | BACKEND | Online và trạng thái tự chọn | T15 |
| T16-FE | FRONTEND | Danh sách online và trạng thái tự chọn | T16 |
| T17-BE | BACKEND | Kết bạn, nhắn riêng và chặn | T16-FE |
| T17-FE | FRONTEND | Bạn bè và nhắn riêng từ Lobby/hồ sơ | T17-BE |
| T18 | BACKEND | Phòng lâu dài, member và ownership | T17-FE |
| T19 | FRONTEND | Danh sách phòng, chat nhóm và quản lý owner | T18 |
| T20 | BACKEND | Tạo thẻ, bộ lọc và gợi ý đội thiếu người | T19 |
| T21 | FRONTEND | Thẻ tuyển và tạo đội cạnh Lobby | T20 |
| T22 | BACKEND | Xin vào đội và duyệt atomic chống trùng | T21 |
| T23 | BACKEND | Lời mời theo cài đặt và quyền của moderator | T22 |
| T24 | BACKEND | Buổi hẹn giờ, roster, rời và kết thúc | T23 |
| T25 | FRONTEND | Yêu cầu, lời mời, roster và cài đặt phòng | T24 |
| T26 | BACKEND | Tạo nhóm gọi và admission tối đa 10 người | T25 |
| T27 | BACKEND | Webhook, reconnect và tự đóng nhóm gọi | T26 |
| T28 | FRONTEND | Vào gọi, mic và âm lượng riêng | T27 |
| LOADING3D-FE | FRONTEND | Logo FG3D xoay/nổi và skeleton progressbar theo LOADING3D-CHANGE-01 | CHATCRYPTO-QA; GAME-LOGO-FE; LIGHT01-FE; rebaseline review |
| T29 | BACKEND | Cấp quyền phát màn hình và moderation cuộc gọi | LOADING3D-FE (sau chuỗi CHATCRYPTO đã pin) |
| T30 | FRONTEND | Live màn hình, chọn luồng và thích ứng chất lượng | T29 |
| T31 | BACKEND | Nguồn live ngoài và kiểm tra URL | T30 |
| T32 | FRONTEND | Xem YouTube/Twitch trong phòng | T31 |
| T33 | BACKEND / WORKER | Outbox và thông báo trong website | T32 |
| T34 | FRONTEND | Inbox và tùy chọn từng kênh | T33 |
| T35 | BACKEND + WORKER | Web Push, email và nhắc lịch | T34 |
| T36 | FRONTEND / PWA | Cài màn hình chính và permission flow | T35 |
| T37 | BACKEND | Báo cáo, xử lý vi phạm và admin website | T36 |
| T38 | FRONTEND | Báo cáo, block và trang quản trị | T37 |
| T38-FEED-DATA | CONTRACT / DATABASE | Contracts, schema và migrations Bảng tin | T38 |
| T38-FEED-BE | BACKEND | API bài, ảnh, thích, bình luận và moderation | T38-FEED-DATA |
| T38-FEED-FE | FRONTEND | Bảng tin desktop/mobile theo mockup03 | T38-FEED-BE |
| T39 | QA | Hồi quy end-to-end và đối chiếu toàn spec | T38-FEED-FE |
| T40 | OPS | Staging HTTPS, backups và cấu hình triển khai | T39 |
| T41 | QA / PERFORMANCE | Kiểm thử 1.000 người gọi/live và dự toán | T40 |
| T42 | RELEASE | Chốt bản ra mắt và bàn giao | T41 |

### T00 — Chốt baseline spec và mockup

**Phần:** SPEC / UI. **Files:** E:/FGweb/.doc/01-product-spec.md; E:/FGweb/.doc/02-frontend-design.md; E:/FGweb/.doc/task.md; E:/FGweb/.doc/mockups/

**Tạo cho task sau:** Không có quyết định sản phẩm quan trọng còn mở; lưu xác nhận người dùng và SHA-256 spec trong code/quality/spec-baseline.json.

- [ ] **RED / kiểm tra cần có:** Đối chiếu spec, 02-frontend-design.md và xác nhận tên FG/UI đã có, 7 game, 1.000 người gọi/live, giới hạn 10/3 và 720p30; nếu còn đề xuất nghiệp vụ/stack chưa xác nhận thì BLOCKED, không sang T01; không hỏi lại tên FG và mockup đã duyệt.
- [ ] **Build:** Tên FG và mockup đã được người dùng duyệt; lưu bằng chứng này, chỉ xác nhận các điểm nghiệp vụ/stack chưa chốt trong bảng; cập nhật spec chỉ theo xác nhận đó. Không tự ghi đồng ý thay người dùng.
- [ ] **PASS:** Kiểm tra thủ công sự nhất quán spec ↔ mockup ↔ task; mọi thay đổi baseline có lý do và xác nhận.

### T01 — Cài toàn bộ dependencies và môi trường local

**Phần:** SETUP. **Files:** code/package.json; code/package-lock.json; code/.npmrc; code/apps/{web,api,worker}/package.json; code/packages/{contracts,database}/package.json; code/infra/compose.local.yml

**Tạo cho task sau:** npm workspace chạy được; thư viện được khóa phiên bản; PostgreSQL/Redis/LiveKit sẵn sàng; trình duyệt test được cài.

- [ ] **RED / kiểm tra cần có:** npm ci thành công từ lockfile; npm ls không có peer dependency invalid; kết nối Postgres/Redis, LiveKit health; ghi phiên bản package và image digest.
- [ ] **Build:** Chỉ tạo manifest/cấu hình tối thiểu, cài danh sách ở mục 3 trước logic tính năng. Khởi động Docker local, dùng bind mounts code/.runtime. Chưa tạo tính năng hoặc UI mẫu giả lập sản phẩm.
- [ ] **PASS:** npm ci; npm ls; docker compose -f infra/compose.local.yml up -d; docker compose -f infra/compose.local.yml ps

### T02 — Cấu hình dịch vụ ngoài, smoke test và bộ chặn nhảy task

**Phần:** SETUP / API. **Files:** code/.env.example; code/.env.local; code/scripts/{check-env,smoke-services,verify-task}.mjs; code/quality/{tasks.json,dependency-lock.md}; code/AGENTS.md

**Tạo cho task sau:** npm run env:check; npm run services:smoke; npm run task:check -- Txx; task ledger và quy tắc code-only.

- [ ] **RED / kiểm tra cần có:** Test check-env từ chối thiếu keys nhưng không in bí mật; task-check từ chối task chưa đủ tiền nhiệm, spec đổi hash, đường dẫn ngoài code hoặc exit != 0. Discord chứng minh cấu hình client/callback; SMTP verify không gửi email. Không giả vờ đã test đăng nhập/push end-to-end.
- [ ] **Build:** Đọc/duy trì AGENTS.md đã chuẩn bị và .agents/rules theo .doc/03-antigravity-rules.md, không overwrite để xóa giới hạn. Đăng ký Discord OAuth; cấu hình LiveKit, SMTP, VAPID và PUBLIC_ORIGIN. Viết script chỉ sau dependencies đã cài. verify-task kiểm tra task trước, bằng chứng mới, SHA spec và file allowlist, không tự đánh PASS.
- [ ] **PASS:** npm run env:check; npm run services:smoke; npm run task:check -- T03

### T03 — Khóa kiểu dữ liệu, REST và realtime trước triển khai

**Phần:** CONTRACT. **Files:** code/packages/contracts/src/{common,auth,profiles,messages,rooms,teams,calls,notifications,moderation}.ts; code/packages/contracts/test/contracts.test.ts; code/quality/api-contract.md

**Tạo cho task sau:** Exports Zod schemas, DTO types, ErrorCode, SocketEvents và API contract version 1.

- [ ] **RED / kiểm tra cần có:** contracts.test.ts: rejects_invalid_game; guest_is_not_member; scheduled_start_requires_future_date; call_member_is_not_team_member; parses limits 10/3; ErrorCode enum khớp HTTP. Các clients và API cùng import contracts.
- [ ] **Build:** Định nghĩa kiểu chung và payload theo mục 5; phân biệt Room, PlaySession, Recruitment, CallGroup. Timestamp UTC ISO, cursor không dùng offset cho chat; response mutations có idempotencyKey khi cần.
- [ ] **PASS:** npm run test --workspace @fg/contracts -- test/contracts.test.ts

### T04 — Schema identity, hồ sơ và danh mục game

**Phần:** DATABASE. **Files:** code/packages/database/src/schema/{auth,profiles,games}.ts; code/packages/database/migrations/; code/packages/database/src/seed-games.ts; code/packages/database/test/identity.test.ts

**Tạo cho task sau:** Auth user/account/session/verification; profiles, game_profiles, game_interests; games có 7 bản ghi và một Lobby/game.

- [ ] **RED / kiểm tra cần có:** identity.test.ts trên PostgreSQL thật: migrate DB trống; seed hai lần vẫn 7 game/7 Lobby; không duplicate identity; không bắt rank; FK invalid bị từ chối; schema auth được adapter đọc đúng.
- [ ] **Build:** Sinh schema Better Auth tương thích version lock; thêm user profile và game catalog. Unique(provider,providerAccountId), unique(userId,gameId), unique Lobby.gameId; không nhập schema mẫu lệch version.
- [ ] **PASS:** npm run test --workspace @fg/database -- test/identity.test.ts

### T05 — Schema chat, quan hệ bạn bè và chặn

**Phần:** DATABASE. **Files:** code/packages/database/src/schema/{conversations,messages,social}.ts; code/packages/database/migrations/; code/packages/database/test/social-chat.test.ts

**Tạo cho task sau:** conversations/members, messages/attachments/mentions, friendships/friend_requests/blocks.

- [ ] **RED / kiểm tra cần có:** social-chat.test.ts: DM không duplicate khi tạo đồng thời; gửi lại clientMessageId chỉ một tin; reply khác conversation không hợp lệ; friendship không tồn tại hai chiều duplicate; migrations giữ dữ liệu T04.
- [ ] **Build:** DM unique cặp user đã chuẩn hóa; message type text/image, reply cùng conversation, clientMessageId unique theo sender/conversation; attachment gắn quyền conversation; index(cursor,conversationId).
- [ ] **PASS:** npm run test --workspace @fg/database -- test/social-chat.test.ts

### T06 — Schema phòng, quyền, buổi chơi và tuyển đội

**Phần:** DATABASE. **Files:** code/packages/database/src/schema/{rooms,teams,recruitments}.ts; code/packages/database/migrations/; code/packages/database/test/team-constraints.test.ts

**Tạo cho task sau:** room_members, permission_grants, play_sessions, team_members, active_play_slots, recruitments, join_requests, invitations.

- [ ] **RED / kiểm tra cần có:** team-constraints.test.ts: hai transaction cấp slot cùng user chỉ một thành công; team capacity không âm; spectating không tạo slot; room nhiều play sessions không làm member mất lịch sử; room private không làm chat public.
- [ ] **Build:** PK active_play_slots.userId đảm bảo một lượt chơi đang hoạt động/user. Team tách membership phòng. Room owner là member; đội hẹn giờ chưa chiếm slot trước start. Các thay đổi thành viên qua transaction.
- [ ] **PASS:** npm run test --workspace @fg/database -- test/team-constraints.test.ts

### T07 — Schema cuộc gọi, thông báo và quản trị

**Phần:** DATABASE. **Files:** code/packages/database/src/schema/{calls,notifications,moderation}.ts; code/packages/database/migrations/; code/packages/database/test/call-outbox.test.ts

**Tạo cho task sau:** call_groups/members/publish_slots/restrictions, external_lives, notifications/preferences/push_subscriptions/outbox, reports/admin_actions.

- [ ] **RED / kiểm tra cần có:** call-outbox.test.ts: cấp slot thứ 4 thất bại; notification duplicate một bản ghi; FK private room bảo toàn; migrate đủ DB sạch và DB đang có dữ liệu; webhook event id unique chống replay.
- [ ] **Build:** Index unique active call membership theo user, 3 publish slots/call cấp trong transaction; notification/outbox dedup keys; soft delete giữ audit. Migration không public hóa dữ liệu private.
- [ ] **PASS:** npm run test --workspace @fg/database -- test/call-outbox.test.ts

### T08 — Đăng nhập Discord và session guard

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/auth/; code/apps/api/src/common/{session.guard,csrf.guard}.ts; code/apps/api/test/auth.integration.spec.ts

**Tạo cho task sau:** OAuth social sign-in; GET /api/v1/me; guard requireSession/requireAdmin/requireOnboarded.

- [ ] **RED / kiểm tra cần có:** auth.integration.spec.ts: guest đọc public được nhưng mutation401; callback state sai bị từ chối; logout session không dùng lại; banned user403; login Discord thật xác nhận riêng ở browser với tài khoản test.
- [ ] **Build:** Mount Better Auth qua Node handler theo docs version lock; same-origin cookie HttpOnly, Secure ở HTTPS, kiểm tra origin của mutation; không đăng nhập email/password. Không tự ghép tài khoản chỉ vì email giống nhau; link provider cần session xác thực.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/auth.integration.spec.ts

### T09 — Đăng nhập, đăng xuất và guest guards

**Phần:** FRONTEND. **Files:** code/apps/web/src/styles/{tokens,global}.css; code/apps/web/src/components/ui/; code/apps/web/src/features/auth/; code/apps/web/test/auth.test.tsx

**Tạo cho task sau:** Trang login, guest/private guards, logout, loading/error states.

- [ ] **RED / kiểm tra cần có:** auth.test.tsx: Discord redirect đúng; session loading không nháy nội dung riêng; denied OAuth có retry; logout xóa cache private và đóng socket/call; guest route trả login CTA.
- [ ] **Build:** Dựng Inter self-host, shared CSS tokens và components theo 02-frontend-design.md rồi auth UI mang tên FG; onboarding ở T11 sau API T10. Session pending không render nội dung private; visitor vẫn xem Lobby public.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/auth.test.tsx

### T10 — API hồ sơ và sở thích game

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/profiles/; code/apps/api/test/profiles.integration.spec.ts

**Tạo cho task sau:** GET /users/:id/profile; PATCH /me/profile; PUT /me/interests; PUT /me/game-profiles/:gameId; GET /games.

- [ ] **RED / kiểm tra cần có:** profiles.integration.spec.ts: owner-only edit; guest không lấy email; 7game catalog; onboarding không cần rank; timezone display tách ISO/giờ chơi địa phương; interest invalid game422.
- [ ] **Build:** Validate onboarding, optional rank/role/hours/style, chỉ owner sửa. Profile public chỉ nickname/avatar/bio/game fields; không email/account ids. Upload avatar qua T14, trước đó dùng provider avatar.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/profiles.integration.spec.ts

### T11 — Hồ sơ, chỉnh sửa và tích hợp onboarding thật

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/profiles/; code/apps/web/src/features/onboarding/; code/apps/web/test/profiles.test.tsx; code/tests/e2e/onboarding.spec.ts

**Tạo cho task sau:** Profile panel từ avatar, editor per-game, onboarding thật kết nối backend.

- [ ] **RED / kiểm tra cần có:** profiles.test.tsx: sửa đúng game, lưu lỗi không mất form, không bắt rank, view không lộ email; E2E first-login hoàn tất và vào Lobby bằng DB thật.
- [ ] **Build:** Hoàn thiện onboarding dựa API thật T10; thể hiện rank tự khai và trạng thái tự chọn tách online. Có empty/loading/error states; actions nhắn riêng/kết bạn tích hợp ở T17-FE.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/profiles.test.tsx; npm run test:e2e -- tests/e2e/onboarding.spec.ts

### T12 — Lịch sử Lobby và chat chữ realtime

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/chat/; code/apps/api/src/modules/realtime/; code/apps/api/test/lobby.integration.spec.ts

**Tạo cho task sau:** GET /games/:gameId/lobby/messages; POST /conversations/:id/messages; WS subscribe conversation và message.created.

- [ ] **RED / kiểm tra cần có:** lobby.integration.spec.ts: guest read200/send401; 7 Lobby độc lập; reconnect gap nhận đủ tin không duplicate; cursor bằng createdAt,id không mất tin timestamp trùng; session bị khóa không gửi; private channel join403.
- [ ] **Build:** Server lưu DB trước broadcast; REST là nguồn bù dữ liệu sau reconnect. Guest chỉ subscribe Lobby public; private subscriptions phải member. Socket auth dùng cookie session, kiểm tra origin và permission cho mọi event.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/lobby.integration.spec.ts

### T13 — Khung Lobby desktop/mobile và chat chữ

**Phần:** FRONTEND. **Files:** code/apps/web/src/layouts/AppShell.tsx; code/apps/web/src/features/lobby/; code/apps/web/test/lobby.test.tsx

**Tạo cho task sau:** Navigation7game; desktop chat + khu tìm đội; mobile tabs Chat/Tìm đội; composer guest/login.

- [ ] **RED / kiểm tra cần có:** lobby.test.tsx: đổi game không lẫn tin; guest chỉ xem; mobile không overflow; reconnect không double tin; trả kết quả query cũ sau đổi game không ghi sai Lobby.
- [ ] **Build:** Bám mockup01 và 02-frontend-design.md về màu/font/spacing/layout; chụp screenshot1440/390px để đối chiếu. Không dùng ảnh minh họa game làm asset sản phẩm. Dùng TanStack Query + socket reconciler theo messageId; giữ scroll khi đọc tin cũ; nút tin mới khi chưa ở cuối. Panel tuyển kết nối T21 sau.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/lobby.test.tsx

### T14 — Gửi ảnh, reply và mention

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/uploads/; code/apps/api/src/modules/chat/; code/apps/api/test/chat-rich.integration.spec.ts

**Tạo cho task sau:** POST /uploads/images; GET /attachments/:id; message replyToId/mentionUserIds/attachmentIds.

- [ ] **RED / kiểm tra cần có:** chat-rich.integration.spec.ts: file giả jpg422; quá size413; private image outsider403; reply sai room422; upload lặp không lộ path; ảnh orphan được cleanup; mention ở room riêng không gửi đến outsider.
- [ ] **Build:** Giới hạn ảnh đã duyệt ở T00; xác minh magic bytes, Sharp re-encode, storage trong runtime volume, tên random. Download kiểm tra conversation access; upload chưa gắn message có TTL cleanup. Mention id hợp lệ cùng context, không tin tên client.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/chat-rich.integration.spec.ts

### T15 — Ảnh, emoji, reply và mention trong chat

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/chat/; code/apps/web/test/chat-rich.test.tsx

**Tạo cho task sau:** Composer chung, upload progress/retry, reply preview, @picker, emoji.

- [ ] **RED / kiểm tra cần có:** chat-rich.test.tsx: gửi ảnh lỗi giữ nội dung; cancel reply; emoji không mất caret; @picker dùng đúng id; text chứa script hiển thị như text; click image private dùng endpoint có session.
- [ ] **Build:** Không renderer HTML tin nhắn từ user; modal ảnh có keyboard/close. Retry dùng clientMessageId. Mention dùng ids và displayName từ API, không parse thành lệnh tìm đội.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/chat-rich.test.tsx

### T16 — Online và trạng thái tự chọn

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/presence/; code/apps/api/test/presence.integration.spec.ts

**Tạo cho task sau:** GET /games/:id/online; PATCH /me/status; WS presence.changed.

- [ ] **RED / kiểm tra cần có:** presence.integration.spec.ts: đóng một trong hai tab không offline; stale heartbeat hết TTL; status giữ khi reconnect; danh sách theo Lobby; presence của private room không bị guest subscribe.
- [ ] **Build:** Heartbeat/refcount theo user và tab; status LOOKING/PLAYING/CHATTING độc lập ONLINE/OFFLINE. Không coi online là đang tìm đội. TTL và heartbeat được freeze ở T00.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/presence.integration.spec.ts

### T16-FE — Danh sách online và trạng thái tự chọn

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/presence/; code/apps/web/src/features/lobby/OnlineUsers.tsx; code/apps/web/test/presence.test.tsx

**Tạo cho task sau:** Danh sách online trong Lobby, user status selector; click người online mở hồ sơ T11.

- [ ] **RED / kiểm tra cần có:** presence.test.tsx: một user nhiều tabs chỉ hiện một; mất socket không tự đổi user status; đổi Lobby cleanup subscriptions; click profile đúng user; save status lỗi giữ trạng thái cũ.
- [ ] **Build:** Đấu online panel của mockup01 vào backend thật. Phân biệt online/offline với Đang tìm đội/Đang chơi/Chỉ trò chuyện; nhiều tab cùng user không duplicate danh sách.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/presence.test.tsx

### T17-BE — Kết bạn, nhắn riêng và chặn

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/social/; code/apps/api/test/social.integration.spec.ts

**Tạo cho task sau:** Friend request/accept/reject/list; get-or-create DM; POST/DELETE blocks.

- [ ] **RED / kiểm tra cần có:** social.integration.spec.ts: chỉ receiver accept; retry không duplicate; block chặn DM/invite; guest không subscribe DM; chat riêng phải participant; dữ liệu quan hệ riêng không lộ qua public profile.
- [ ] **Build:** DM không cần bạn bè. Theo T00: block chặn DM/lời mời mới, không tự xóa lịch sử/membership; Lobby ẩn nội dung người bị chặn ở phía người chặn, server lưu báo cáo được.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/social.integration.spec.ts

### T17-FE — Bạn bè và nhắn riêng từ Lobby/hồ sơ

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/{friends,direct-messages,chat}/; code/apps/web/test/social.test.tsx

**Tạo cho task sau:** Danh sách bạn bè, lời mời, mở DM chưa kết bạn, block controls.

- [ ] **RED / kiểm tra cần có:** social.test.tsx: pending/accepted/blocked states; DM chưa kết bạn; recipient-only accept; failed send không giả thành công; bị block không gửi lời mời; nhiều tab unread được đồng bộ.; block trong Lobby ẩn tin từ đúng user ở phía người chặn.
- [ ] **Build:** Không ép friendship trước DM; cache theo conversationId, đổi account phải clear. Đấu actions T11 và T13 vào API thật. Block UI theo policy đã duyệt.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/social.test.tsx

### T18 — Phòng lâu dài, member và ownership

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/rooms/; code/apps/api/test/rooms.integration.spec.ts

**Tạo cho task sau:** POST/GET/PATCH rooms; room chat history; leave/transfer-owner/dissolve endpoints.

- [ ] **RED / kiểm tra cần có:** rooms.integration.spec.ts: outsider read chat403; transfer race không thành room không owner; dissolve revoke membership/call quyền; owner không transfer người ngoài; room cuối close; public→private cards biến mất.
- [ ] **Build:** Private by membership; PUBLIC có thể tuyển nhưng chat không public. Chuyển PRIVATE đóng recruitment theo baseline đã duyệt. Owner transfer và leave atomic; owner cuối rời đóng phòng. Chat không mất khi kết thúc playSession.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/rooms.integration.spec.ts

### T19 — Danh sách phòng, chat nhóm và quản lý owner

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/rooms/; code/apps/web/test/rooms.test.tsx

**Tạo cho task sau:** Phòng của tôi; group chat; create/private setting; leave/transfer/dissolve flows.

- [ ] **RED / kiểm tra cần có:** rooms.test.tsx: giữ room sau kết thúc buổi; chỉ owner thấy transfer/dissolve; private group access error; cancel confirmation không gọi API; reload chọn room còn hợp lệ.
- [ ] **Build:** Giữ font/màu/components theo 02-frontend-design.md và mockup02; room list không đồng nghĩa đang chơi; UI xác nhận destructive dissolve. Cài đặt tuyển/permissions và voice tabs có route từ contracts, chưa dùng fake backend.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/rooms.test.tsx

### T20 — Tạo thẻ, bộ lọc và gợi ý đội thiếu người

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/recruitments/; code/apps/api/test/recruitments.integration.spec.ts

**Tạo cho task sau:** GET /games/:id/recruitments; POST recruitments; PATCH close/reopen; GET suggestions.

- [ ] **RED / kiểm tra cần có:** recruitments.integration.spec.ts: private không hiện; full/closed không gợi ý; mismatch rank vẫn apply được ở T22; reopen same room giữ member/chat; chủ bị occupied không tuyển playSession khác409; sort deterministic.; hai tạo-thẻ đồng thời của cùng chủ chỉ một ACTIVE session; không tự đưa mọi room member vào roster buổi mới.
- [ ] **Build:** Thẻ game/mode/title/playerCapacity/scheduledAt/requirementText; Roblox experience theo T00. Rank tham khảo. Chơi ngay tạo session+roster owner+active slot atomic; hẹn giờ chưa cấp slot. Tuyển buổi tiếp theo tạo session mới cùng room, không hồi sinh ENDED. Gợi ý OPEN room PUBLIC exact game/mode, thiếu ít người trước, updatedAt/id làm tie-break.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/recruitments.integration.spec.ts

### T21 — Thẻ tuyển và tạo đội cạnh Lobby

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/recruitments/; code/apps/web/test/recruitments.test.tsx

**Tạo cho task sau:** Desktop cards, mobile tab, filters, create now/scheduled, old/new room selector.

- [ ] **RED / kiểm tra cần có:** recruitments.test.tsx: game-specific forms; Roblox experience; hẹn giờ dùng Asia/Bangkok hiển thị rồi gửi UTC; suggestions không chặn vô cớ; phone tab không mất chat; private room không chọn public recruit.
- [ ] **Build:** Hiện gợi ý đội thiếu người trước khi tạo mới nhưng vẫn cho tạo nếu không vướng active slot. Không ép rank. Xin tham gia vào T22/T23; loading/full/closed/empty states rõ.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/recruitments.test.tsx

### T22 — Xin vào đội và duyệt atomic chống trùng

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/teams/; code/apps/api/test/team-approval.integration.spec.ts

**Tạo cho task sau:** POST /recruitments/:id/requests; POST /join-requests/:id/{approve,reject}; team snapshots.

- [ ] **RED / kiểm tra cần có:** team-approval.integration.spec.ts: hai đội duyệt cùng user chỉ một success/other409; hai người tranh last slot chỉ một success; retry idempotent; chưa đạt rank vẫn submit; unauthorized approver403; rollback không hủy request oan.; accept scheduled không occupied hoặc hủy request chơi ngay.
- [ ] **Build:** Approve đội chơi ngay khóa user/session, kiểm capacity, tạo room membership nếu cần, cấp slot và hủy request chơi-ngay khác cùng transaction. Đội hẹn giờ chỉ duyệt giữ chỗ, cấp active slot khi start T24. Mời vào PLAY_SESSION dùng cùng service. Outbox chỉ sau commit.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/team-approval.integration.spec.ts

### T23 — Lời mời theo cài đặt và quyền của moderator

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/{invitations,permissions}/; code/apps/api/test/invitations.integration.spec.ts

**Tạo cho task sau:** InviteTarget ROOM hoặc PLAY_SESSION; invite/accept/reject endpoints; GET/PATCH room settings; PUT permission grants.

- [ ] **RED / kiểm tra cần có:** invitations.integration.spec.ts: đổi policy; consent bắt buộc; private invite đúng target; ROOM accept không active slot; helper chỉ calls không approve team; direct PLAY_SESSION accept race không double slot; owner-only ownership.
- [ ] **Build:** OWNER_APPROVAL mặc định nếu T00 duyệt; DIRECT_MEMBER bỏ bước owner approval nhưng vẫn cần recipient consent. ROOM invitation chỉ thêm thành viên phòng, không chiếm slot chơi. PLAY_SESSION invitation dùng chung capacity/active-slot transaction T22. Chủ phòng chọn từng quyền; transfer/dissolve không cấp helper.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/invitations.integration.spec.ts

### T24 — Buổi hẹn giờ, roster, rời và kết thúc

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/play-sessions/; code/apps/api/test/play-sessions.integration.spec.ts

**Tạo cho task sau:** POST /play-sessions/:id/{start,join,leave,end}; roster approve.

- [ ] **RED / kiểm tra cần có:** play-sessions.integration.spec.ts: room nhiều lần chơi; spectator không slot; end idempotent; rời voice không rời roster; rời roster giữ room; scheduled start conflict không ghi nửa team; owner helper permission checks.
- [ ] **Build:** Thành viên xin chơi, chủ đội/helper có quyền duyệt roster. Scheduled approved giữ chỗ hẹn nhưng start mới cấp active slot; conflict409 giữ lịch hẹn, không tự đuổi từ đội khác. Leave/end giải phóng slots không xóa room/call.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/play-sessions.integration.spec.ts

### T25 — Yêu cầu, lời mời, roster và cài đặt phòng

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/{team-roster,room-settings,invitations}/; code/apps/web/test/team-roster.test.tsx

**Tạo cho task sau:** Owner approval UI, request statuses, roster, end/leave, permission toggles.

- [ ] **RED / kiểm tra cần có:** team-roster.test.tsx: accepted hủy requests cũ visible; conflict409 refresh roster; helper limited buttons; đổi policy; scheduled pending start; leave/end không biến mất group room.
- [ ] **Build:** Button Kết thúc buổi chơi tách Rời cuộc gọi và Rời phòng. Không optimistic add team trước approve. Permission changes update UI nhưng backend vẫn enforce.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/team-roster.test.tsx

### T26 — Tạo nhóm gọi và admission tối đa 10 người

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/calls/; code/apps/api/test/call-admission.integration.spec.ts

**Tạo cho task sau:** POST /rooms/:id/calls; POST /calls/:id/join; POST /calls/:id/leave; GET room calls.

- [ ] **RED / kiểm tra cần có:** call-admission.integration.spec.ts: 11 requests đồng thời max10; spectators count; outsider403; room nhiều calls; invitation chưa accept không token; membership revoked không refresh; chỉ UI check không đủ.
- [ ] **Build:** Reservation + capacity khóa server, max10 tính viewers; token ngắn hạn chỉ cho current member, không secret client. Recheck ACL khi cấp/refresh. Người dùng một nhóm gọi tại một thời điểm theo T00; room có nhiều nhóm. LiveKit room limits cũng 10.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/call-admission.integration.spec.ts

### T27 — Webhook, reconnect và tự đóng nhóm gọi

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/calls/call-lifecycle.service.ts; code/apps/api/test/call-lifecycle.integration.spec.ts

**Tạo cho task sau:** Call state OPEN/CLOSED, presence updates, lease cleanup/reconciliation.

- [ ] **RED / kiểm tra cần có:** call-lifecycle.integration.spec.ts: duplicate/out-of-order webhook; last leave đúng close; reconnect trước30s không tạo seat thứ2; lost webhook cleanup; joined concurrently while last disconnect không xóa live call; old closed call không hồi sinh.
- [ ] **Build:** Verify webhook signature; explicit last-leave đóng ngay, disconnect giữ grace đã duyệt30s rồi cleanup nếu không rejoin. Rejoin hợp lệ giữ identity/capacity; lost webhook có job reconcile. Không close room chat hoặc playSession.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/call-lifecycle.integration.spec.ts

### T28 — Vào gọi, mic và âm lượng riêng

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/calls/; code/apps/web/test/call-controls.test.tsx; code/tests/e2e/voice.spec.ts

**Tạo cho task sau:** Call sidebar/groups, mic on/off, per-user volume/mute, leave controls.

- [ ] **RED / kiểm tra cần có:** call-controls.test.tsx: permission denied; muted viewer unmute allowed trừ moderator restriction; volume chỉ local; leave không end team; cleanup khi route change. E2E hai browser contexts qua LiveKit thật kiểm có audio track.
- [ ] **Build:** Mic requester sau click join; denied permission hiện hướng dẫn, vẫn xem được nếu được phép. Viewers mic bình thường. Leave disconnect tracks; local mute không server-mute người khác.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/call-controls.test.tsx; npm run test:e2e -- tests/e2e/voice.spec.ts

### T29 — Cấp quyền phát màn hình và moderation cuộc gọi

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/calls/{publishing,call-moderation}.service.ts; code/apps/api/test/publishing.integration.spec.ts

**Tạo cho task sau:** POST /calls/:id/screen-share/{claim,release}; POST /calls/:id/moderation.

- [ ] **RED / kiểm tra cần có:** publishing.integration.spec.ts: bốn publishers đồng thời max3; request burst/retry không leak quota; microphone viewers không mất; helper không quyền403; muted participant không bypass; stale token/membership permission sau kick được kiểm trên SFU thật, không chỉ API.
- [ ] **Build:** Claim quota atomic, chỉ grant screen sources sau cấp slot; mic policy độc lập. Stop screen/mute/kick do owner/helper đúng quyền; muted-by-mod không tự bật lại đến allow. Webhook+reconcile thu hồi slot khi stream ended/disconnect; kiểm cả token replay và client gọi SDK ngoài UI.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/publishing.integration.spec.ts

### T30 — Live màn hình, chọn luồng và thích ứng chất lượng

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/live/; code/apps/web/test/live-viewer.test.tsx; code/tests/e2e/screen-share.spec.ts

**Tạo cho task sau:** Desktop share720p30; selected main stream; other-stream selector; mobile view-only.

- [ ] **RED / kiểm tra cần có:** live-viewer.test.tsx: switching unsubscribes old video; ended selected stream fallback; denied/cancel release; fourth publisher message; mobile hide unsupported share. E2E real capture hai stream, switch và measured subscriptions; benchmark thêm audio dưới network shaping.
- [ ] **Build:** getDisplayMedia sau click; cancel không giữ slot. Subscribe audio bình thường và một video chính; tiles các luồng không mở đồng thời video full quality. Enable adaptive stream/dynacast; server đã enforce max3. Mobile thiếu capture hiển thị rõ, không hứa phát màn hình PWA.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/live-viewer.test.tsx; npm run test:e2e -- tests/e2e/screen-share.spec.ts

### T31 — Nguồn live ngoài và kiểm tra URL

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/external-live/; code/apps/api/test/external-live.integration.spec.ts

**Tạo cho task sau:** PUT/GET/DELETE /calls/:id/external-live; normalized provider/video/channel IDs.

- [ ] **RED / kiểm tra cần có:** external-live.integration.spec.ts: youtube video/live và Twitch channel chuẩn hóa; reject javascript URL/private IP/unknown host; outsider403; bad video id422; nguồn không tồn tại không bị coi healthy; sources permission consistent.
- [ ] **Build:** Cho current call member đặt nguồn nếu T00 duyệt; server chỉ parse YouTube/Twitch URLs, không fetch arbitrary URL. Stored structured ids; một nguồn ngoài/call; chỉ members đọc, không cần YouTube Data API/Twitch Helix token cho embed cơ bản.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/external-live.integration.spec.ts

### T32 — Xem YouTube/Twitch trong phòng

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/live/ExternalLivePlayer.tsx; code/apps/web/test/external-player.test.tsx; code/tests/e2e/external-live.spec.ts

**Tạo cho task sau:** Tab Màn hình/YouTube–Twitch, embed errors và source selection.

- [ ] **RED / kiểm tra cần có:** external-player.test.tsx: malicious input không iframe; parent chính xác; autoplay blocked UI; private ACL; click back restores selected screen. Manual real YouTube/Twitch embed staging HTTPS; unavailable/nonembeddable stream hiện lỗi.
- [ ] **Build:** Embed iframe từ whitelist; parent đúng domain Twitch; autoplay không bảo đảm, có click play. Chuyển sang external tắt subscription video screen chính; audio của iframe điều chỉnh riêng, không đồng bộ playback toàn phòng. Không tự relay external video qua LiveKit.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/external-player.test.tsx; npm run test:e2e -- tests/e2e/external-live.spec.ts

### T33 — Outbox và thông báo trong website

**Phần:** BACKEND / WORKER. **Files:** code/apps/api/src/modules/notifications/; code/apps/worker/src/notification-outbox.ts; code/apps/api/test/notifications.integration.spec.ts

**Tạo cho task sau:** GET notifications; PATCH read/read-all; unread counts; notification preferences APIs.

- [ ] **RED / kiểm tra cần có:** notifications.integration.spec.ts: rollback không notify; duplicate worker/retry chỉ một inbox; self message không notify self; removed member không leak excerpt; mark read multi-tab sync; batch read chỉ current user.
- [ ] **Build:** Event→outbox trong domain transaction; worker BullMQ idempotent, read ACL lại trước gửi. Không push/email mọi tin Lobby. Notification link không bypass permissions. Task gồm worker và API, frontend T34 riêng.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/notifications.integration.spec.ts

### T34 — Inbox và tùy chọn từng kênh

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/notifications/; code/apps/web/test/notifications.test.tsx

**Tạo cho task sau:** Bell/unread count, list, links, per-type/channel switches.

- [ ] **RED / kiểm tra cần có:** notifications.test.tsx: save prefs error không giả saved; read count consistency; link denied; push permission denied display; screen reader labels; không gộp email on thành tất cả types nếu prefs khác.
- [ ] **Build:** Cho user chọn IN_APP/PUSH/EMAIL theo event, không nhầm cài đặt website với system permission. Link private revoked hiện không có quyền, không show cached body của room.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/notifications.test.tsx

### T35 — Web Push, email và nhắc lịch

**Phần:** BACKEND + WORKER. **Files:** code/apps/api/src/modules/push/; code/apps/worker/src/{push,email,schedule-reminders}.ts; code/apps/worker/test/delivery.test.ts

**Tạo cho task sau:** Push subscription endpoints; delivery adapters; email nhắc/lời mời; scheduled reminder dedup.

- [ ] **RED / kiểm tra cần có:** delivery.test.ts: push410 removes; SMTP failure retry không duplicate; opts-out skip; revoked room không nội dung nhạy cảm; scheduled time UTC→nhắc đúng; canceled reminder skip. Real SMTP/push xác nhận bằng tài khoản/thiết bị test do user chỉ định, không gửi người khác.
- [ ] **Build:** SMTP dùng sender đã cấu hình; thiếu verified email thì báo email unavailable, không fake sent. Push permission/subscription per device; endpoint410 cleanup; retries capped; preferences + blocks + ACL check trước delivery. Reminder10phút nếu T00 duyệt, cancel/end không gửi.
- [ ] **PASS:** npm run test --workspace @fg/worker -- test/delivery.test.ts

### T36 — Cài màn hình chính và permission flow

**Phần:** FRONTEND / PWA. **Files:** code/apps/web/public/{manifest.webmanifest,icons/}; code/apps/web/src/pwa/; code/apps/web/test/pwa.test.ts; code/tests/e2e/pwa.spec.ts

**Tạo cho task sau:** Install/help UI Android/iOS; opt-in push; click notification routing.

- [ ] **RED / kiểm tra cần có:** pwa.test.ts: user-gesture permission only; denied không prompt loop; signed-out unregister subscription; SW update không cache private data. Real iPhone installed PWA và Android: install, background notification, click đúng room, revoke; desktop emulation không thay chứng cứ máy thật.
- [ ] **Build:** HTTPS prod; iOS16.4+ hướng dẫn Add to Home Screen. Cache app shell/versioned assets chỉ, không cache chat/private API/token/media. Offline trạng thái mất mạng, không gửi tin giả. Notificationclick focus existing client hoặc open authorized route.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/pwa.test.ts; npm run test:e2e -- tests/e2e/pwa.spec.ts

### T37 — Báo cáo, xử lý vi phạm và admin website

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/moderation/; code/apps/api/test/moderation.integration.spec.ts

**Tạo cho task sau:** Report user/message; admin report list/resolve; delete message; ban/unban endpoints.

**Bàn giao CHATCRYPTO-BAN-T37-01 (10/10/2026):** T37 sở hữu producer ban/unban và tích hợp crypto epoch/interval/session/socket theo mục quyết định ở trên; kiểm native atomic rollback/lock ordering/idempotency, không phục hồi session cũ hoặc lịch sử khoảng bị ban. Chưa có implementation/evidence producer; quyết định này không mở T37 trước tiền nhiệm PASS.

- [ ] **RED / kiểm tra cần có:** moderation.integration.spec.ts: helper không admin; unauth403; message deleted clients retracted; reporter khác room không xem private content; ban đang online bị ngắt và không login; unban không tự restore stale session.
- [ ] **Build:** Report ở room chỉ member thấy context; admin site role khác helper room. Ban revoke sessions/delivery/WS/call quyền; audit actor/reason/target. Không thêm moderator theo game hoặc reputation ngoài spec.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/moderation.integration.spec.ts

### T38 — Báo cáo, block và trang quản trị

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/moderation/; code/apps/web/src/features/admin/; code/apps/web/test/moderation.test.tsx

**Tạo cho task sau:** Report modal, admin reports/actions; permission-safe pages.

- [ ] **RED / kiểm tra cần có:** moderation.test.tsx: cancel no action; validation reason; nonadmin denied; report created success/error; block text warning theo actual policy; admin action cập nhật list đúng.
- [ ] **Build:** Các controls user thường và admin rõ; ban/delete có lý do và confirmation. Không expose admin dữ liệu bằng hidden CSS; API checks đã test. Deleted messages state cập nhật realtime.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/moderation.test.tsx

### T38-FEED-DATA — Contracts, schema và migrations Bảng tin

**Phần:** CONTRACT / DATABASE. **Files:** code/packages/contracts/src/{feed,moderation,index}.ts; code/packages/contracts/test/feed.test.ts; code/packages/database/src/schema/{feed,moderation}.ts; code/packages/database/src/index.ts; code/packages/database/migrations/; code/packages/database/test/feed.test.ts; code/quality/{api-contract,spec-coverage}.md; code/quality/evidence/T38-FEED-DATA/

**Tạo cho task sau:** DTO/schema cho FeedPost, FeedComment, loại bài, filters/cursors và các endpoints dưới prefix /api/v1: GET/POST /feed/posts; GET/PATCH/DELETE /feed/posts/:id; PUT/DELETE /feed/posts/:id/like; GET/POST /feed/posts/:id/comments; PATCH/DELETE /feed/comments/:id. Dùng upload staging/finalize hiện có với purpose FEED_POST và report endpoint hiện có mở rộng target FEED_POST/FEED_COMMENT; không tạo endpoint ghi ảnh không kiểm quyền. List response dùng pagination conventions FG, post trả counts và likedByMe; chỉ trả nickname/avatar/game data công khai của tác giả.

- [ ] **RED / kiểm tra cần có:** contracts test cho giới hạn/spec mục13, unknown game/type, plain text, cursor và upload/report targets. DB thật: migration sạch và DB hiện có giữ dữ liệu; unique(postId,userId) khi hai lượt thích đồng thời; FK game/author/parent; parent khác bài hoặc không phải root bị từ chối trong transaction service có integration ở BE; soft delete/audit không public hóa assets private.
- [ ] **Build:** Schema feed_posts, feed_post_images liên kết upload hiện có, feed_likes, feed_comments; deletedAt và parentCommentId; index feed `(createdAt,id)` kèm filters, comments theo `(postId,createdAt,id)`. Mỗi bài game/type/body, không có capacity/active slot; title không bắt buộc. Mở rộng report targets và ownership ảnh đúng spec, không thay contract chat/phòng.
- [ ] **PASS:** npm run test --workspace @fg/contracts -- test/feed.test.ts; npm run test --workspace @fg/database -- test/feed.test.ts; lint/typecheck packages thay đổi; log migrate DB thật và evidence theo gate.

### T38-FEED-BE — API bài, ảnh, thích, bình luận và moderation

**Phần:** BACKEND. **Files:** code/apps/api/src/modules/feed/; code/apps/api/src/app.module.ts; code/apps/api/src/modules/{uploads,moderation}/; code/apps/api/test/feed.integration.spec.ts; code/apps/api/test/feed-assets.integration.spec.ts; code/quality/{api-contract,spec-coverage}.md; code/quality/evidence/T38-FEED-BE/

**Tạo cho task sau:** Endpoints DTO từ DATA, DB persistence thật, feed filters/cursor và ownership/ban/admin/rate-limit checks. GET comments phân trang chronological cùng conventions; trả replies một cấp qua parentCommentId. Nhắn riêng dùng social API hiện có; không tạo hệ nhắn mới hoặc notification types mới cho feed.

- [ ] **RED / kiểm tra cần có:** Guest đọc200/write401; nonowner edit/delete403, ban bị từ chối, admin report/delete có audit; XSS hiển thị text; sort/filter/cursor không duplicate; image upload quá giới hạn/sai owner; URL ảnh bài đã xóa không đọc được và ảnh phòng riêng không dùng trong feed; PUT/DELETE like retry/hai tab count đúng; comment cross-post/nested parent bị từ chối; xóa root giữ replies với placeholder, xóa bài chặn replies; block ẩn phía người chặn; upload/network failures không tạo success giả.
- [ ] **Build:** Transactions cho publish/finalize ảnh và like/delete; dùng guards/rate limits hiện có; read loại deleted posts/comments và không lộ body/asset sau delete. Counts thật từ DB, không cache công khai response chứa likedByMe qua tài khoản. Report list/resolve nhận targets mới; không push/email mọi tương tác feed.
- [ ] **PASS:** npm run test --workspace @fg/api -- --runInBand test/feed.integration.spec.ts test/feed-assets.integration.spec.ts; lint/typecheck API; chạy services integration thật và ghi evidence.

### T38-FEED-FE — Bảng tin desktop/mobile theo mockup03

**Phần:** FRONTEND. **Files:** code/apps/web/src/features/feed/; code/apps/web/src/ (chỉ router, app shell/navigation, uploads/social/moderation integration và UI chung cần cho feed; ghi danh sách cụ thể vào allowlist trước task); code/apps/web/test/feed.test.tsx; code/tests/e2e/feed.spec.ts; code/quality/spec-coverage.md; code/quality/evidence/T38-FEED-FE/

**Tạo cho task sau:** /feed và /feed/posts/:id; sidebar/bottom nav, composer chữ/ảnh/game/type, feed filters, post detail, thích/bình luận/reply, edit/delete/report, hồ sơ/DM. Tái sử dụng tokens/components FG, không tạo theme mới.

- [ ] **RED / kiểm tra cần có:** guest login CTA; filter/query cũ không ghi đè lựa chọn mới; pagination không trùng; submit failure giữ text/ảnh và rollback like; auth change clear cache; reply đúng root; deleted/denied post không lộ cache; upload failed không publish; keyboard/focus/360px không overflow; report và DM đúng user. E2E nhiều account trên API/DB thật: post→filter→like→comment/reply→profile/DM→owner edit/delete→admin resolve report; account khác không sửa; refresh vẫn đúng dữ liệu.
- [ ] **Build:** Bám frontend-design mục10 và mockup03; giữ truy cập Lobby/game/phòng/bạn bè/thông báo. Comment text-only, không build icon ảnh ngoài scope; counts từ server, loading/empty/error/guest rõ ràng. Không socket/mock production, chia sẻ lại, follow hoặc thuật toán ranking. Nút xóa có xác nhận; ảnh/control truy cập được bằng keyboard.
- [ ] **PASS:** npm run test --workspace @fg/web -- test/feed.test.tsx; npm run test:e2e -- tests/e2e/feed.spec.ts; lint/typecheck web; screenshot1440/1280/390/360 và Codex visual review so mockup03.

### T39 — Hồi quy end-to-end và đối chiếu toàn spec

**Phần:** QA. **Files:** code/tests/e2e/{feed,lobby,teams,rooms,permissions,privacy}.spec.ts; code/quality/spec-coverage.md; code/quality/evidence/T39/

**Tạo cho task sau:** Coverage mỗi mục spec→task→test→evidence; responsive screenshots actual app.

- [ ] **RED / kiểm tra cần có:** Race approvals;11th call join;4th share; outsider private asset/WS/call; kicked rejoin; blocked invites; owner transfer; last-call closes; multi-room sessions; schedule conflicts. Desktop/mobile accessibility keyboard, contrast,360px no overflow.
- [ ] **Build:** Chạy user journeys nhiều tài khoản: guest→login→Lobby→DM→recruit→approve→group→call→share→end→room persists; thêm guest→feed→login→post/ảnh→lọc→like/comment/reply→DM→report/delete theo spec mục13, kiểm hồi quy navigation và privacy. Không dùng mock success production hoặc bỏ test khó.
- [ ] **PASS:** npm run verify; npm run test:e2e

### T40 — Staging HTTPS, backups và cấu hình triển khai

**Phần:** OPS. **Files:** code/infra/{compose.staging.yml,compose.production.yml,caddy/}; code/scripts/{backup,restore,deploy,rollback}.mjs; code/quality/runbook.md

**Tạo cho task sau:** Staging cô lập data/secrets; runbook; restore proof; deploy/rollback scripts không auto publish.

- [ ] **RED / kiểm tra cần có:** HTTPS/auth callbacks/websocket/TURN có probe; NAT/mobile network gọi được; restart worker không mất outbox; restore DB/ảnh xong room/chat đúng ACL; health readiness failures rõ; credentials không trong browser bundle.
- [ ] **Build:** Triển khai đề xuất tự quản theo benchmark; media tách khỏi app/DB khi cần, Redis cho multi-node LiveKit. Không tự mua VPS/domain hoặc publish prod. Bind project artifacts trong code; backup DB+ảnh và restore staging, gồm feed posts/likes/comments/ảnh và trạng thái xóa/report; monitor app/API/calls/worker.
- [ ] **PASS:** npm run verify:staging; npm run backup:test; npm run restore:test

### T41 — Kiểm thử 1.000 người gọi/live và dự toán

**Phần:** QA / PERFORMANCE. **Files:** code/tests/load/{chat,api,media,network}/; code/quality/{performance,cost-model}.md; code/quality/evidence/T41/

**Tạo cho task sau:** Báo cáo tải, bitrate, CPU/RAM/egress/TURN, chi phí theo traffic đo được; trạng thái PASS hoặc BLOCKED.

- [ ] **RED / kiểm tra cần có:** 1000 concurrent30phút; max10/call,max3sharing; p95 API<500ms/chat delivery<1s/join<3s; lỗi<1%; audio packet loss<2% và audible sample pass. Ghi dropped frame/quality distribution, không đạt thì giữ task thất bại và tối ưu đúng scope.
- [ ] **Build:** Tăng tải50→200→500→1000; load generators riêng không nằm chung media host. Hai profile ở mục 7, realtime calls chứ không 1000 WS-only. Thêm đọc feed có filter/cursor và ghi like/comment trong workload API để kiểm SLO hiện có, không thay hai workload media. Network shaping + audio real kiểm riêng; không coi synthetic silent audio là đã chứng minh tiếng rõ. Xin giới hạn chi tiêu cụ thể trước paid load.
- [ ] **PASS:** npm run load:api; npm run load:chat; npm run load:media; npm run load:network

### T42 — Chốt bản ra mắt và bàn giao

**Phần:** RELEASE. **Files:** code/quality/{release-checklist,handover}.md; code/quality/evidence/T42/

**Tạo cho task sau:** Release candidate đủ toàn spec, hướng dẫn chạy local và deploy, không tự thay mục tiêu.

- [ ] **RED / kiểm tra cần có:** Không bỏ voice/live/email/PWA/1000 capacity; chưa có real devices, credentials, media benchmark hoặc budget approval thì BLOCKED. Không tick xong dựa code tồn tại, ảnh mockup hay simulated DB.
- [ ] **Build:** Xác nhận toàn bộ task evidence còn khớp git/fileshash/baseline; re-run smoke và regression khi có sửa mới. User review UI actual và chi phí trước prod; rollout/manual deployment do user chọn.
- [ ] **PASS:** npm run verify; npm run test:e2e; npm run verify:staging; npm run task:check -- RELEASE

## 7. Tải media và tối ưu chi phí — không thay scope

T41 gồm ít nhất hai workload30phút ở mức1.000 người:

1. **Audio-heavy:** 100calls ×10participants; tất cả publish microphone, subscribe âm thanh thành viên khác; không màn hình. Không dùng fake WebSocket connections làm participants.
2. **Screen-heavy:** 100calls ×10participants; mỗi call3publishers màn hình720p30, mỗi viewer subscribe một video được chọn và audio của call. Khi switch, unsubscribe video cũ; không tự mở full-quality cả3 thumbnails.

Đo thêm churn/reconnect và trường hợp call nhỏ phân tán, không suy ra100calls là tối đa vì các call có thể chưa đủ10người. Các generators đặt khác máy server để không bóp méo benchmark.

Tối ưu trong phạm vi: một video subscription chính; adaptive stream/dynacast; dừng luồng không người xem theo khả năng SDK; không ghi hình; không relay YouTube/Twitch; worker retry bounded; Postgres indexes; đo TURN ratio. Ưu tiên audio khi video giảm chất lượng. LiveKit Redis cho multi-node; không tự dựng Kubernetes hoặc microservices chỉ vì mục tiêu1.000.

Cost model phải ghi node sizes/count, region, transfer included/overage, real measured bitrate, concurrent hours/ngày, storage retention, backups, SMTP volume, TURN egress, thuế/tỷ giá nếu dùng. Dùng giá nhà cung cấp kiểm tra tại thời điểm dự toán; chưa được gọi bất kỳ cấu hình nào “rẻ nhất” hoặc “đủ1.000” nếu chưa có so sánh/bằng chứng.

Paid load test cần trần chi tiêu người dùng chốt. Nếu ngân sách không đáp ứng SLO1.000, ghi rõ lựa chọn cần người dùng quyết định; không tự giảm công suất, bỏ voice/live hoặc làm task PASS.

## 8. Cách giao task cho Antigravity

Prompt mở đầu có thể dùng:

> Đọc E:\FGweb\.doc\01-product-spec.md, E:\FGweb\.doc\02-frontend-design.md và E:\FGweb\.doc\task.md. Xem ba mockup trong .doc/mockups. Chỉ viết mã nguồn/cấu hình/test trong E:\FGweb\code. Bắt đầu T00; tên FG và giao diện ba mockup đã được tôi duyệt, không hỏi lại. Nếu còn nghiệp vụ/stack chưa chốt thì chỉ báo các mục đó trước khi build. Sau đó làm đúng từng task trong thứ tự đã ghi; cài dependencies ở T01 và cấu hình APIs/smoke ở T02 trước nghiệp vụ. Không tự sửa spec, skip task, chạy song song hoặc đánh PASS khi thiếu kiểm thử. Mỗi task báo files, commands, exit codes, evidence và blocker. Không tự mua dịch vụ hay deploy production.

Prompt cho lần tiếp:

> Đọc lại spec, task.md và code/quality/tasks.json. Kiểm hash và bằng chứng tiền nhiệm. Tiếp tục đúng task đầu tiên chưa PASS; nếu FAILED/BLOCKED thì xử lý task đó trước. Không nhảy task và không code ngoài code/. Báo kết quả kiểm thử thật.

Nếu Antigravity bị ngắt giữa chừng, không dựa vào lời kể của phiên trước; kiểm files/tests/ledger rồi tiếp tục task đang IN_PROGRESS. Test pass trên file cũ không chứng minh file vừa sửa pass.

## 9. Nguồn kỹ thuật đã kiểm tra

- [Vite: yêu cầu Node và setup](https://vite.dev/guide/).
- [NestJS: hướng dẫn migration và yêu cầu tương thích](https://docs.nestjs.com/migration-guide).
- [Better Auth: installation/Drizzle adapter](https://better-auth.com/docs/installation).
- [Better Auth: Discord](https://better-auth.com/docs/authentication/discord).
- [Drizzle: PostgreSQL setup](https://orm.drizzle.team/docs/get-started).
- [LiveKit: self-hosting](https://docs.livekit.io/transport/self-hosting/) và [distributed Redis](https://docs.livekit.io/transport/self-hosting/distributed/).
- [LiveKit: subscriptions/adaptive stream](https://docs.livekit.io/guides/room/receive) và [benchmark lk load-test](https://docs.livekit.io/transport/self-hosting/benchmark).
- [Twitch iframe/parent](https://dev.twitch.tv/docs/embed/video-and-clips/).
- [YouTube iframe player](https://developers.google.com/youtube/iframe_api_reference).
- [Nodemailer: SMTP verify](https://nodemailer.com/smtp).

Ngày kiểm tra:04/10/2026. Phiên bản hiện thực được khóa tại T01 và ghi bằng chứng, không suy diễn từ trí nhớ hoặc luôn cài latest.

## 10. Definition of Done toàn sản phẩm

- Tất cả48 checkpoint cơ sở (45 cũ +3 Bảng tin) và các task FIX phát sinh PASS theo ledger và evidence hợp lệ; không tính duyệt mockup là PASS tính năng.
- Spec coverage không thiếu phần; UI actual được review so mockup đã duyệt.
- Login Discord thật, DB migrations/restore thật, chat/recruit atomic, permissions/private assets, calls/live qua SFU thật.
- Push trên iPhone installed PWA và Android thật; email delivery test thật; opt-out/revoke được kiểm.
- Đủ1.000 call/live concurrent trên staging đo được, có chi phí và SLO bằng chứng.
- Không source/config/tests nằm ngoài code, không secrets trong bundle/log/repo.
- Người dùng đã review release candidate và dự toán; chưa có xác nhận thì không publish production.
