# FG — Hướng dẫn agent

Workspace mở tại E:/FGweb. Shell cài/build/test làm việc tại E:/FGweb/code.

## Đọc trước khi làm
1. .doc/01-product-spec.md — nghiệp vụ.
2. .doc/02-frontend-design.md — tên FG và thiết kế đã duyệt.
3. .doc/task.md — thứ tự task (48 checkpoint cơ sở và các task FIX trong ledger), acceptance, tests và evidence.
4. .agents/rules/*.md — rule chung và rule của phần đang sửa.

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

## Điều chỉnh quy trình được người dùng xác nhận — 06/10/2026
- Với FG, bỏ giới hạn hai vòng review/refactor cùng một lỗi của Antigravity. Tiếp tục sửa và kiểm thử trong task hiện tại đến khi Codex review đạt hoặc có blocker thực sự cần người dùng.
- Antigravity triển khai, Anti2 theo dõi, Codex review và chốt; giữ Gemini 3.6 Flash (High), một task mỗi lần, không mở task sau trước PASS.
- Thay đổi này chỉ bỏ giới hạn số vòng sửa; không nới phạm vi files, quyền truy cập, acceptance, kiểm thử hay điều kiện PASS. Không giả success, sửa test để che lỗi hoặc tự đổi model.

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

## Quan sát kiểm thử trực tiếp — 07/10/2026

- TEST-VISIBILITY-01 (đã điều chỉnh theo người dùng): Chỉ test UI tương tác trên ứng dụng và E2E local phải mở cửa sổ trình duyệt/app để người dùng quan sát thao tác thật, dùng headed.
- Không cần hiện terminal hoặc log cho bất kỳ test nào. Unit/component test chạy DOM giả lập, integration/API/DB/smoke/load được chạy nền; không cần dựng browser giả.
- Mọi test vẫn lưu command/time/exit code/logs/hashes và evidence thật trong code/. Không tự chạy watch vô hạn, chạy song song hay giảm assertions để trình diễn.
- UI/E2E không mở được cửa sổ hoặc chạy trên CI/host không GUI thì báo rõ giới hạn trước run; không coi headless/trace/video là đã đáp ứng quan sát trực tiếp local.
