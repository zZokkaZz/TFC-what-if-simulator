# TFC Simulator — Brief cho Claude Code

> Đặt file này ở thư mục gốc repo với tên `CLAUDE.md`. Claude Code tự đọc nó mỗi phiên.
> Ngôn ngữ giao diện và trao đổi: **tiếng Việt**. Thuật ngữ game giữ tiếng Anh (lot size, safety stock, ROI…).

---

## 0. LUẬT SỐ 1 — KHÔNG BỊA SỐ (đọc trước mọi việc, áp dụng mọi phiên)

Đây là bài thi thật. **Cấm bịa, cấm "vẽ" số liệu.**

1. Mọi con số hiển thị như "số của game/sheet" phải **chép đúng từ `data/TFC_Round0.xlsx`**. Không làm tròn lại, không tính lại rồi đặt dưới tên cột của sheet.
2. Thiếu số trong file → ghi **"thiếu dữ liệu"**. Không đoán, không suy từ nguồn khác rồi trình bày như số thật.
3. Số do mô hình tính (kịch bản, dự báo) phải **tách bạch và gắn nhãn** (in đậm kèm "R0 …", badge "mô hình"/"ước lượng"/"hiệu chỉnh R0"). Khi chưa đổi quyết định, ô nào mang tên cột của sheet phải **bằng đúng số sheet**.
4. Hai tab trong file lệch nhau (vd làm tròn) → hiện cả hai và ghi rõ đang dùng nguồn nào.
5. Có test `tests/sheet-fidelity.test.ts` đọc thẳng file Excel so từng ô; test đỏ thì **không được push**.
6. Không chắc → **hỏi người dùng**, không tự quyết.
7. Chỉ đọc dữ liệu từ file trong `data/`. Khi người dùng sửa Google Sheet, phải tải lại .xlsx vào repo rồi mới cập nhật app.

## 0b. QUY TRÌNH BẮT BUỘC CHO MỌI PHIÊN MỚI (kể cả tài khoản Claude khác)

**Trước khi làm gì:**
1. Đọc lần lượt: `CLAUDE.md` → `PROGRESS.md` (đang ở đâu, quyết định đã chốt) → `ROADMAP_M3_M4_M5.md` (cách làm mốc tiếp theo, cái gì CHƯA biết) → `ASSUMPTIONS.md`.
2. `git fetch` và kiểm tra `main` có file .xlsx mới không (người dùng upload tên "TFC Round Trial.xlsx"). Có → merge/copy vào `data/TFC_Round0.xlsx`.
3. `npm install` rồi `npm run verify` (đọc Excel → toàn bộ test → build). **Phải xanh hết** trước khi sửa.
4. Báo người dùng ngắn gọn: đang ở mốc nào, test bao nhiêu/bao nhiêu, việc tiếp theo — rồi **chờ lệnh**. Người dùng làm **từng mốc một**, không tự nhảy sang M3/M4/M5.

**Trong khi làm:**
- Không sửa số trong `data/`, không gõ tay số vào code. Số mới chỉ đến từ file Excel người dùng upload.
- Không đổi hệ số hiệu chỉnh / neo số để "cho khớp". Không khớp → báo người dùng + ghi `ASSUMPTIONS.md`.
- Không xóa/sửa test để cho xanh. Không giảm test trong `tests/sheet-fidelity.test.ts`.
- Mỗi số mới mang tên cột/KPI của game: thêm test "baseline = đúng sheet".
- Công thức chưa rõ → hỏi người dùng hoặc gắn "ước lượng"; KHÔNG trình bày như luật game.
- Đổi `firestore.rules` → chạy `scripts/test-rules.mjs` (emulator) + nhắc người dùng Publish rules. Không ghi mã đội ở bất cứ đâu.
- Làm trên nhánh riêng, mở PR nháp; không push thẳng `main` khi chưa được phép.

**Xong việc:**
- `npm run verify` xanh → commit → push → cập nhật `PROGRESS.md` (Đã xong / Việc tiếp theo / Nhật ký phiên) và `ASSUMPTIONS.md`.
- Báo người dùng bằng tiếng Việt, ngắn: cái gì khớp sheet, cái gì là ước lượng, người dùng cần làm gì (upload file, publish rules, merge PR…).

