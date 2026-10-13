# FG T30 — Phân tích đường khóa (Lock-Path Analysis) & Đề xuất tối ưu tối thiểu

> **Trạng thái**: Đề xuất chẩn đoán và giải pháp cách ly (Sequential Isolated Proposal)  
> **nativeAcceptance**: `false` (Bất biến theo quy tắc dự án; cần kiểm thử độc lập bởi root/Codex)  
> **Mục tiêu**: Giải quyết hiện tượng nghẽn hàng đợi khóa (lock queue starvation) dẫn đến `statement_timeout = 3000ms` (SQLSTATE `57014`) trên bảng `rooms` trong run Native 59 `t30-native-6fc2725b41ee46e59e6245002dbea9ac`.

---

## 1. Tóm tắt nguyên nhân gốc (Root Cause Boundary Analysis)

Trong lần chạy Native 59 (`t30-native-6fc2725b41ee46e59e6245002dbea9ac`), quá trình kiểm thử thất bại ở mốc 45s do participant phía receiver bị LiveKit SFU ngắt kết nối (`SERVICE_REQUEST_REMOVE_PARTICIPANT` lúc 17:33:06.624Z). Sự cố được phân tích chi tiết qua các bằng chứng thực tế:

1. **Gateway Query Timeout (17:33:06.563Z)**:
   - Kết nối PID `13795` của signaling-gateway thực thi `lockedLease` (`SELECT id FROM rooms WHERE id=$1 FOR SHARE`) bắt đầu lúc `17:33:03.536Z`.
   - Câu truy vấn bị khóa và đợi đến `17:33:06.563Z` (thời gian chạy `3026.66ms`).
   - PostgreSQL kích hoạt `statement_timeout` (3000ms) và trả về lỗi SQLSTATE `57014` (`canceling statement due to statement timeout`).
   - Gateway xử lý lỗi bằng cách `ROLLBACK` và gọi `RoomService.removeParticipant` lúc 17:33:06.589Z, làm LiveKit SFU trục xuất receiver.

2. **Cơ chế nghẽn hàng đợi (Lock Queue Starvation Chain)**:
   - **17:33:02.159Z - 17:33:04.725Z**: PID `13921` (`RoomsService.listRoomMembers`) giữ `rooms FOR SHARE`.
   - **17:33:03.252Z - 17:33:05.324Z**: PID `13793` (`signaling-gateway` `liveLease`) giữ `rooms FOR SHARE`.
   - **17:33:03.461Z**: PID `13843` (API transaction 105 thực hiện `CallsService.join` cho `POST /api/v1/calls/.../join`) yêu cầu khóa độc quyền `rooms FOR UPDATE`. Vì có PID 13921 và 13793 đang giữ `FOR SHARE`, PID 13843 phải xếp hàng chờ trong lock wait queue.
   - **17:33:03.536Z**: PID `13795` (gateway) yêu cầu `rooms FOR SHARE`. Theo thuật toán quản lý khóa của PostgreSQL (FIFO lock queue with writer preference), yêu cầu khóa chia sẻ (`FOR SHARE`) đến sau một yêu cầu khóa độc quyền (`FOR UPDATE`) đang chờ sẽ bị xếp hàng **phía sau** yêu cầu khóa độc quyền để tránh hiện tượng bỏ đói bên ghi (writer starvation).
   - **17:33:05.480Z**: Sau khi các giao dịch `FOR SHARE` trước đó commit (sau 2018.66ms chờ), PID `13843` nhận được khóa độc quyền `rooms FOR UPDATE`.
   - **17:33:05.480Z - 17:33:07.340Z**: PID `13843` giữ khóa `rooms FOR UPDATE` trong **1860.1ms** (`roomHoldMs: 1860.1ms`).
   - **17:33:06.563Z**: Tổng thời gian chờ của PID `13795` tích lũy = `1944ms` (chờ PID 13843 nhận khóa) + `1083ms` (chờ PID 13843 nhả khóa) = **3026.66ms**, vượt ngưỡng `statement_timeout` 3000ms.

---

## 2. Giải phẫu đường găng thực thi (Critical Path Deconstruction) trong `CallsService.join`

