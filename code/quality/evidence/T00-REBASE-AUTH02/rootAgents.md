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

## Quan sát kiểm thử trực tiếp — 07/10/2026
- TEST-VISIBILITY-01 (đã điều chỉnh theo người dùng): Chỉ test UI tương tác trên ứng dụng và E2E local phải mở cửa sổ trình duyệt/app để người dùng quan sát thao tác thật, dùng headed.
- Không cần hiện terminal hoặc log cho bất kỳ test nào. Unit/component test chạy DOM giả lập, integration/API/DB/smoke/load được chạy nền; không cần dựng browser giả.
- Mọi test vẫn lưu command/time/exit code/logs/hashes và evidence thật trong code/. Không tự chạy watch vô hạn, chạy song song hay giảm assertions để trình diễn.
- UI/E2E không mở được cửa sổ hoặc chạy trên CI/host không GUI thì báo rõ giới hạn trước run; không coi headless/trace/video là đã đáp ứng quan sát trực tiếp local.