## 1. Mục tiêu

Build một **web app what-if cho game The Fresh Connection (TFC)** để team 4 người (VSCC 2027, Challenge A) thử quyết định **trước khi** nhập vào game thật.

- Sửa một thông số của bất kỳ phòng ban nào → **mọi chỉ số liên quan và ROI tính lại ngay** (realtime, trong trình duyệt).
- Thấy rõ **phòng ban nào bị ảnh hưởng và vì sao** (ví dụ: tăng safety stock TP → tồn kho tăng → pallet kho TP tăng → overflow → indirect cost tăng → ROI giảm).
- So sánh nhiều kịch bản cạnh nhau.
- 4 người ở 4 máy, 4 mạng khác nhau, **không dùng chung tài khoản Claude** vẫn dùng được.
- **Đồng bộ realtime** (từ M1.5): mỗi VP sửa phần của phòng mình trên một "bộ quyết định chung", 3 người còn lại thấy ngay; có nhật ký, kịch bản riêng, bản chụp có tên.

**Không phải mục tiêu:** tái tạo chính xác 100% engine của game (game có nhu cầu ngẫu nhiên theo tuần). Mục tiêu là **đúng hướng và sát độ lớn**, được hiệu chỉnh theo số Round 0 thật.

## 2. Bối cảnh game (đọc kỹ)

- Công ty sản xuất nước ép (fruit juice). 4 VP: **Purchasing, Operations, Sales, Supply Chain**. Chỉ số chung để xếp hạng: **ROI**.
- 1 round = 6 tháng = **26 tuần = 130 ngày làm việc**. Chi phí ghi theo năm phải **chia 2** khi tính cho 1 round.
- Các round **không mang hiệu ứng sang nhau** (tồn kho đầu round do game random). Simulator tính từng round độc lập.
- Người dùng chính của repo là **VP Operations** → module Ops cần chi tiết nhất.
- Bấm Calculate trong game = nộp bài. Simulator là nơi thử, game là nơi nộp.

### Chuỗi tác động chính giữa phòng ban (phải thể hiện trong app)

| Quyết định | Ảnh hưởng |
|---|---|
| Sales: service level cam kết ↑ | Cần safety stock TP ↑ → tồn kho ↑ → kho TP ↑; contract index/doanh thu ↑, penalty nếu không đạt |
| Sales: shelf life cam kết ↑ | Hàng hết hạn nhiều hơn → hủy (obsolete) + sản xuất lại |
| Sales: order deadline trễ, trade unit nhỏ | Giờ soạn hàng kho TP ↑ → cần FTE kho TP ↑ |
| Sales: promotion pressure ↑ | Volume ↑, biến động nhu cầu ↑ → capacity dây chuyền, safety stock ↑ |
| Sales/Purchasing: payment term | Không ảnh hưởng hàng hóa; ảnh hưởng Receivables/Payables → Investment → ROI. Payment term NCC dài → giá NCC (contract index) ↑ |
| SC: safety stock NL ↑ | Component availability ↑; pallet kho NL ↑ |
| SC: lot size NL ↑ | Ít lần nhận hàng (giảm giờ công theo dòng đơn) nhưng đỉnh pallet và đỉnh giờ công ↑, kho NL đầy hơn |
| SC: safety stock TP ↑ | Service level ↑, tồn kho và kho TP ↑, rủi ro hết hạn ↑ |
| SC: production interval ↓ | Nhiều changeover hơn → mất giờ dây chuyền + start-up loss; hàng tươi hơn |
| SC: frozen period ↑ | Ops/Purchasing ổn định hơn, phản ứng chậm với thay đổi nhu cầu |
| Ops: pallet locations, FTE | Chi phí cố định vs overflow €3/pallet/ngày và thời vụ €42/giờ |
| Ops: ca, SMED, tốc độ, bảo trì, training | Capacity dây chuyền ↑ → plan adherence ↑ → service level ↑ |
| Ops: RM inspection | Thêm giờ công kho NL, giảm hỏng dây chuyền và hàng lỗi |
| Ops: đổi máy trộn/dây chuyền | Fixed assets (Investment) và chi phí thay đổi; mẻ tối thiểu của máy trộn có thể phá hiệu quả của production interval ngắn |
| Purchasing: NCC tin cậy hơn / lead time ngắn hơn / chất lượng tốt hơn | Safety stock NL cần ↓, ít hỏng dây chuyền, ít hàng lỗi; thường giá cao hơn |
| Purchasing: delivery window rộng | Biến động nhận hàng ↑ → safety stock NL ↑ |
| Purchasing: trade unit lớn (FTL) | Giống lot size lớn: ít lần nhận, nhiều pallet hơn |

