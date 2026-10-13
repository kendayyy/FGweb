# TELEGRAM-BRIDGE-01 — thiết kế và kế hoạch

Người dùng duyệt09/10/2026: bot báo cáo công việc FG và nhận lệnh cho Codex trong chat Kết nối bot Telegram. Đây là ngoại lệ công cụ vận hành được duyệt, không thêm feature FG hoặc đổi thứ tự/ledger/PASS. Target cố định chat01a11d13-223b-70e0-afd3-a1736eb6f62e; báo cáo FG đọc ledger thật, không tự triển khai CHATCRYPTO-BE.

## Thiết kế

Node24 built-ins, không dependencies mới. Runtime riêng code/.runtime/telegram-bridge đã ignore; nguồn code/tools/telegram-bridge; evidence code/quality/evidence/TELEGRAM-BRIDGE-01. Token được Windows DPAPI CurrentUser bảo vệ; không vào repo/log/report. Bot nhận updates bằng long polling HTTPS. Không tự xóa webhook đã có.

Ghép owner: chỉ private chat, username KingGameLV kèm mã ngẫu nhiên local có hạn10phút; ghép thành công pin numeric userId/chatId, sau đó quyền theo ID, không theo username. Không tự nhận người đầu tiên làm owner. /status báo task chưa PASS đầu tiên và dữ liệu evidence có timestamp; /do <text> chuyển nguyên ý user vào chat đã pin bằng bundled Codex app-tools MCP. /help giải thích; /notifications on|off bật/tắt báo thay đổi ledger và commentary/final chat này. Không chuyển tools/raw logs/reasoning/user messages ra Telegram. Lệnh được ghi pending trước dispatch; sau crash lệnh đang gửi cần đối soát, không auto replay. Không eval/shell nội dung Telegram. Một poller, một lệnh xử lý mỗi lần, chống update trùng; timeout/backoff có giới hạn. Tắt helper không đồng nghĩa pause task FG.

Chạy local khi máy/app Codex mở. Pipe app-tools có thể thay sau restart app; launcher chạy từ chat cần cập nhật môi trường. Tự startup Windows chưa thuộc bản này. Bot không chuyển lệnh sang chat build khác khi chưa có yêu cầu mới.

## Kế hoạch inline

1. RED tests owner pairing/expiry/ACL/replay/recovery, reports không secrets, target cố định, app transport errors.
2. Implement core, MCP client, DPAPI secret helper, runtime runner và README hướng dẫn start/stop/rotate.
3. GREEN scoped tests, syntax/lint, hashes/evidence; không chạy tests FG hoặc sửa baseline đang build.
4. Smoke getMe/getWebhookInfo/app-tools read thật; khởi động helper Hidden. User gửi /start <mã> để ghép; kiểm gửi /status và /do thật. Báo rõ phần chưa có xác nhận người dùng.

Ruling: thực hiện inline theo quyền user vừa cấp, không agent phụ/task FG song song. Không dùng codex queue vì daemon riêng không kết nối; bundled app-tools là transport cùng Desktop với tool đúng thread và quyền hiện có.

## Điều chỉnh user09/10/2026 — phiên FG thật

User báo thiếu phiên/tasks FG và chọn chuyển /do sang Coding and build 2. Supersede command target ban đầu: target01a11c65-3f1d-72b3-af93-75f16a80b147, caller vẫn chat bridge. /sessions và /status lấy Desktop list_threads read-only, filter exact workspace local E:/FGweb hoặc code/, gộp pinned+recent không trùng, hiển thị title thật và trạng thái active/idle/notLoaded. Chỉ phiên build được chọn có nhãn [nhận /do], tiến độ mới nhất lấy agent commentary/final qua read_thread, không user/preview/tools/reasoning. Tasks đang xử lý lấy IN_PROGRESS/BLOCKED/FAILED từ ledger, tách NOT_STARTED kế tiếp; không coi ledger IN_PROGRESS là proof runtime đang active. Auto progress chỉ watch phiên build đã chọn; không thay task FG hoặc gửi sang phiên khác.

Ghép vẫn bắt buộc code+username rồi pin numericID; /start thiếu/sai/hết hạn code trả hướng dẫn ghép cho username đã chỉ định, không lộ FG data. Tests RED→GREEN sessions/route/empty-ledger/feedback; smoke actual inventory+build read, restart single helper và mã ghép mới nếu owner chưa paired. Scope ứng dụng/ledger/evidence FG không đổi.

## /usage — user09/10/2026

