---
trigger: always_on
description: "Install locked dependencies and configure required APIs before feature code."
---

# FG — Dependencies và API
- Danh sách và phiên bản/compatibility gate theo mục3 .doc/task.md; không tự thêm framework.
- T01 chỉ bootstrap configs/manifests tối thiểu và cài dependencies; không chèn business logic.
- Khóa package-lock.json, stable versions và Docker image versions/digests; không dùng latest/prerelease tùy tiện.
- Font Inter self-host phải cài cùng dependencies frontend trước khi viết UI.
- T02 cấu hình Google/Discord OAuth, PostgreSQL, Redis, LiveKit, SMTP, VAPID và origins/callbacks.
- APIs là dịch vụ phải cấu hình; không tuyên bố đã cài API chỉ vì thêm npm package.
- Thiếu keys: ghi tên biến thiếu, không bịa key, không yêu cầu người dùng dán secret vào chat.
- Unit mocks chỉ trong tests. Smoke SMTP verify không chứng minh đã giao email; OAuth config check không chứng minh login thật; VAPID config không chứng minh push đã tới máy.
- Kiểm tích hợp thật tại task sở hữu sau khi endpoint/client có implementation.
- Không cài CLI global dự án; không tự mua dịch vụ, tạo tài khoản hoặc deploy production.
- .env.example chỉ có tên biến và placeholder; .env.local phải ignore ngay tại setup.

