---
trigger: glob
description: "FG infrastructure, scope-safe project outputs and verified thousand-user media capacity."
globs: "code/infra/**, code/scripts/**, code/tests/load/**"
---

# FG — Vận hành và tải
- Infra/scripts/test outputs trong code/; local runtime mounts dưới code/.runtime.
- Staging/prod tách data/secrets; HTTPS, OAuth origins/callbacks và TURN/network được kiểm.
- Images/deps khóa version; không mặc định Kubernetes hoặc microservices tăng chi phí.
- Backup DB+uploads; phải restore và kiểm ACL/history thật, không chỉ báo backup file tồn tại.
- Mục tiêu1.000 người đồng thời call/live, không hạ200 hoặc thay bằng1.000 socket chat.
- T41 test workload audio và screen-heavy30phút; load generators riêng máy; ghi CPU/RAM/bitrate/egress/TURN/quality.
- Không dùng benchmark vendor hoặc silent synthetic audio để khẳng định toàn trải nghiệm tiếng rõ.
- Tự quản LiveKit là phương án đề xuất; capacity và rẻ nhất phải có benchmark/dự toán, chưa tự mua host.
- Paid load test hoặc chi tiêu cần người dùng chốt ceiling; không chạy phát sinh phí không giới hạn.
- Không publish production trước release review; không auto dùng credentials thật ở test.
- Resolve target path trước filesystem operations; không recursive delete/move ra ngoài scope.