Lệnh /usage và alias /check_usage read-only get_usage_limits Desktop, ưu tiên rateLimitsByLimitId, fallback rateLimits. Hiện phần đã dùng/còn lại clamp0–100, thời lượng và resetsAt UTC+07. Missing/null là chưa có dữ liệu, không zero giả. Hạn mức account shared, không riêng FG; không gửi accountId/credits private hoặc reset/purchase. Chỉ owner đã ghép; không dispatch công việc.

## Báo cáo demo UI/UX — user09/10/2026

User yêu cầu ảnh và diễn biến demo. /demo và auto new manifest gửi summary+1–8screenshots thật với action/result/times/outcome tới owner; headed local bắt buộc, không headless/mockup/fakeauth success. Manifest producer contract code/tools/telegram-bridge/DEMO.md; screenshots dưới quality/evidence task, hash+realpath+magic+size kiểm trước gửi. Không chụp secrets hoặc dữ liệu người thật; không tự demo cryptoFE khi BE chưaPASS. Producer phải chạy demo đúng gate rồi xuất manifest atomic; bot không suy diễn screenshot cũ là run mới. Test mock multipart không thay sendPhoto real/demo receipt; báo giới hạn khi chưa có run.

## /progress — user09/10/2026

Thêm /progress, aliases /time và /check_progress. Read-only ledger/evidence/Desktop currentbuild: task startedAt/wall elapsed có nghỉ, currentturn elapsed khi inProgress, title/runtime state/latest agent progress, snapshot age/remaining/blockers và next queue. Giờ UTC+07, missing/future time unavailable. PASS checkpoint count không %sảnphẩm; không bịa task completion% hoặc ETA từ tests/time. Không thay task/PASS hoặc gửi lệnh build. OwnerACL trước report; gửi report demo check đến owner được yêu cầu.

User bổ sung mini-task ETA: heuristic engineering budgets theo loại remaining item, chia implement/test/review, cộng tuần tự+15–40%reviewbuffer cho tasklớn. Initial confidence thấp, chưa calibrated; không guarantee99%. Giữ căn cứ snapshot/remaining thật; không giả các planningmini đã được giao/hoànthành trong ledger. Snapshot>6h/missing/blockers/futureproducer thì không chốt calendar deadline; effort estimates conditional không tính thời gian chờ. Không trừ elapsed làmremaining nếu evidence chưa thay. Tin dài gửi nhiều phần, không cắt mất tasklớn cuối báo cáo.

## Greeting và tự reconnect — user09/10/2026

Sửa supervisor09/10/2026 sau user báo đổi tài khoản bot không tự chạy: actual scheduler Ready/result0xC000013A (interrupted), không có watchdog/runner; Telegram/Desktop native smoke vẫn thành công. Thêm trigger lặp mỗi phút vô hạn bên cạnh Windows logon, IgnoreNew+mutex chống supervisor trùng. Cơ chế phục hồi cả watchdog bị dừng, không chỉ node runner exit. Không suy diễn ai đã interrupt hoặc claim đã test đổi tài khoản thật. Watchdog retry30s khi Desktop chưa có; pipe discovery giữ caller/target authorization.

Mọi outgoing chunk/photo caption mở đúng câu Xin chào Ken, tôi là FG Bot, xin báo cáo, không lặp greeting khi input đã có. Tự khôi phục read-only pipe lỗi qua boundedlocal32pipes prefix đã quan sát, tools/list→list_threads exactFGworkspace+caller+selectedbuild, lưu pipe runtime sau xác minh. Không account access bypass, không auto mutate/replay send_message_to_thread; pending/uncertain vẫn đốisoát. Existing logon/watchdog giữ. Máy bật/mạng/Desktop/sign-in/access vẫn prerequisites thật; không tự login/purchase hoặc claim99%/24x7máytắt. Demo producer không thay vì user đã chọn chỉ /demo trước.

## Chọn phiên /do — 09/10/2026

Chọn phiên /do user09/10: /do prefix gợi ý tên local Codex (50recent+pinned), không phân biệt dấu/hoa; /pick N chọn ID live revalidated và lưu state.commandTarget qua restart. /do prefix | prompt chỉ gửi sau chọn; plain prefix lọc tiếp khi picker mở. Hạn5phút/memory-only suggestions. /do text không khớp tên gửi selected target. OwnerACL/duplicate offset/pending+uncertain journal/target access giữ nguyên, không mutation replay. FG /status,/progress/auto-report vẫn theo build, không theo target lệnh. Cloud/remote excluded, project khác local được phép theo yêu cầu mới. Đây thay restriction fixed target trước đó. Gợi ý sau khi gửi tin, không khi đang gõ chưa gửi. Native không dispatch thử vào chat khác.

