---
trigger: glob
description: "FG backend authorization, transactions, realtime and worker reliability."
globs: "code/apps/api/**, code/apps/worker/**"
---

# FG — Backend
- API/realtime ở apps/api; notifications/reminders ở apps/worker.
- REST nghiệp vụ /api/v1; Better Auth /api/auth/*; Socket.IO /socket.io; giữ same-origin theo plan.
- Dùng contracts đã khóa; validate input, error codes và HTTP status đúng, không HTTP200 kèm lỗi.
- Server enforce session, membership, permission, capacities và ownership cho mọi pathway.
- Room PUBLIC không làm chat/call của room thành public; guest chỉ đọc Lobby/thẻ.
- DB commit trước broadcast; outbox trong transaction; retries có dedup/idempotency.
- Accept vào đội chơi-ngay cấp active slot atomic và hủy requests tương ứng; invite direct không bypass.
- ROOM invitation khác PLAY_SESSION invitation; viewer không chiếm active team slot.
- End team, leave call, leave room là ba lifecycle khác nhau.
- Socket join/event và token refresh phải recheck quyền; ban/logout không để connection cũ tiếp tục truy cập.
- Không relay audio/video bằng Socket.IO; media qua LiveKit.
- Không tự ghép OAuth identities chỉ vì trùng email; theo auth library và policy T00.
- Public profile không lộ email/provider IDs/secrets; logs redacted.