## 3. Ràng buộc cứng

1. **Không** truy cập, scrape hay đăng nhập vào `game.thefreshconnection.eu`. Không có API. Dữ liệu chỉ lấy từ file trong `data/`.
2. **Backend duy nhất được phép: Firebase gói Spark miễn phí** (project `tfc-group`) — Firestore (asia-southeast1) + Anonymous Auth, chỉ để đồng bộ bộ quyết định giữa các thành viên. Không Cloud Functions, không Firebase Hosting, không Analytics, không tài khoản người dùng (đăng nhập ẩn danh). Cấu hình web Firebase (công khai theo thiết kế) nằm ở `src/sync/firebaseConfig.ts`. **Mã đội không bao giờ ghi trong code hay repo**: người dùng tự nhập trong app, lưu trên máy; dữ liệu nằm ở `teams/{mãĐội}/...`. Quyền truy cập do `firestore.rules` quyết định (có trong repo).
3. App phải chạy được khi **mở trực tiếp file HTML** (double-click, `file://`) và khi host tĩnh (GitHub Pages). Mất mạng / không vào nhóm thì vẫn chạy được (chế độ "một mình" hoặc số đã cache).
4. Mọi giả định chưa chắc chắn phải **hiển thị trên giao diện** (badge "ước lượng") và ghi trong `ASSUMPTIONS.md`. Không bịa công thức game rồi trình bày như chắc chắn.

## 4. Kiến trúc kỹ thuật

- **Một file `index.html` build ra cuối cùng**, tự chứa (JS, CSS, dữ liệu inline, **SDK Firebase bundle vào file**). Không tải script từ CDN lúc chạy; mạng chỉ dùng để gọi API Firebase khi đồng bộ.
- Được phép dùng Vite + TypeScript + một framework nhẹ (Preact hoặc Svelte) **nếu** build ra 1 file (dùng `vite-plugin-singlefile`). Nếu không cần thì vanilla TS là đủ.
- Tách rõ 3 lớp:
  - `src/data/` — dữ liệu Round 0 (sinh từ file Excel, xem mục 5).
  - `src/model/` — **hàm thuần** `simulate(inputs, data) → results`, không đụng DOM. Mỗi phòng ban một file: `ops.ts`, `supplyChain.ts`, `purchasing.ts`, `sales.ts`, `finance.ts`.
  - `src/sync/` — đồng bộ nhóm: `controller.ts` (bản chung, kịch bản riêng, ghi trễ ~500 ms, nhật ký, snapshot, xung đột) không phụ thuộc Firebase; `firebaseBackend.ts` (Firestore + Anonymous Auth, cache offline); `mockBackend.ts` (giả lập cho test và `?mock=1`).
  - `src/ui/` — giao diện.
- Có **unit test** (Vitest) cho model, trong đó test quan trọng nhất là **test hiệu chỉnh**: nhập quyết định Round 0 → kết quả phải gần số Round 0 thật (mục 7).
- Trạng thái lưu `localStorage` (bọc try/catch) để F5 không mất (chế độ một mình); chế độ nhóm lấy từ Firestore (có cache offline).
- Test đồng bộ: `tests/sync.test.ts` (giả lập); `scripts/test-rules.mjs` (Firestore Emulator); `scripts/firebase-smoke.ts` (2 phiên thật hoặc emulator).

## 5. Dữ liệu đầu vào

Nguồn: Google Sheet của team "TFC Round 0 – Dữ liệu gốc 4 phòng ban" (đã được tổng hợp đầy đủ từ game).
**Claude Code không có quyền đọc Google Sheet.** Người dùng sẽ tải về và đặt vào repo:

