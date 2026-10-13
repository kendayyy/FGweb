# Báo cáo demo UI/UX qua Telegram

Theo user09/10/2026: demo local UI/E2E phải headed, quan sát thao tác thật. Chụp sau các bước quan trọng và khi gặp lỗi; không chụp mật khẩu/token/email riêng/chat support hoặc dữ liệu người thật. Dùng tài khoản/fixture demo hợp lệ, không fake auth/data để báo success. Screenshot chỉ vùng ứng dụng, không desktop/terminal.

Bot /demo đọc `code/quality/evidence/TELEGRAM-BRIDGE-01/demo-latest.json`; tự gửi manifest mới khi notifications on. Producer phải lưu screenshots dưới `code/quality/evidence/<TASK>/demo/<run>/`, giữ nguồn evidence/command/time/exit/hash/task. Sau khi demo kết thúc (kể cả failed/blocked), ghi manifest bằng file tạm+rename để bot không đọc nửa chừng. Không tự chạy demo task sau trong task hiện tại.

Manifest JSON có các trường:

- id: runID duy nhất chữ/số/_/-, tối đa100ký tự.
- task: checkpoint đang được phép demo, ví dụ CHATCRYPTO-FE.
- title: tên demo, tối đa300ký tự.
- headed: true chỉ khi browser hiển thị thật.
- startedAt/completedAt: ISO thời gian run thật.
- status: SUCCEEDED, FAILED hoặc BLOCKED; kết quả run demo không thay PASS checkpoint.
- steps:1–8bước, mỗi bước action/result tối đa500ký tự, screenshot path tương đối từ quality/evidence bắt đầu <TASK>/, PNG/JPEG, sha256 thực64hex.

Bot kiểm realpath trong evidence, size tối đa9MiB/ảnh, magicPNG/JPEG và SHA256 trước gửi; từ chối headless/path traversal/hash mismatch. Không lấy ảnh cũ để dựng run mới. Nếu demo không mở GUI được, ghi blocker ở phiên build; không tạo headed:true giả. Producer là bên chạy browser, bot không tự chụp màn hình hoặc suy diễn kết quả test từ ảnh.

Bot gửi tóm tắt diễn biến rồi ảnh từng bước kèm action/result tới owner đã ghép. Không gửi trùng tự động cùng manifest; lỗi gửi từng phần thành uncertain, owner có thể /demo gửi lại. /notifications off tắt gửi tự động; /demo vẫn là yêu cầu trực tiếp. Chưa có manifest: báo chưa có demo, không gọi ảnh mockup là demo thật.

## UI test từng phần — user10/10/2026 (thay lựa chọn chỉ /demo trước đó)

Ken cho phép gửi hướng dẫn sang Coding and build 2 và yêu cầu mọi test UI Chrome headed sau có ảnh từng phần. Producer import captureUiStep từ code/tools/telegram-bridge/demo-stream.mjs trong script test đang được phép sửa (không sửa nguồn snapshot/frozen evidence cũ). Chụp lúc bắt đầu app hiển thị, sau từng nhóm hành động/assertions quan trọng, cuối test và lỗi trước khi đóng browser. Không rerun test chỉ để dựng minh họa, không giảm assertions/tăng timeout tùy tiện, không fake test success. Giữ command/time/exitCode/evidence task thật; kết quả screenshot không là task PASS.

captureUiStep(page, {task, runId, step, title, action, result, startedAt, headed:true, privacySafe:true, status:'RUNNING', maskSelectors:[]}) trả {manifest,id}. runId duy nhất mỗi run (tối đa65chữ/số/_/-), step tăng1..99999, startedAt ISO thật, labels an toàn/action/result tối đa500. Chỉ headed:true khi Chrome/Chromium thực sự visible. RUNNING là bước đã quan sát trong test đang chạy, không completed run; bước cuối SUCCEEDED/FAILED/BLOCKED phải đúng kết quả thật. privacySafe:true là producer đã kiểm dữ liệu demo synthetic/masks; không mặc định gántrue nếu chưa review. Default mask mọi input/textarea và data-demo-private/data-sensitive/recovery-code/secret testids. Bắt buộc maskSelectors bổ sung vùng mãrecovery/token/SAS private/email/chat người thật/logs còn hiển thị ngoàiinput, hoặc bỏ chụp vùng đó và báo blocker riêng. Chỉ app viewport, không desktop/terminal. Không lấy screenshots cũ làm run mới.

Helper kiểm task đang IN_PROGRESS, ledger unchanged; PNG nằm quality/evidence/<TASK>/demo/<run>/, SHA256 thật. Immutable atomic manifests quality/evidence/TELEGRAM-BRIDGE-01/demo-stream/<time>-<run>-step-N.json, latest atomic cho /demo. Mỗi event1bước; sốbước cảrun không giới hạn8 vì queue riêng, batch10mỗi poll để không flood. Bot drain mọi event mới theo order, không chỉ latest nên không mất bước khi producer ghi nhanh. Telegram summary+sendPhoto thật kèm caption/action/result; greeting vẫn đầy đủ. Pending/uncertain persisted, không autoreplay ảnh khi chưa có receipt; /demo yêu cầu gửi lại bước mới nhất. Legacy latest không gửi tựđộng lần2 nếu là stream event. /notifications off giữ queue, on xửlý backlog. Poll bình thường khoảng20giây cộng đọc phiên/gửiảnh, không hứa realtime tuyệtđối. Giới hạn9MiB/magicPNG/JPEG/hash/realpath vẫn kiểm.

Phạm vi hiện tại chọn gửi ảnh (user yêu cầu ảnh HOẶC video), chưa quay/gửivideo; không tuyên bố cóvideo khi chưa có file thật. Không tự chụp mọi Chrome window hoặc mở port debug public. Test chưa nối capture helper sẽ chưa có ảnh; Coding and build 2 cần tích hợp vào mọi lần test UI sau, báo rõ nếu run đã đóng trước khi có helper. Bot không tự đoán bước/kếtquả từ màn hình.