## /status nhiều phiên — 09/10/2026

User bổ sung /status09/10: /status hiển thị mọi chat Codexlocal inventory50recent+pinned, các phiênactive được đọc progress agent tuần tự gồm khác project; một read thất bại không che các phiên khác. /status prefix lọc theo tên; /status N xem riêng ID từ danh sách gần nhất (memory5phút, revalidate inventory, không dùng số theo inventory mới). Trạng thái/giờ đọc thật, last agent progress không suy ra task đang thực thi/PASS. OwnerACL trước read, redaction và không user/tool/reasoning output giữ; không đổi target /do. Auto FG reports và /progress tiếp tục FG build. Số lựa chọn hết hạn sau restart; mở /status lại.

## User được mời — 09/10/2026

09/10 Ken thêm @QuangMinha1: invitation trong ignored state, private fresh /start đúngusername mới bind numeric Telegram ID; bind một lần, sau đó username đổi vẫn dùng ID và người lấy lại username không claim. Guest dùng reports/demo/usage/progress/do, ownerID không đổi. Reply/demo gửi đúngrequester; automatic reports/notifications preferences của Ken giữ riêng. Per-user /do choice5min và persisted userTargets, per-user /status number list; không gửi nhầm giữa2user. Global ambiguous delivery journal vẫn chặn duplicate, lưu actorID/target trong ignored runtime không raw prompt. Chưa có actualguest /start nên numeric binding pending, không claim đã Telegram end-to-end.

## /task — 10/10/2026

/task thêm10/10: đọc quality/tasks.json mỗi lần gọi, task đầu chưaPASS/status/startedAt/blocker và evidence.remaining đúngtask, toàn bộ task phía sau theo thứ tựledger gồm FAILED/BLOCKED, dependencies và trạng thái tiền nhiệm. Không nhầm ledger state với live execution; task chỉ trong doc chưa rebaseline/register không có trong queue, không tự sửa ledger/nhảytask/ETA. Owner+guest authorized dùng được, reply đúngrequester; read failures báo unavailable. Snapshot giờUTC+07, no dispatch.

/task names correction10/10: mỗi task format ID: tên đầy đủ; read-only parse .doc/task.md bảng4cột(têncột3)/checkpoint3cột(têncột2)/heading và supplementbold; ưu tiên approvedplan name rồi ledger.title, missing báo rõ không bịa. Tên thay presentation בלבד, thứtự/status/dependencies lấy ledger không đổi; allunfinished20names verified.

## Cảnh báo và trả lời — 10/10/2026

Cảnh báo dừng/câu hỏi10/10: quan sát sequential local active/needsAttention + phiên đãactive và FG build. Report chuyển active→idle/interrupted/completed phân biệt kết thúc bình thường; usage exhausted chỉ từ explicit turn.error/codexErrorInfo/message, không suy đoán từ idle hay quota100%. NeedsAttention/câu hỏi agent cuối được hiển thị cùng /reply tên|nội dung rồi /pick; gửi user message không thay approval UI, cần mởCodex nếu hộp cấpquyền. /status cũng hiển thị alert khi đọc đúngpage. Fingerprint dedup persisted; chỉ agent commentary/final và sanitized error, không reasoning/user/tools/rawcommands. Persist lastObservedAt/bootAt/failureStage; sau gap>=120s reconnect báo khoảng mấtquan sát và lỗi đãghi; Windows boottime thay đổi chứng minh restart nhưng không biết mấtđiện hay manualrestart. Offline không gửi được cho đến nối lại; không khẳng định rootcause khi thiếu evidence. Guest reply route/owner auto-alert recipient giữ; không replay /do. Monitoring flags không đổi task/PASS hay tự answer.

## Test UI từng bước — 10/10/2026

UI test stream10/10: user cho phép nối producer Coding and build 2 (thay chỉ/demo). captureUiStep actualheaded/privacyreview/activeledger, viewport+masks/hash, mỗi bước RUNNING/final đúngkếtquả, immutableatomic streamqueue+latest. Drainbatch10/order/durable pending/sent/uncertain, không autoreplay/duplicate latest. Chọn ảnh (ảnh hoặcvideo yêu cầu), chưa hỗtrợvideo hoặc auto chụp Chrome chưainstrument. Integration không sửa frozen evidence/checker/PASS, không reruntest chỉminhhọa. Xem DEMO.md cho API/privacy/handoff.
