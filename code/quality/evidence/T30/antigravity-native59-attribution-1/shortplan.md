# FG T30 — Kế hoạch định danh đường găng biên kế tiếp (Next-Boundary Attribution Plan)

> **Trạng thái**: Đề xuất chẩn đoán định danh thuần túy (Diagnostic-Only Proposal)  
> **nativeAcceptance**: `false` (Bất biến; chờ root/Codex kiểm thử và xác nhận)  
> **Phạm vi ghi**: Độc quyền trong `code/quality/evidence/T30/antigravity-native59-attribution-1/**` và `.doc/history.md`.  
> **Nguyên tắc**: Không sửa đổi mã nguồn ứng dụng, không sửa canonical locks, không chuyển `createRoom` sang post-commit, không bỏ `actor()` check, không thay đổi deadline/pools/timeout.

---

## 1. Cơ sở chẩn đoán & Tiếp thu thẩm định của Root (Root Review Feedback)

Root đã bác bỏ hoàn toàn đề xuất can thiệp mã nguồn ứng dụng của phiên trước với các lý do kỹ thuật chuẩn xác:
1. `this.room(..., 'FOR SHARE')` vô tình hạ cấp cả khóa trên bảng `"user"`, phá vỡ cơ chế tuần tự hóa trọng tài join đa phòng/người dùng (serial multiroom/user join arbitration).
2. Chuyển `createRoom` sang post-commit tạo ra race condition: lease/member/marker đã commit trong DB nhưng LiveKit tạo phòng thất bại hoặc phòng bị đóng/quét dọn trước khi tạo, thiếu cơ chế bù trừ (compensation).
3. Bỏ `this.actor()` cuối cùng làm mất khả năng phát hiện session bị thu hồi hoặc tài khoản bị ban mới phát sinh trong thời gian trễ mạng dưới mức cô lập `READ COMMITTED`.
4. Không thể khẳng định chắc chắn transaction 105 chính là `CallsService.join` chỉ dựa trên tương quan thời gian với HTTP response lúc `17:33:07.397Z` khi chưa có span liên kết.
5. Chưa thể khẳng định `createRoom` nằm trong tx 105 vì bản thân `createRoom` chưa được observer bọc (wrap).

**Kết luận**: Không đưa ra bản vá ứng dụng (no source fix). Thay vào đó, bàn giao giải pháp chẩn đoán biên kế tiếp (next-boundary diagnostic) nhằm định danh chính xác 100% chủ thể giao dịch (owner), PID, HTTP parent span, và các lời gọi SDK RPC.

---

## 2. Bảng băm mã nguồn (Source Hashes & Baseline Verification)

Bảng băm SHA-256 các tập tin liên quan được đo lường thực tế trên môi trường:

| Tập tin nguồn | SHA-256 Checksum |
| :--- | :--- |
| `apps/api/src/modules/calls/calls.service.ts` | `863872d0893ed30a65c3348b0877a618e46f1941010d3927126dc4761f5a3a94` |
| `apps/api/src/modules/calls/calls.controller.ts` | `9e618e4506155fa043551f4bed69e8f25b66ec684ea6f4f1ddd85490a19620b0` |
| `quality/evidence/T30/api56-observer-reviewed1.mjs` | `904bacbd8114cd435ef012abee0dd5587631a326c685b494ba4417dc1f74f3dd` |
| `quality/evidence/T30/fixture-server-api56-db-bridge-reviewed1.mjs` | `15b258a319afb4c1883a57807e691bad0609ee5b566bd9cec16de02bd3d44b0c` |
| `quality/evidence/T30/native59-lock-boundary-root1.json` | Được bảo toàn làm mốc tham chiếu bất biến cho timeline và các ẩn số. |

---

## 3. Điểm neo ngược (Reverse Anchors) & Can thiệp tối thiểu trong `observer.mjs`