- `data/TFC_Round0.xlsx` (Google Sheets → File → Download → .xlsx). Bản đầu tiên tên `TFC Round Trial.xlsx`, đã `git mv` vào đường dẫn này.

Viết script `scripts/build-data.ts` (dùng thư viện `xlsx`/SheetJS) đọc file này → sinh `src/data/round0.json`. Đọc **theo tiêu đề cột**, không hard-code tọa độ ô (bố cục có thể đổi). Lưu ý số kiểu Việt Nam trong sheet: dấu chấm = phân cách hàng nghìn, dấu phẩy = thập phân (khi đọc giá trị đã format).

Các tab trong file:

| Tab | Nội dung |
|---|---|
| `0_README` | Mục lục |
| `1_Vấn đề R0` | Các vấn đề chính của Round 0 + KPI |
| `2_Finance` | P&L Round 0 đầy đủ (doanh thu, purchase value, production cost, indirect cost từng dòng, investment từng dòng, ROI) |
| `3_Sản phẩm` | 6 SKU: BOM, bao bì, nhu cầu/tuần, lít, pallet; giá và thông số nguyên liệu |
| `4_Purchasing` | Hợp đồng hiện tại, kết quả NCC Round 0, thị trường NCC (23 NCC cho 5 nguyên liệu: Pack, PET, Orange, Mango, Vitamin C) |
| `5_Operations` | Quyết định Ops hiện tại, kết quả kho và dây chuyền Round 0, bảng 3 máy trộn, 4 dây chuyền, định mức thời gian/chi phí |
| `6_Sales` | 3 hợp đồng khách hàng, kết quả theo khách, sản phẩm, khách × sản phẩm |
| `7_Supply Chain` | Quyết định SC hiện tại, kết quả tồn kho NL và TP |
| `8_Luật game` | Luật từ Info Center. Trong file thực tế tab tên `Luật for ops and others phòng b` (Excel cắt tên 31 ký tự) — `build-data.ts` chấp nhận cả hai |
| `9_Viết tắt` | Thuật ngữ |
| `10_R0 Analysis` | Bảng Analysis của game (NL, NCC, dây chuyền, máy trộn, khách, sản phẩm, kho…) |
| `11_R0 Theo ngày` | 130 ngày: tồn kho (tuần) 5 NL + 6 TP; giờ công/ngày kho NL và kho TP |
| `12_R0 Theo tuần` | Nhu cầu 26 tuần từng SKU + trung bình, độ lệch chuẩn, CV |

## 6. Luật và định mức đã biết (từ Info Center)

**Kho & nhân sự**
- Pallet location: €200/chỗ/năm. Thiếu chỗ → overflow **€3/pallet/ngày**.
- FTE cố định: €40.000/năm, 40 giờ/tuần. Thiếu giờ → thời vụ **€42/giờ**.
- Kho NL: nhận hàng 1 giờ/dòng đơn + 6 phút/pallet; cấp cho sản xuất 6 phút/pallet, 12 phút/tank; việc cố định ~4 giờ/ngày; chuyển overflow 6 phút/pallet; đổ IBC khi tank yard thiếu chỗ 1 giờ/IBC; RM inspection +2 giờ/dòng đơn.
- Tank yard (PulpStore): €25/tank/ngày, €10/lần nhận, €100/lần giao.
- Kho TP: nhập từ sản xuất 6 phút/pallet; soạn hàng 10 phút/dòng đơn + 6 phút/pallet hoặc layer + 3 phút/thùng; overflow/hủy hàng 6 phút/pallet; cố định 4 giờ/ngày; phân phối tới khách €31/pallet.

**Dây chuyền đóng chai**
- Số ca: 1 ca 40 giờ, 2 ca 80, 3 ca 120, 4 ca 144, 5 ca 168 giờ/tuần. Vượt 168 giờ → thuê ngoài, chi phí gấp 2.
- Formula changeover (cùng bao bì, đổi vị) và size changeover (đổi 1L ↔ PET), thời gian theo từng dây chuyền.
- Sau mỗi changeover, giờ đầu tiên bị hao hụt theo tỷ lệ start-up loss của dây chuyền.
- SMED: €20.000/năm, giảm 30% thời gian changeover. Increase speed: €30.000/năm, +10% lít/giờ.
- Preventive maintenance: Minimal 1 giờ/tuần, giảm 30% hỏng; Extensive 3 giờ/tuần, giảm 50% hỏng.
- Training sửa hỏng: €400/người, thời gian sửa giảm 40%.

