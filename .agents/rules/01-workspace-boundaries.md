---
trigger: always_on
description: "Only write application code, configs and test artifacts under E:/FGweb/code."
---

# FG — Ranh giới thư mục
- Chỉ code trong E:/FGweb/code; mọi command cài/build/test chạy từ thư mục đó.
- Source, manifests, lockfiles, .env, migrations, scripts, infra, runtime và test artifacts đều trong code/.
- Không scaffold, npm install, viết script hoặc tạo node_modules ở workspace root hay .doc/.
- .doc/ chỉ chứa tài liệu/mockup; .agents/rules/ và AGENTS.md là metadata hướng dẫn agent được người dùng yêu cầu.
- Chỉ sửa spec/rules ngoài code theo yêu cầu người dùng, hoặc cập nhật tài liệu/evidence đúng task; không chuyển logic ứng dụng ra các vùng này.
- Trước write/move/delete, resolve đường dẫn tuyệt đối; xác minh vẫn thuộc code/ nếu là artifact triển khai.
- Không dùng symlink/junction/path ../ để đưa output triển khai ra ngoài code/.
- npm cache và browser-test artifacts dự án đặt code/.cache; dữ liệu local đặt code/.runtime.
- Folder ownership: apps/web frontend; apps/api API/realtime; apps/worker jobs; packages/database schema/query/migrations; packages/contracts DTO; infra deployment; tests e2e/load; quality evidence.
- Ví dụ hợp lệ: code/apps/web/src/features/lobby/. Không hợp lệ: FGweb/src/, .doc/server.ts.
- Mở E:/FGweb làm workspace để cả spec và rules nằm trong phạm vi đọc; shell vẫn ở code/.