Mọi dòng mã trong [`observer.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native59-attribution-1/observer.mjs) được tái dựng chính xác theo từng byte so với [`api56-observer-reviewed1.mjs`](file:///E:/FGweb/code/quality/evidence/T30/api56-observer-reviewed1.mjs), chỉ bổ sung 4 móc neo tối thiểu sau:

### Anchor 1: Bổ sung định danh chủ thể an toàn (`SAFE_SERVICE_OWNERS`)
- **Vị trí**: Dòng 30–45 trong `observer.mjs`.
- **Nội dung**: Bổ sung `'http-calls-join'`, `'http-calls-self-mic'`, `'CallsService.join'`, và `'CallsService.selfMic'`.
- **Mục đích**: Ngăn chặn cơ chế fallback về `'unassociated'` khi context của `join` hoặc `selfMic` được kích hoạt.

### Anchor 2: Mở rộng nhận diện HTTP Timing Middleware cho POST Join & Self-Mic
- **Vị trí**: Dòng 130–185 trong `observer.mjs`.
- **Nội dung**:
  ```javascript
  const rawPath = typeof req.path === 'string' ? req.path : String(req.url ?? '').split('?')[0];
  let route = null;
  if (req.method === 'GET') {
    // Giữ nguyên 100% các route GET hiện có
    if (rawPath === '/api/v1/me') route = 'http-me';
    ...
  } else if (req.method === 'POST') {
    if (/^\/api\/v1\/calls\/[^/]+\/join$/.test(rawPath)) route = 'http-calls-join';
    else if (/^\/api\/v1\/calls\/[^/]+\/self-mic$/.test(rawPath)) route = 'http-calls-self-mic';
  }
  ```
- **Bảo toàn**: Chỉ sử dụng fixed enums, tuyệt đối không lưu raw URL, tham số, token hay request payload. Bọc trong `als.run(continueInContext, () => next())` để toàn bộ controller và service chạy dưới span này.

### Anchor 3: Bổ sung RPC `createRoom` vào danh sách cho phép
- **Vị trí**: Dòng 381–389 trong `observer.mjs`.
- **Nội dung**: Thêm `'createRoom'` vào `SAFE_RPC_METHODS`.
- **Bảo toàn**: Chỉ ghi nhận metadata `{type: 'rpc', method: 'createRoom', startedAt, completedAt, durationMs, spanIndex, parentSpanIndex, owner, backendPid, transactionIndex, ok, code}`. Tuyệt đối không ghi nhận tham số, options, tokens, hay kết quả trả về của LiveKit.

### Anchor 4: Bọc phương thức `join` và `selfMic` trong `instrumentOwnedApiServices`
- **Vị trí**: Dòng 514–520 trong `observer.mjs`.
- **Nội dung**: Thay đổi danh sách lặp từ `['list', 'participants', 'withControlGroup']` thành `['list', 'participants', 'join', 'selfMic', 'withControlGroup']`.
- **Bảo toàn**:
  - Bảo toàn tuyệt đối danh tính `this`, `args`, kết quả trả về, promise resolution, synchronous throw, và asynchronous rejection.
  - Không thêm bất kỳ lệnh `await`, ghi file, hay ném lỗi nào vào hàm gốc (`Reflect.apply(orig, this, args)`).
  - Giao dịch bên trong sẽ tự động kế thừa `ctx` từ ALS, gán đúng `owner: 'CallsService.join'` (hoặc `'CallsService.selfMic'`) và liên kết với HTTP parent span.

---

## 4. Tái dựng bản sao Fixture Server (`fixture-server.mjs`)

Tập tin [`fixture-server.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native59-attribution-1/fixture-server.mjs) được sao chép trực tiếp từ [`fixture-server-api56-db-bridge-reviewed1.mjs`](file:///E:/FGweb/code/quality/evidence/T30/fixture-server-api56-db-bridge-reviewed1.mjs), chỉ thay đổi duy nhất dòng 2:
```javascript
// Dòng 2 cũ:
import {instrumentOwnedApiPools,instrumentRoomServiceClient,instrumentOwnedApiServices,instrumentHttpTimingMiddleware,startApiLockSpansObserver,instrumentInitialRoomServices} from './api56-observer-reviewed1.mjs';

// Dòng 2 mới:
import {instrumentOwnedApiPools,instrumentRoomServiceClient,instrumentOwnedApiServices,instrumentHttpTimingMiddleware,startApiLockSpansObserver,instrumentInitialRoomServices} from './observer.mjs';
```
Toàn bộ 5 build pins tại dòng 312–320 và các logic khởi tạo PostgreSQL, Redis, Media, Web preview được bảo toàn 100% không đổi một ký tự.

---

## 5. Kế hoạch kiểm chuẩn có ý nghĩa (Meaningful Controls Plan)

Root sẽ kiểm tra và thực thi các kiểm chuẩn sau trước khi cân nhắc bất kỳ lần chạy headed nào:

### Kiểm chuẩn 1: Bảo toàn nguyên vẹn hàm & AsyncLocalStorage (Unit Identity Controls)
Tập tin kiểm chuẩn độc lập xác minh các thuộc tính toán học của wrapper trong `observer.mjs`:
1. **Preserve `this` Context**: Gọi method với custom object context, kiểm tra `this` bên trong hàm giữ nguyên.
2. **Preserve Arguments**: Truyền mảng đối số đa dạng (objects, primitives), kiểm tra hàm nhận đúng và đủ.
3. **Preserve Return Value & Promise**: Kiểm tra hàm đồng bộ trả về nguyên giá trị; hàm bất đồng bộ trả về cùng Promise instance.
4. **Preserve Synchronous Error**: Hàm ném ngoại lệ đồng bộ (`throw new Error(...)`), kiểm tra wrapper re-throw chính xác ngoại lệ đó, không bị nuốt và ghi nhận `ok: false`.
5. **Preserve Promise Rejection**: Hàm trả về Promise bị reject, kiểm tra lỗi truyền nguyên vẹn tới caller.
6. **Nested ALS Owner & Parent Span**: Kiểm tra khi service A gọi service B, `parentSpanIndex` của B trỏ chính xác về `spanIndex` của A, và sau khi B kết thúc, context của A được phục hồi nguyên vẹn.

### Kiểm chuẩn 2: Kiểm thử khói biên dịch API thực tế (Real Compiled API Normal / Fault Smokes)
Thực thi kiểm thử tích hợp trên mã nguồn backend đã build (`apps/api/dist`):
1. **POST Join Attribution**: Gửi HTTP request thật tới `POST /api/v1/calls/:id/join`, xác minh:
   - Bản ghi HTTP span được phát ra với `route: 'http-calls-join'`.
   - Bản ghi service span được phát ra với `owner: 'CallsService.join'` và `parentSpanIndex` khớp với HTTP span.
   - Các câu truy vấn trong transaction (bắt đầu từ `BEGIN`) có `owner: 'CallsService.join'` và liên kết đúng `backendPid`.
   - RPC `createRoom` được ghi nhận với `type: 'rpc'`, `method: 'createRoom'`, `owner: 'CallsService.join'`.
2. **POST Self-Mic Attribution**: Gửi HTTP request tới `POST /api/v1/calls/:id/self-mic`, xác minh:
   - Bản ghi HTTP span có `route: 'http-calls-self-mic'`.
   - Giao dịch cập nhật mic được gán đúng `owner: 'CallsService.selfMic'`.
3. **Honest Observer Health**: Kết thúc phiên kiểm tra, xác nhận `api-lock-spans-health.json` có `failureCount === 0`, `droppedCount === 0`, và `observationComplete === true`.

---

## 6. Trạng thái & Bước tiếp theo
- Antigravity hoàn thành và dừng lại ở việc bàn giao đầy đủ các artifacts chẩn đoán.
- Không tự ý chạy lại bài kiểm tra native lớn đang hỏng cho đến khi root thẩm định và hoàn tất các cổng kiểm chuẩn (controls/fullsmokes gate).
- `T30 IN_PROGRESS`, 80 prior PASS, `nativeAcceptance: false`.
