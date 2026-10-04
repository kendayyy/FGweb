# FG — Chuẩn bị cấu hình T02

T01 đã PASS. T02 chưa PASS: thiếu SMTP và thông tin liên hệ Web Push; Discord credential/callback chưa được xác minh. Chỉ điền trên máy trong E:/FGweb/code/.env.local; không gửi secret vào chat.

## Discord

1. Trong https://discord.com/developers/applications mở ứng dụng FG, phần OAuth2.
2. Nếu chưa reset secret đã xuất hiện trong chat, bấm Reset Secret rồi cập nhật DISCORD_CLIENT_SECRET trong .env.local. Client ID đã có; không cần gửi lại.
3. Thêm Redirect URI chính xác: http://localhost:5173/api/auth/callback/discord. Frontend local dùng5173, proxy /api sang backend3000. Đây là cấu hình dev; callback endpoint được implement tại T08, chưa thể tuyên bố login thật ở T02.
4. Quyền đăng nhập identify/email; không cần bot token, bot permissions hoặc đưa bot vào server.
5. Ghi xác nhận redirect đã lưu, không ghi secret, vào quality/evidence/T02/provider-config-confirmation.md khi chuẩn bị xong. Client/callback kiểm T02, login thật kiểm T08.

Nguồn: [Better Auth Discord](https://better-auth.com/docs/authentication/discord), [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2). Base URL phải khớp origin thực tế; ví dụ3000 trong docs là ví dụ, FG dùng frontend5173 làm same-origin proxy.

## SMTP cho phát triển

Có thể dùng Gmail nếu tài khoản hỗ trợ App Password. Bật xác minh2bước và tạo App Password cho FG tại https://myaccount.google.com/apppasswords. Nếu không thấy lựa chọn, xem điều kiện tài khoản trong nguồn Google dưới đây; không dùng mật khẩu đăng nhập thông thường để thay thế.

Thêm vào .env.local (giữ nguyên Discord fields đã điền):

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
VAPID_SUBJECT=
```

SMTP_USER: email đầy đủ; SMTP_PASSWORD: App Password; SMTP_FROM: địa chỉ gửi tương ứng. VAPID_SUBJECT: mailto:địa-chỉ-liên-hệ-của-bạn. SMTP bằng Gmail độc lập với Discord-only login. Đây là phương án dev; vận hành thật sẽ đánh giá giới hạn/delivery trong task sở hữu, chưa chọn hoặc mua dịch vụ trả phí.

Nguồn: [Google App Password](https://support.google.com/accounts/answer/185833), [Nodemailer Gmail](https://nodemailer.com/guides/using-gmail), [SMTP preset](https://nodemailer.com/smtp/well-known-services).

## Bước tiếp theo

Sau khi bạn điền SMTP/contact và lưu redirect, báo "đã cấu hình T02". Agent chỉ kiểm tên biến/trạng thái thiếu, không in giá trị. Khi đủ input, T02 tạo các secrets ứng dụng/VAPID local, env checker, service smoke, task gate và tests theo task.md. SMTP verify không gửi email; chưa chứng minh delivery. OAuth configuration không chứng minh login; Web Push keys không chứng minh notification đã tới thiết bị. Không mở T03 trước T02 PASS.
