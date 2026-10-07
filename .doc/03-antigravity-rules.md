# FG — Rules cho Antigravity

Ngày tạo:04/10/2026. Các file là hướng dẫn agent, chưa triển khai ứng dụng hoặc cơ chế filesystem sandbox.

## Vị trí và kích hoạt

Antigravity quét file Markdown trực tiếp tại .agents/rules/. Mỗi file có YAML trigger hợp lệ; không dùng định dạng .mdc của Cursor. Các file AGENTS.md không cần frontmatter. Thông tin định dạng được xác minh theo [tài liệu Antigravity chính thức](https://www.antigravity.google/docs/rules/).

Mở **E:/FGweb** làm project/workspace để spec, mockup và rules nằm trong phạm vi. Shell/terminal chạy build phải ở **E:/FGweb/code**. Không chỉ mở .doc.

```text
FGweb/
  AGENTS.md
  .agents/
    rules/
      00-project-context.md
      01-workspace-boundaries.md
      02-task-sequence.md
      03-dependencies-and-services.md
      04-frontend-design.md
      05-backend-services.md
      06-database-schema.md
      07-contracts.md
      08-testing-and-evidence.md
      09-voice-and-live.md
      10-operations-and-scale.md
  .doc/
    01-product-spec.md
    02-frontend-design.md
    03-antigravity-rules.md
    task.md
    mockups/
  code/
    AGENTS.md
    ... ứng dụng được build tại đây
```

## Danh mục

| File | Kích hoạt | Mục đích |
| --- | --- | --- |
| [00-project-context.md](../.agents/rules/00-project-context.md) | always_on | FG project context, approved specifications and startup reading order. |
| [01-workspace-boundaries.md](../.agents/rules/01-workspace-boundaries.md) | always_on | Only write application code, configs and test artifacts under E:/FGweb/code. |
| [02-task-sequence.md](../.agents/rules/02-task-sequence.md) | always_on | Follow FG task.md sequentially without skipped tasks or false completion. |
| [03-dependencies-and-services.md](../.agents/rules/03-dependencies-and-services.md) | always_on | Install locked dependencies and configure required APIs before feature code. |
| [04-frontend-design.md](../.agents/rules/04-frontend-design.md) | glob | FG frontend must preserve approved colors, Inter typography and desktop/mobile layout. |
| [05-backend-services.md](../.agents/rules/05-backend-services.md) | glob | FG backend authorization, transactions, realtime and worker reliability. |
| [06-database-schema.md](../.agents/rules/06-database-schema.md) | glob | FG PostgreSQL schema ownership, constraints and verified migrations. |
| [07-contracts.md](../.agents/rules/07-contracts.md) | glob | FG shared API DTO schemas and integration boundaries. |
| [08-testing-and-evidence.md](../.agents/rules/08-testing-and-evidence.md) | always_on | FG requires real tests and evidence before each task passes. |
| [09-voice-and-live.md](../.agents/rules/09-voice-and-live.md) | glob | FG voice/live limits, authority, lifecycle and selected video subscription. |
| [10-operations-and-scale.md](../.agents/rules/10-operations-and-scale.md) | glob | FG infrastructure, scope-safe project outputs and verified thousand-user media capacity. |

Rules chung luôn áp dụng; rules glob kích hoạt theo files của subsystem. Không đặt rule trong thư mục con của rules/ vì native scan không tự đệ quy theo tài liệu. Không nhúng cả task.md bằng file includes: tài liệu lớn cần được đọc riêng theo task để không làm rule bị cắt/tràn context.

## Kiểm trước buổi build

**TEST-VISIBILITY-01, điều chỉnh07/10/2026:** Chỉ UI tương tác trên ứng dụng và E2E local mở browser/app headed để người dùng quan sát. Không cần hiện terminal/log; unit/component DOM giả lập, integration/API/DB/smoke/load được chạy nền. Đọc rule08 và task.md; mọi test vẫn lưu evidence/exit code thật. UI/E2E không có GUI/công cụ không mở được cửa sổ thì báo trước và ghi hạn chế. Người dùng đã yêu cầu cửa sổ UI/E2E nhìn thấy được, không cần xin lại; terminal/helper khác không cần hiện.

1. Mở FGweb trong Antigravity; trong Customizations → Rules kiểm các workspace rules hiện lên và trigger đúng nếu surface có panel đó.
2. Yêu cầu agent báo ba nguồn chuẩn, cwd build, task đầu chưa PASS và file rules cho phần sắp sửa.
3. Tên FG và ba mockup đã duyệt; ảnh03 Bảng tin được duyệt bố cục ngày07/10/2026. Đọc spec mục13, frontend-design mục10 và task.md cho FEED-CHANGE-01; không hỏi lại UI.
4. T01 dependencies, T02 services/smoke; chưa PASS thì không viết feature code.
5. Chỉ sau setup mới có gate checker/ledger tự động. Rules Markdown không tự chặn filesystem writes; agent phải tuân thủ và evidence checker sẽ được T02 triển khai.

## Prompt khởi động

### Khi nhận thay yêu cầu Bảng tin ngày07/10/2026

> Đọc FEED-CHANGE-01 trong spec mục13, frontend-design mục10 và task.md; xem mockup03 đã duyệt. Giữ phong cách FG. Xử lý baseline migration có evidence trước khi tiếp tục build, giữ task đang xử lý và các FIX; không đổi PASS chỉ vì yêu cầu mới. Bảng tin triển khai tuần tự sau T38 qua T38-FEED-DATA/BE/FE rồi mới T39. API/DB/tests thật, không mock production, không code ngoài code/. Giữ Gemini3.6 Flash (High), Antigravity triển khai, Anti2 theo dõi, Codex review/chốt.

> Đọc AGENTS.md và .agents/rules tại E:/FGweb. Đọc .doc/01-product-spec.md, .doc/02-frontend-design.md, .doc/task.md; xem mockup đã duyệt. Báo workspace root, cwd chạy build, nguồn spec, rules đang áp dụng và task đầu chưa PASS. Làm đúng một task theo thứ tự, không skip/parallel. Tên FG và UI đã duyệt. Chỉ code trong E:/FGweb/code; cài deps ở T01 và cấu hình APIs/smoke ở T02 trước business code. Lưu test evidence trước PASS, dừng đúng task nếu blocker. Không tự mua dịch vụ hoặc publish production.

Đây là cấu hình project, không thay global rules/settings Antigravity của người dùng. Nếu phiên bản cũ không nhận .agents/rules, kiểm khả năng cập nhật/cấu hình theo documentation phiên bản đó; không tạo nhiều bản rule khác nhau gây lệch.

