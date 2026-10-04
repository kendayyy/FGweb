# FG — Hướng dẫn agent

Workspace mở tại E:/FGweb. Shell cài/build/test làm việc tại E:/FGweb/code.

## Đọc trước khi làm
1. .doc/01-product-spec.md — nghiệp vụ.
2. .doc/02-frontend-design.md — tên FG và thiết kế đã duyệt.
3. .doc/task.md — thứ tự45tasks, acceptance, tests và evidence.
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