**Tài chính**
- ROI = Operating profit / Investment.
- Operating profit = Gross margin − Indirect cost. Gross margin = Realized revenue − COGS (purchase value + production cost).
- Investment = Fixed assets (máy trộn, dây chuyền…) + Inventory + Receivables − Payables (đối chiếu đúng các dòng trong tab `2_Finance`).
- Receivables/Payables phụ thuộc payment term (tuần) × doanh thu/mua hàng theo tuần — **cách game tính chính xác chưa xác nhận**, phải hiệu chỉnh theo số Round 0.

**Safety stock** (công thức chuẩn, input lấy từ dữ liệu)
- TP: `SS = z(service level) × σ_tuần × √(lead time tuần)`, lead time liên quan production interval (+ frozen period).
- NL: thêm biến động do delivery reliability, rejection, lead time NCC.
- Game nhập safety stock và lot size **theo tuần nhu cầu**, production interval **theo ngày**.

## 7. Số Round 0 để hiệu chỉnh (acceptance)

Quyết định Round 0 (trong sheet):
- Ops: RM inspection tắt; kho NL 900 pallet, 5 FTE, intake 5 ngày; máy trộn Fruitmix MQ; PM None; training No; dây chuyền Swiss Fill 2, 2 ca; SMED không; speed không; kho TP 1.500 pallet, 4 FTE.
- SC: NL safety stock 2 tuần, lot size 4 tuần; frozen 3 tuần; TP production interval 10 ngày, safety stock 3 tuần.

Kết quả thật phải tái tạo gần đúng:

| Chỉ số | Round 0 thật | Sai số chấp nhận (gợi ý) |
|---|---|---|
| ROI | −7,68% | ±1,5 điểm % |
| Realized revenue | €2.306.255 | ±3% |
| Gross margin | €903.148 | ±5% |
| Indirect cost | €1.209.651 | ±5% |
| Operating profit | −€306.503 | ±€60.000 |
| Investment | €3.989.513 | ±3% |
| Giá trị tồn kho | €321.425 | ±10% |
| Kho NL utilization / overflow | 93,4% / 10,8% (phí overflow €35.423) | ±5 điểm % |
| Kho TP utilization / overflow | 70,7% / 0,1% | ±5 điểm % |
| Giờ công kho NL / kho TP | 74 / 100 giờ/tuần | ±15% |
| Swiss Fill 2 run / changeover / breakdown / unused / overtime | 62,6 / 12,1 / 10,8 / 3,9 / 9,4 giờ/tuần | ±15% |
| Production plan adherence | 78,7% | ±5 điểm % |
| Start-up productivity loss | €8.435 | ±20% |
| Fruitmix MQ cleaning / lô TB | 14,5% / 11.022 L | ±10% |

Vấn đề Round 0 mà app phải "nhìn ra" được khi chạy baseline:
- Vitamin C hết hàng 31/130 ngày (NCC reliability thấp) → C-power 1L hết TP 25 ngày, C-power PET 16 ngày, Orange 1L 11 ngày.
- Kho NL vượt giờ công cố định 12 ngày (đỉnh 65 giờ/ngày) do lot size 4 tuần làm hàng về dồn cục.
- Kho TP chỉ dùng ~71% → thừa chỗ thuê.
- NCC PET hiện tại: phí vận chuyển ≈ 47% giá trị mua, chất lượng kém, gây hỏng dây chuyền.
- Nhu cầu biến động mạnh: CV 39–75% (cao nhất C-power 1L).

Nếu một chỉ số không hiệu chỉnh được trong sai số, **báo lại** và ghi vào `ASSUMPTIONS.md`, không âm thầm chỉnh hệ số cho khớp.

## 8. Giao diện

