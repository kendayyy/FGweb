# FG — Hướng dẫn agent

Workspace mở tại E:/FGweb. Shell cài/build/test làm việc tại E:/FGweb/code.

## Đọc trước khi làm
1. .doc/01-product-spec.md — nghiệp vụ.
2. .doc/02-frontend-design.md — tên FG và thiết kế đã duyệt.
3. .doc/task.md — thứ tự task (48 checkpoint cơ sở và các task FIX trong ledger), acceptance, tests và evidence.
4. .agents/rules/*.md — rule chung và rule của phần đang sửa.
5. .doc/history.md — các phiên gần nhất, đối chiếu files/ledger/evidence thật khi resume.

## Bất biến
- Chỉ viết code/cấu hình ứng dụng/tests/runtime artifacts trong code/.
- .doc/ chứa tài liệu/mockup; .agents/rules/ và AGENTS.md là metadata agent, không là nơi code.
- Một task mỗi lần, đúng bảng thứ tự; không skip, chạy song song hay tự đánh PASS.
- T01 cài deps, T02 cấu hình dịch vụ trước code nghiệp vụ.
- UI/tên FG đã được người dùng duyệt, không hỏi lại; T00 vẫn có các mục nghiệp vụ/stack cần chốt.
- Không tự đổi spec, bỏ voice/live/PWA/email hoặc giảm mục tiêu1.000 call/live.
- Thiếu test/bằng chứng thì báo thật, không giả success. Không tự mua dịch vụ hoặc publish production.

Hướng dẫn sử dụng và danh mục rule: .doc/03-antigravity-rules.md.
Yêu cầu mới của người dùng có thể điều chỉnh project rules; ghi thay đổi được chỉ định vào tài liệu và task liên quan.

## Tự động push GitHub — GITHUB-AUTO-PUSH-01, 13/10/2026
- Người dùng yêu cầu tự động push mỗi khi chạy xong task. Đây là quyền thường trực cho Codex commit/push task đã hoàn tất hợp lệ lên repo PUBLIC https://github.com/kendayyy/FGweb, remote origin, nhánh master; không hỏi lại mỗi lần.
- Áp dụng sau khi acceptance/tests/review/checker hiện hành xác nhận hoàn tất; chốt ledger/evidence/history trước commit. Task FAILED/BLOCKED/IN_PROGRESS hoặc phiên test kết thúc chưa là task hoàn tất, không tự đổi PASS để push.
- Đọc và làm theo .agents/rules/12-github-auto-push.md. Kiểm staged diff/secrets trước mọi push public; chỉ stage thay đổi thuộc task đã chốt và tài liệu/evidence tương ứng, giữ secrets/runtime/logs riêng tư ở local, giữ nguyên evidence frozen.
- Ghi command/time/exit/commit và xác minh remote SHA sau push trong evidence/history; báo lỗi push thật và xử lý retry an toàn, không force-push hoặc ghi đã đồng bộ khi chưa xác minh. Đây là backup GitHub, không tự deploy/publish production hoặc mở task tiếp theo trước gate.

## Chỉ dùng Codex — CODEX-ONLY-01, 12/10/2026
- Chỉ định mới của người dùng: tắt hoàn toàn skill Anti2; các task chỉ dùng Codex, không dùng Antigravity; cockpit không được tự động bật.
- Áp dụng cho toàn bộ task FG từ chỉ định này: Codex trực tiếp triển khai, review, áp dụng, kiểm thử và chốt. Không gọi skill/dashboard/monitor Anti2 hoặc CLI/app Antigravity, không giao việc cho Antigravity.
- Chỉ định này thay thế phân công Antigravity/Anti2 và yêu cầu model Gemini trong các mục quy trình cũ, kể cả NO-ANTI2-01 và hướng dẫn giao task cũ. Giữ nguyên một task mỗi lần, scope, thứ tự, acceptance, checker, evidence, headed UI/E2E và Telegram đã được ủy quyền; không tự đổi PASS.
- Không tự khởi động, khởi động lại hoặc phục hồi cockpit-tools sau test. Chỉ được mở lại nếu có chỉ định mới rõ ràng của người dùng; quyền tạm đóng/mở lại trước đây không còn cho phép tự bật cockpit.
- Giữ nguyên evidence và lịch sử Antigravity/Anti2/cockpit đã kết thúc; không chạy lại script lịch sử có lệnh gọi Antigravity/Anti2 hoặc tự bật cockpit. Dùng driver mới tuân thủ chỉ định này cho các lượt tiếp theo.

## Mã hóa chat — CHAT-CRYPTO-01, 08/10/2026
- CHAT-CRYPTO-01 (08/10/2026): đọc spec mục17/task chuỗi CHATCRYPTO-DATA/BE/FE/QA. DM/nhóm E2EE chữ/ảnh, recovery riêng, người mới không đọc tin cũ; Lobby mã hóa lưu trữ khóa server tách DB/backup, vẫn public. Chỉ người dùng chọn gửi bằng chứng report mới được admin đọc. Không tự làm crypto trong task đang chạy, không đánh dấu server-encrypted là E2EE hoặc đổi PASS; rebaseline/migration/protocol review có evidence trước chuỗi mới.

## Nhật ký phiên — HISTORY-CHANGE-01, 07/10/2026
- HISTORY-CODING2-01 (09/10/2026): Coding and build 2 phải ghi mỗi phiên vào .doc/history.md với tên chat + task ID, giờ bắt đầu/kết thúc và mọi vòng sửa/build/test/review. Trước báo xong/bàn giao/blocker kiểm entry khớp evidence/ledger và trỏ mục vừa ghi; thiếu history chưa đạt tiêu chí bàn giao. Không backfill thiếu bằng chứng hoặc tự đổi PASS/checker.
- Coding/build phải ghi mọi phiên build, sửa lỗi, cấu hình, migration, refactor và test vào .doc/history.md: tạo mục lúc bắt đầu, cập nhật vòng sửa/test/review, chốt kết quả/giờ kết thúc/blocker trước bàn giao. Kể cả thất bại hoặc phiên chưa xong; đọc rule11 và mẫu history.
- Giữ lịch sử đã kết thúc, đính chính bằng mục mới; không bịa phiên cũ, không secrets/raw logs/code trong history. Evidence thực vẫn trong code/, history không thay ledger/review/PASS. Đây là cập nhật tài liệu xuyên task được người dùng yêu cầu, không cho phép task song song hoặc nới checker.

## Điều chỉnh quy trình được người dùng xác nhận — 06/10/2026
- Với FG, bỏ giới hạn hai vòng review/refactor cùng một lỗi của Antigravity. Tiếp tục sửa và kiểm thử trong task hiện tại đến khi Codex review đạt hoặc có blocker thực sự cần người dùng.
- Antigravity triển khai, Anti2 theo dõi, Codex review và chốt; giữ Gemini 3.6 Flash (High), một task mỗi lần, không mở task sau trước PASS.
- Thay đổi này chỉ bỏ giới hạn số vòng sửa; không nới phạm vi files, quyền truy cập, acceptance, kiểm thử hay điều kiện PASS. Không giả success, sửa test để che lỗi hoặc tự đổi model.

## Không dùng Anti2 — NO-ANTI2-01, 11/10/2026
- Người dùng chỉ định: "không sử dụng anti 2 tiếp tục làm task". Ngừng dùng Anti2 cho FG từ chỉ định này; giữ evidence quan sát cũ, không ghi lại như quan sát mới.
- Tiếp tục task hiện tại tuần tự: Antigravity triển khai với Gemini 3.6 Flash (High), Codex review/áp dụng/kiểm thử/chốt. Giữ nguyên scope, acceptance, headed UI/E2E, Telegram đã được ủy quyền và các gate; không chờ Anti2 để tiếp tục.

## AUTH-CHANGE-02 — 07/10/2026
- Giữ Discord, thêm đăng ký/đăng nhập email+mật khẩu, xác minh/reset/đổi/thêm mật khẩu có xác minh; scrypt hash mật khẩu, dữ liệu riêng bảo vệ qua HTTPS/ACL/mã hóa lưu trữ/backup, không hash mọi trường. Đọc spec mục14 và bàn giao AUTH-CHANGE-02 trong task.md.
- Người dùng chốt mockup04 đăng nhập desktop/mobile ngày07/10/2026; đọc frontend-design mục11, giữ bố cục/phong cách đã duyệt, không hỏi lại. Bên coding/build triển khai sau task hiện tại review PASS qua AUTH02-DATA → AUTH02-BE → AUTH02-FE, theo gate/rebaseline có evidence gồm hash ảnh04. Không đánh PASS tính năng từ duyệt ảnh; lần cập nhật này chỉ ghi tài liệu.

## Bảng tin được người dùng duyệt — 07/10/2026
- FEED-CHANGE-01: Bảng tin cộng đồng chung, bài chữ/ảnh, thích, bình luận/trả lời và lọc game/loại bài. Đọc spec mục13, frontend-design mục10 và mockup03 desktop/mobile đã được duyệt bố cục; giữ màu sắc/phong cách FG.
- Triển khai lần lượt T38-FEED-DATA → T38-FEED-BE → T38-FEED-FE sau T38, trước T39; không nhảy task hiện tại. Rebaseline do thay yêu cầu phải có review/evidence, không tự đổi PASS hay nới checker.

## Sáng/Tối/Hệ thống — THEME-CHANGE-01
- User duyệt bản preview app thật ngày07/10/2026; đọc spec mục15, frontend-design mục12, LIGHT01-FE trong task.md. Light giữ layout/Inter/CTA xanh, dark baseline giữ nguyên; hình thức light cần review ảnh/app thật.
- Không chạy song song task hiện tại; chỉ mở LIGHT01-FE sau tiền nhiệm PASS và rebaseline review, sau AUTH02 đã xếp trước đó. Không dựng data hoặc thành công auth/feed giả; headed UI/E2E, lưu evidence thật. Hiện chưa có bản preview light để tuyên bố hoàn thành.

## SUPPORT-ADMIN-01 — 07/10/2026
- Mockup05 quản trị hỗ trợ đã duyệt; đọc spec mục16 và design mục13. Form góp ý/báo lỗi, chat riêng với admin, bot chỉ xác nhận nhận tin, notes nội bộ chỉ admin. Mockup05 không phải light preview.
- Chỉ tài khoản kingame có quyền admin, login qua trang chung; quyền gắn duy nhất userId trong ADMIN_USER_IDS server, bỏ đường ADMIN_DISCORD_IDS/nhiều admin. Không cấp theo tên/email client hoặc helper. APIs/realtime phải enforce và revoke khi logout/ban/thu hồi quyền.
- AUTH-PASSWORD-03 thay policy cũ: mật khẩu mới8–128 Unicode code points,1 chữ hoa Lu và1 ký tự đặc biệt P/S, không trim/normalize; áp dụng cả provision kingame, ngoại lệ độ dài cũ không miễn composition. Email admin đã được cung cấp riêng; mật khẩu ban đầu chưa có ký tự đặc biệt, cần đặt qua local bảo mật trước provision. Không password/hash/email riêng trong docs/repo/logs/API; dùng salted scrypt. Task AUTH-ADMIN-SINGLE cần gate/review, không ghi đã tạo tài khoản khi chưa có evidence.

## Sidebar danh mục đã duyệt — SIDEBAR-CHANGE-01, 07/10/2026
- LOADING3D-CHANGE-01 (09/10/2026): đọc spec18/design14/task LOADING3D-FE. Logo FG3D xoay360/nổi trên progressbar vô định cho initial loading thật, không progress giả; reduced-motion/tab-hidden, draft/session/call giữ nguyên. Coding and build 2 triển khai sau CHATCRYPTO-QA PASS và trước T29 qua rebaseline review, dùng logo canonical GAME-LOGO-FE đã PASS; không chen task hiện tại/đổi PASS/checker. Preview scratch chỉ minh họa.
- FG-BRAND-LOGO-01 (08/10/2026): người dùng chọn mẫu01 FG ghép khối tại .doc/mockups/fg-logo-concepts/01-monogram.png cho logo web/sidebar và favicon/PWA icons. Scope bàn giao trong task GAME-LOGO-FE/design mục2, giữ sidebar hẹp; chỉ ghi tài liệu lúc này, không coi ảnh là asset/runtime hoặc PASS.
- Người dùng chốt .doc/mockups/08-sidebar-fixed-compact-preview.png (SIDEBAR-COMPACT-APPROVED); đọc design mục6 và task GAME-LOGO-FE. Sidebar desktop/tablet luôn hẹp72px, logo24px/hàng46px, tooltip và accessible name; bỏ toggle/mở rộng/persistence rộng-hẹp, mobile dùng drawer. Không nhầm ảnh sidebar với mockup08 theme sáng.
- Duyệt hình không là PASS code/test. Triển khai sau gate task hiện tại và rebaseline có evidence/hash ảnh, không sửa ledger/PASS hoặc chạy song song trong lần cập nhật tài liệu.

## Quan sát kiểm thử trực tiếp — 07/10/2026

- TEST-VISIBILITY-01 (đã điều chỉnh theo người dùng): Chỉ test UI tương tác trên ứng dụng và E2E local phải mở cửa sổ trình duyệt/app để người dùng quan sát thao tác thật, dùng headed.
- Không cần hiện terminal hoặc log cho bất kỳ test nào. Unit/component test chạy DOM giả lập, integration/API/DB/smoke/load được chạy nền; không cần dựng browser giả.
- Mọi test vẫn lưu command/time/exit code/logs/hashes và evidence thật trong code/. Không tự chạy watch vô hạn, chạy song song hay giảm assertions để trình diễn.
- UI/E2E không mở được cửa sổ hoặc chạy trên CI/host không GUI thì báo rõ giới hạn trước run; không coi headless/trace/video là đã đáp ứng quan sát trực tiếp local.

## Báo ảnh test UI qua Telegram — 10/10/2026

- UI-TELEGRAM-REPORT-01 (10/10/2026, user đã xác nhận): mọi lần test UI/E2E Chrome/Chromium headed tiếp theo phải publish ảnh app viewport từng nhóm thao tác/assertion, đầu/cuối run và lỗi bằng code/tools/telegram-bridge/demo-stream.mjs captureUiStep; đọc tools/telegram-bridge/DEMO.md. Chỉ actual headed/synthetic fixtures/privacy review/mask secrets; giữ command/time/exit/assertions và evidence task thật, không ảnh cũ làm run mới/không đổi PASS. Helper stream auto gửi Telegram cho Ken, /demo lấy bước mới nhất; chọn ảnh đáp ứng ảnh hoặcvideo, chưa claim video. Tích hợp producer trong script task được phép trước UI run, không sửa frozen source/evidence. Không thể capture/send thì ghi rõ thiếu bằng chứng gửi; test result và Telegram receipt khác nhau. Áp dụng từ lần nối mới; các run đã đóng trước đó không backfill.