Quan sát `apps/api/src/modules/calls/calls.service.ts` (dòng 103–135) chỉ ra 3 điểm nghẽn chính làm kéo dài thời gian giữ khóa của transaction 105:

1. **Khóa độc quyền không cần thiết trên bảng `rooms`**:
   - Dòng 106 gọi `await this.room(db, group.room_id, user, session, prior ? [prior.room_id] : []);`.
   - Phương thức `room` có tham số mặc định `mode: LockMode = 'FOR UPDATE'`.
   - Nghiệp vụ `CallsService.join` **không bao giờ sửa đổi dữ liệu bảng `rooms`**. Dữ liệu được ghi chỉ nằm trên bảng `call_members`, `call_admissions`, và `webhook_events`.
   - Việc xin khóa `FOR UPDATE` trên `rooms` là thừa thãi và trực tiếp gây ra xung đột đối kháng với mọi truy vấn đọc/lease chia sẻ (`FOR SHARE`) của gateway và API.

2. **Thực thi RPC mạng ra ngoài (LiveKit `createRoom`) dưới giao dịch cơ sở dữ liệu**:
   - Dòng 130 gọi `await config.client.createRoom({name: 'fg-call_' + id, ...});` bên trong `this.transaction`.
   - Đây là một cuộc gọi HTTP Twirp qua mạng ra ngoài container LiveKit.
   - Việc giữ các khóa hàng độc quyền của PostgreSQL qua một lời gọi I/O mạng khiến thời gian giữ khóa biến thiên theo độ trễ mạng và tải của SFU (~50–350ms).

3. **Truy vấn xác thực `actor` bị lặp lại redundant**:
   - Dòng 106 thông qua `this.room()` đã gọi `await this.actor(db, user, session);` (kiểm tra session còn hạn, tài khoản không bị ban, và đã onboarding).
   - Đến dòng 133, `join()` lại gọi tiếp một lần nữa: `await this.actor(db, user, session);`.
   - Trong cùng một transaction không có bất kỳ thay đổi nào lên bảng `session`, `admin_actions`, hay `profiles`, việc gọi lại lần 2 tốn thêm 3 truy vấn DB thừa trong khi các khóa hàng đang bị giữ.

---

## 3. Đề xuất giảm thiểu khóa tối thiểu và hợp lệ (Smallest Defensible Reductions)

Đề xuất không can thiệp vào các logic nghiệp vụ bảo mật hay thay đổi hạn mức, tuân thủ nghiêm ngặt các quy tắc:

### Thay đổi 1: Sử dụng `FOR SHARE` cho bảng `rooms` trong `CallsService.join`
- Trong `CallsService.join`, chỉ định rõ chế độ khóa khi gọi `this.room()`:
  ```typescript
  await this.room(db, group.room_id, user, session, prior ? [prior.room_id] : [], 'FOR SHARE');
  ```
- **Lý do & Tính toàn vẹn**:
  - `FOR SHARE` đảm bảo dòng trong bảng `rooms` không thể bị xóa hoặc sửa đổi bởi transaction khác trong suốt quá trình join.
  - Các truy vấn `FOR SHARE` (như lease của gateway và `listRoomMembers`) **hoàn toàn tương thích và không khóa lẫn nhau** (Share locks do not conflict with Share locks).
  - Tránh hoàn toàn việc PostgreSQL đưa các truy vấn gateway vào hàng đợi nghẽn (starvation queue).
  - Tính tuần tự và hạn mức (10 người, 3 pub) vẫn được bảo vệ 100% bởi khóa độc quyền `call_groups FOR UPDATE` (dòng 107) và `call_members FOR UPDATE` (dòng 113, 123).

### Thay đổi 2: Đưa LiveKit RPC `createRoom` ra ngoài giao dịch database
- Di chuyển `config.client.createRoom` xuống thực thi sau khi transaction cơ sở dữ liệu đã commit (hoặc trước transaction dưới dạng idempotent guarantee).
- **Lý do & Tính toàn vẹn**:
  - Lệnh `createRoom` trong LiveKit là idempotent: nếu phòng đã tồn tại, SFU trả về thành công hoặc mã tương thích.
  - Loại bỏ hoàn toàn độ trễ I/O mạng ra khỏi thời gian giữ khóa DB (`roomHoldMs` và `groupHoldMs`), giảm thời gian giữ khóa xuống mức mili-giây thuần truy vấn.

