---
trigger: glob
description: "FG shared API DTO schemas and integration boundaries."
globs: "code/packages/contracts/**"
---

# FG — Contracts
- Một nguồn DTO/Zod schemas/event names ở packages/contracts.
- T03 khóa API contract trước BE/FE nghiệp vụ; downstream import cùng types.
- Không viết DTO copy riêng ở frontend/backend để che mismatch.
- ID opaque string, timestamps UTC ISO; UI Asia/Bangkok mặc định.
- Phân biệt RoomDTO, PlaySessionDTO, RecruitmentDTO, CallGroupDTO và Invitation target.
- Payload không lộ server tokens/keys trừ short-lived media token trả cho authorized member.
- Đổi contract phải cập nhật producers, consumers, tests và api-contract.md trong task sở hữu.
- Rule mới không thay spec: khi có conflict ghi rõ và cập nhật theo yêu cầu người dùng, không tự chọn behavior.