- **Thanh trên cùng:** ROI lớn, Operating profit, Investment; cạnh mỗi số là chênh lệch so với baseline Round 0 (xanh/đỏ).
- **5 tab:** Ops (mặc định) · Supply Chain · Purchasing · Sales · Finance (P&L đầy đủ, dòng nào đổi thì tô).
- Mỗi tab: cột trái là **ô quyết định** (đúng tên và đơn vị như game, dropdown cho lựa chọn rời rạc), cột phải là **kết quả** của phòng đó.
- Ô nào bị ảnh hưởng bởi quyết định của phòng khác thì có nhãn nhỏ "← do SC đổi lot size" (truy vết nguyên nhân).
- **Ops chi tiết:** biểu đồ giờ dây chuyền/tuần (run, changeover, breakdown, unused, overtime) giống game; capacity còn trống; điểm nghẽn (kho NL, dây chuyền, kho TP) tô đỏ; chi phí từng hạng mục.
- **Kịch bản:** lưu nhiều kịch bản có tên, bảng so sánh cạnh nhau, nút reset về Round 0.
- **Chia sẻ:** nút "Copy link kịch bản" (mã hóa input vào URL hash, base64 nén) và "Xuất/Nhập JSON". Đồng đội mở link là thấy đúng bộ quyết định.
- Thiết kế gọn, đọc trên laptop là chính, dùng được trên điện thoại.
- **Nhóm (realtime):** vào app nhập mã đội + chọn vai trò (Purchasing / Operations / Sales / Supply Chain / Xem), nhớ trên máy, có nút đổi. Mỗi phòng ghi document riêng `teams/{mã}/decisions/{phòng}` (2 phòng sửa song song không ghi đè nhau); cùng vai trò thì bản ghi sau thắng và báo cho người kia. Vai trò chỉ sửa ô phòng mình, "Xem" không sửa. Trạng thái kết nối, nhật ký ~50 dòng ("Ops đổi số ca 2 → 3 · 5 phút trước"), "Tách kịch bản riêng" / "Đẩy lên bản chung" / "Lấy lại bản chung", "Chụp lại bản chung" (snapshot có tên) để so sánh và mở lại.

## 9. Lộ trình

1. **M0:** scaffold, `build-data.ts`, hiện dữ liệu Round 0 thô.
2. **M1 — Ops:** kho NL, kho TP, giờ công, overflow, dây chuyền, máy trộn, chi phí Ops. Test hiệu chỉnh các dòng Ops.
3. **M2 — Supply Chain:** tồn kho theo lot size/safety stock/production interval, nối với kho và dây chuyền.
4. **M3 — Purchasing + Sales:** NCC (giá, reliability, lead time, chất lượng), hợp đồng khách, service level, penalty/bonus.
5. **M4 — Finance:** P&L + Investment + ROI đầy đủ; test hiệu chỉnh ROI.
6. **M5:** kịch bản, so sánh, chia sẻ link; build 1 file; hướng dẫn deploy GitHub Pages.

Đã làm thêm **M1.5 — đồng bộ realtime bằng Firebase** (trước M2). **M2 đã xong** kèm **bảng cảnh báo chéo phòng** (`src/model/warnings.ts`); doanh thu/penalty theo service level chờ M3.

Sau mỗi mốc: chạy test, build, mở thử, báo ngắn gọn cái gì đã khớp và cái gì còn lệch.

## 10. Chia sẻ cho team

- Cách 1: gửi file `dist/index.html` vào nhóm chat, mở bằng trình duyệt.
- Cách 2: GitHub Pages (repo public, hoặc private nếu có GitHub Pro). **Hỏi người dùng trước khi push lên repo public**, vì ai có link cũng xem được dữ liệu. Pages phục vụ `docs/index.html` (bản sao của `dist/index.html`, `npm run build` tự chép).
- Đồng bộ: gửi link app + **mã đội qua kênh riêng** (không đăng mã lên repo/nhóm công khai).

## 11. Không làm

- Không thêm backend nào khác ngoài Firebase (Firestore + Anonymous Auth, gói Spark). Không Cloud Functions, không Firebase Hosting, không Analytics, không tài khoản/mật khẩu người dùng.
- Không gọi API ngoài nào khác Firebase; không tải script từ CDN lúc chạy.
- Không ghi mã đội vào code, repo, log hay commit.
- Không tự bịa luật game ngoài mục 6 mà không đánh dấu "ước lượng".
- Không viết lại dữ liệu bằng tay nếu đã có trong file Excel.