### Thay đổi 3: Loại bỏ lệnh gọi redundant `this.actor()` tại dòng 133
- Bỏ dòng 133 `await this.actor(db, user, session);` trong `join()`.
- **Lý do & Tính toàn vẹn**:
  - `this.actor()` đã được thực thi và xác thực hợp lệ tại dòng 45 ngay trong cùng transaction.
  - Tiết kiệm 3 câu truy vấn SQL (`session FOR SHARE`, `admin_actions LIMIT 1`, `profiles FOR SHARE`), giúp transaction commit nhanh hơn.

---

## 4. Khắc phục định danh Observer (API Observer Attribution Fix)

### Nguyên nhân tx 105 bị gán `owner: "unassociated"`:
Trong `quality/evidence/T30/api56-observer-reviewed1.mjs`:
1. Danh sách `SAFE_SERVICE_OWNERS` thiếu `'CallsService.join'` và `'http-calls-join'`.
2. Hàm `instrumentHttpTimingMiddleware` chỉ kiểm tra `req.method === 'GET'`, bỏ qua hoàn toàn các HTTP POST (`POST /api/v1/calls/:id/join`).
3. Hàm `instrumentOwnedApiServices` chỉ wrap `['list', 'participants', 'withControlGroup']` của `CallsService`, bỏ sót method `join`.
4. Danh sách `SAFE_RPC_METHODS` của RoomServiceClient thiếu `'createRoom'`.

### Đề xuất bổ sung trong Observer:
- Bổ sung `'CallsService.join'` và `'http-calls-join'` vào `SAFE_SERVICE_OWNERS`.
- Bổ sung `createRoom` vào `SAFE_RPC_METHODS`.
- Wrap method `CallsService.prototype.join` trong `instrumentOwnedApiServices`.
- Mở rộng `instrumentHttpTimingMiddleware` để nhận diện route `POST /api/v1/calls/:id/join`.

---

## 5. Kế hoạch kiểm thử hồi quy trên PostgreSQL thật (Real-PG Regression RED Test Design)

Đề xuất kịch bản kiểm thử độc lập mô phỏng chính xác điều kiện chạy thực tế mà không cần chạy browser:

1. **Khởi tạo môi trường**:
   - Sử dụng PostgreSQL thật trên container `fg-local-postgres-1` với tham số `statement_timeout = 3000ms`.
   - Tạo sẵn 1 phòng họp và 1 cuộc gọi mở (`state = 'OPEN'`).

2. **Kịch bản tải đồng thời (Concurrent Race Simulation)**:
   - **Luồng 1 (Gateway lease)**: Thực hiện chuỗi liên tục các truy vấn `SELECT id FROM rooms WHERE id=$1 FOR SHARE` với tần suất mỗi 100ms.
   - **Luồng 2 (API Join)**: Thực hiện đồng thời 2 yêu cầu `CallsService.join` từ 2 người dùng khác nhau.
   - **Khẳng định (Assertions)**:
     - Toàn bộ các truy vấn lease của Luồng 1 phải hoàn thành thành công (`sqlState === null`) với thời gian thực thi < 200ms, không bao giờ chạm ngưỡng timeout 3000ms.
     - Luồng 2 phân bổ ghế thành công (ghế 1 và ghế 2), giữ nguyên hạn mức tối đa 10 người.

3. **Khẳng định tính đóng an toàn (Fail-closed Invariants)**:
   - Kiểm tra người dùng bị ban (`BAN` trong `admin_actions`) -> từ chối với `FORBIDDEN`.
   - Kiểm tra session hết hạn (`expires_at < clock_timestamp()`) -> từ chối với `LOGIN_REQUIRED`.
   - Kiểm tra người dùng chưa vào phòng (`room_members`) -> từ chối với `FORBIDDEN`.
   - Kiểm tra người thứ 11 cố gắng tham gia -> từ chối với `CAPACITY_FULL`.
