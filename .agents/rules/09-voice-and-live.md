---
trigger: glob
description: "FG voice/live limits, authority, lifecycle and selected video subscription."
globs: "code/apps/api/src/modules/calls/**, code/apps/web/src/features/calls/**, code/apps/web/src/features/live/**, code/tests/load/media/**"
---

# FG — Voice và live
- Member-only; max10/call tính cả players/viewers, max3screen publishers; enforce server/SFU.
- Nhiều call groups trong một persistent room. Team roster không đồng nhất call membership.
- Viewer được mic bình thường; tự mic và volume/local mute chỉ ở phía nghe.
- Moderator restriction ngăn self-unmute đến khi được allow; không chỉ disable button.
- 720p30 mặc định, adaptive video, ưu tiên audio; PC phát, mobile mic/view.
- Một video chính được subscribe; stream selector không tự tải3video full-quality.
- LiveKit admission/reservation/token/webhooks phải chống races/replay, kiểm thực tế qua SFU.
- Verify webhook signatures, dedup, reconcile lost events và cleanup reservations.
- Last explicit leave đóng call, không xóa room/chat hoặc end team; disconnect grace theo T00.
- Mời bạn vào room trước khi bạn đó vào call/live; không public hóa phòng riêng.
- YouTube/Twitch embed whitelist, Twitch parent đúng host; không fetch arbitrary URL hay relay qua SFU.
- Không thêm camera, recording hoặc storage live ngoài spec.

