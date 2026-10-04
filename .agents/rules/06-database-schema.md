---
trigger: glob
description: "FG PostgreSQL schema ownership, constraints and verified migrations."
globs: "code/packages/database/**"
---

# FG — Database
- PostgreSQL/Drizzle schema, migrations và query layer chỉ ở packages/database.
- Better Auth schema phải phù hợp generator/version đã lock; không sao chép schema lệch adapter.
- Mọi thay schema có migration reviewed và integration test PostgreSQL thật.
- Seed7game và một Lobby/game idempotent, không duplicate khi chạy lại.
- Phân biệt persistent room, play session/roster, recruitment, call group/members.
- Unique active_play_slots.userId + transaction bảo vệ một đội chơi-ngay/user.
- Capacity/admission kiểm atomic; không chỉ SELECT count rồi INSERT ở hai requests độc lập.
- Chat clientMessageId dedup; cursor(createdAt,id) stable; index theo access path.
- FK/unique constraints bảo vệ dữ liệu, không thay authorization backend.
- End call/end buổi chơi không cascade-xóa room hoặc lịch sử.
- Kiểm migrate DB trống và DB có dữ liệu; không reset/drop dữ liệu để test qua.
- Không tự destructive migration hoặc xóa DB thật; backup/restore theo task OPS và phạm vi user chỉ định.

