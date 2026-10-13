# FG

Ứng dụng cộng đồng game: React/Vite frontend, NestJS API, PostgreSQL/Drizzle,
Redis, LiveKit và OpenBao. Mã nguồn ứng dụng nằm trong thư mục `code/`.
Spec, thiết kế và thứ tự checkpoint nằm trong `../.doc/`.

## Clone và chuẩn bị

```sh
git clone https://github.com/kendayyy/FGweb.git
cd FGweb/code
npm ci
```

Dùng Node.js >=24 và npm >=11 theo `package.json`; Docker cần cho các dịch vụ
local. Copy `.env.example` thành `.env.local` rồi cung cấp cấu hình riêng.
Template chỉ chứa các biến cơ sở; đọc cấu hình module đang sử dụng để bổ sung
biến tương ứng. Không commit secrets. `.env.local`, `infra/.env.local`, private
keys, dependencies và dữ liệu `.runtime/` được giữ ngoài Git.

## Build từng workspace

Chạy từ `code/`, theo thứ tự phụ thuộc:

```sh
npm run build --workspace @fg/contracts
npm run build --workspace @fg/database
npm run build --workspace @fg/api
npm run build --workspace @fg/web
```

Frontend xuất vào `apps/web/dist/`, API vào `apps/api/dist/`. Root `npm run
build` hiện vẫn là placeholder; dùng lệnh workspace ở trên. Hướng dẫn này
được đối chiếu với manifests, chưa là bằng chứng một lượt build mới.

## Chuẩn bị deploy

Repo public giúp clone và kết nối với hệ thống build. Dự án hiện đang ở T30;
staging HTTPS, backup/restore và cấu hình deploy thuộc T40, kiểm thử tải thuộc
T41, release review thuộc T42. Chưa có deployment production được xác nhận.

- Host frontend static từ `apps/web/dist/`, cấu hình fallback về `index.html`
  cho React Router và các security headers theo ứng dụng.
- API cần tiến trình Node riêng cùng các workspace dependencies; tiến trình
  được cung cấp biến môi trường server trước khi khởi động. Reverse proxy
  `/api` và `/socket.io` đến API, hỗ trợ WebSocket và HTTPS.
- Cung cấp PostgreSQL, Redis, SMTP, LiveKit/TURN, upload storage và OpenBao
  theo các module đã triển khai. Chỉ frontend static không đủ cho toàn app.
- Cấu hình domain, `PUBLIC_ORIGIN`, Better Auth URL và Discord callback cho
  môi trường đích; kiểm tra cookie/CORS/ACL. Secrets server không đưa vào bundle
  browser hoặc repo.
- Migration phải được review và chạy trên database đích có backup. Cấu hình
  local `infra/compose.local.yml` cùng tài liệu `infra/chat-crypto/README.md`
  không thay cho cấu hình production.

Evidence kiểm thử lịch sử nằm trong `quality/evidence/`; trạng thái checkpoint
ở `quality/tasks.json`. Các scripts lịch sử chỉ là bằng chứng: đọc hướng dẫn
CODEX-ONLY trong `../AGENTS.md` trước khi chạy bất kỳ script nào.
