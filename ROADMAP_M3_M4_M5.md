# ROADMAP M3 · M4 · M5 — cách làm các mốc còn lại

> Đọc cùng `CLAUDE.md` (mục 0 LUẬT SỐ 1) và `PROGRESS.md`. **Người dùng muốn làm từng mốc, phải được ra lệnh mới bắt đầu.**
> Mọi công thức dưới đây đánh dấu rõ: ✅ ĐÃ KIỂM CHỨNG bằng số R0 · ⚠️ CHƯA RÕ (không được trình bày như chắc chắn) · ❌ THIẾU DỮ LIỆU.

---

## Nguyên tắc chung cho mọi mốc (bắt buộc)

1. **Neo số đề bài** (như `src/model/anchor.ts`): số hiển thị = số R0 trong sheet × (mô hình mới ÷ mô hình baseline) (chỉ số % có trần: R0 + chênh lệch). Không đổi quyết định nào → mọi số = đúng sheet. Thêm test vào `tests/sheet-fidelity.test.ts` cho từng chỉ số mới.
2. **Không chế công thức game.** Công thức ⚠️ → làm dạng "tỷ lệ so với R0" + badge "ước lượng" + ghi `ASSUMPTIONS.md`; hoặc **cho người dùng nhập số game hiển thị** (vd contract index sau đàm phán).
3. Ô quyết định đúng tên/đơn vị như game (cột "Lựa chọn khi đàm phán" tab 4; hợp đồng tab 6). Thêm giới hạn vào `src/sync/limits.ts` **và** `firestore.rules` (hiện `validPurchasing` chỉ có `suppliers`, `validSales` là map ≤ 50 trường → phải mở rộng + chạy `scripts/test-rules.mjs` + nhắc người dùng Publish rules).
4. Nối vào cảnh báo liên phòng ban (`src/model/warnings.ts`): mỗi cảnh báo ghi phòng gây ra → phòng bị ảnh hưởng + dòng ROI đổi bao nhiêu.
5. Cập nhật Dashboard KPI (`src/model/kpi.ts`): KPI Purchasing/Sales hiện "chưa mô hình" → nối vào mô hình mới (đổi `scenarioBasis`, tính `scenario` neo vào R0; thêm test trong `tests/kpi.test.ts`). **Ô "R-2: thiếu" giữ nguyên null** — chỉ hết khi người dùng thêm bảng DASHBOARD (KPI | Round -2 | Round -1 | Round 0 | Nhận xét của game) vào tab 4/5/6 và upload; khi đó thêm đọc bảng đó trong `build-data.ts` (giống `dashTable` của tab 7) và lấy R-2 từ đó.
6. Thêm `Inputs.purchasing` / `Inputs.sales` cần mở rộng `baselineInputs` (`src/model/baseline.ts`), `makeSanitizer` (`src/sync/sanitize.ts`), `trace.ts` (nhãn "← do Purchasing đổi …").
7. Sau mỗi mốc: `npm run verify`, mở thử 2 tab (`?mock=1`), cập nhật `PROGRESS.md`, `ASSUMPTIONS.md`, commit, push nhánh riêng.

---

## M3 — Purchasing ✅ ĐÃ XONG (25/11/2026 — xem ASSUMPTIONS.md mục 15)

> Phát hiện khi làm: ✅ **Purchase value = giá cơ bản × CI × lượng mua + phí vận chuyển** (khớp ≤ €1) — mục "giá thực trả ≠ giá × CI" bên dưới là do giá thực trả đã gồm phí vận chuyển. Delivery window & quality nước ép: chỉ cảnh báo (người dùng duyệt).

### Dữ liệu có trong sheet (tab 4, đã đọc vào `round0.json`)
- `purchasing.contracts`: 5 hợp đồng hiện tại (CI, quality, lead time, cert, nước, vận chuyển, free capacity, payment term, trade unit, reliability cam kết, delivery window, vận chuyển chọn được).
- `purchasing.market`: 23 NCC (điều kiện mặc định trước đàm phán).
- `purchasing.specs`: thông số chi tiết 23 NCC — basic CI, CI thị trường, **giá cơ bản**, phương tiện, **lead time theo Truck/Boat**, **phí mỗi chuyến**, **phí / pallet-drum-IBC**, **phí / FTL-tank**, free capacity (2 cột), start payment term ("When ordering"/"At delivery"), thị phần, cert.
- `purchasing.negotiation`: lựa chọn đàm phán từng NL (trade unit, quality, delivery window, payment term, reliability, vận chuyển).
- `purchasing.results`: R0 thực tế từng NCC (reliability, rejection, purchase value, transport, giá thực trả, cỡ đơn, số lần giao, đã mua).

### Đã biết / chưa biết
- ✅ Purchase value R0 = lượng đã mua × **giá thực trả** (khớp đến 5 chữ số cho cả 5 NCC).
- ⚠️ **Giá thực trả ≠ giá cơ bản × contract index**: tỷ lệ = 1,043 (Mono) · 1,895 (Trio PET) · 1,094 (Miami) · 1,042 (NO8DO) · 3,264 (Seitan). Công thức giá CHƯA RÕ → KHÔNG tự chế. Cách làm đề xuất: giữ giá thực trả R0 cho NCC hiện tại; NCC mới → **người dùng nhập giá/CI game hiển thị**, nếu không nhập thì "ước lượng" = giá cơ bản × CI × (tỷ lệ R0 của NL đó) và ghi rõ.
- ✅ (gần đúng) Phí vận chuyển ≈ phí mỗi chuyến × số lần giao + phí đơn vị × số đơn vị (làm tròn lên mỗi chuyến): lệch −6% … +3% so với R0; PET chưa rõ tính theo pallet (+8%) hay FTL (−10%). → Dùng dạng tỷ lệ so với R0 (neo), badge "ước lượng".
- ⚠️ Contract index sau đàm phán: game ghi "đổi điều kiện thì CI đổi, phải bấm Calculate mới thấy" → **không dự đoán được** → ô "Contract index (nhập số game hiển thị)".
- ⚠️ Reliability / rejection của NCC mới: chỉ có reliability **cam kết**; thực tế R0 thấp hơn cam kết 0,2–9,9 điểm. Đề xuất: mặc định = cam kết − (chênh lệch TB R0) + badge "ước lượng"; cho nhập số thực tế khi có.
- ⚠️ Ảnh hưởng chất lượng bao bì lên hỏng máy: đang dùng giả định (`assumptions.ts`: Poor ×1,6, Middle ×1,25) — chưa xác minh.
- Nối sẵn (M2 đã chuẩn bị): đổi NCC → lead time, reliability, trade unit, rejection → availability NL (`componentRisk`), SS gợi ý, cỡ đơn, cách chứa (pallet/tank), phí tank yard, giờ nhận hàng. Đổi phương tiện Truck/Boat → lead time & phí theo `specs`.

### UI Purchasing (cột trái quyết định, cột phải kết quả — như tab Ops/SC)
- Mỗi NL: chọn NCC (dropdown 23 NCC, lọc theo NL), phương tiện (nếu NCC cho chọn), trade unit, quality, delivery window, payment term (tuần), reliability cam kết, ô "CI game hiển thị" (tùy chọn).
- Kết quả: giá, purchase value, phí vận chuyển, transport/purchase %, lead time, availability, KPI Purchasing (rejection TB, raw material costs %, reliability TB), điểm phòng (CI TB).
- Bảng nguyên văn tab 4 theo đúng thứ tự cột (dùng `captureRaw` + `RawTable`).

---

## M3 — Sales (phần service level → penalty → doanh thu ✅ 25/11/2026 — ASSUMPTIONS.md mục 16; mục 1 trade unit / order deadline / CI game ✅ — mục 19; shelf life, promotion, SL hứa + type, payment term ✅ — mục 20)

> Lựa chọn của mọi ô hợp đồng đã có trong sheet (tab 6 dòng 55–72) → `data.sales.options`. Dùng đó cho dropdown, không gõ cứng.

### Dữ liệu có trong sheet (tab 6, tab 2, tab 10)
- `sales.contracts`: 3 khách (cửa hàng, thị phần, value for money, CI, SL type, SL hứa, shelf life, order deadline, trade unit, payment term, promotion pressure/horizon, SKU mua).
- `sales.customerResults`, `productResults`, `customerProduct` (giá bán, attained shelf life, SL, OSA, bán thêm nhờ promo).
- Tab 2: contracted sales + penalty từng khách. Tab luật: promotion Low +0,5–1%, Middle +1,5–2%, High +4–5,5% sản lượng (value for money gấp đôi); shelf life 40–85%; SL type units/order lines/orders.

### Đã biết / chưa biết
- ✅ **Doanh thu khách = contracted × (attained CI ÷ contract CI)**: F&G 1.045.034 vs 1.045.136; LAND 586.420 vs 586.461; Dominick's 674.477 vs 674.658. Tức penalty = contracted × (1 − attained CI ÷ CI).
- ⚠️ **Attained CI phụ thuộc SL đạt được thế nào: CHƯA RÕ.** R0: SL order lines 91,2% / 92,1% / 93,2% (hứa 95%) → attained/CI = 0,805 / 0,927 / 0,966 — không tuyến tính, có thể còn phụ thuộc shelf life, loại khách. Chỉ có 1 điểm/khách → **không fit được công thức**. Đề xuất: neo tỷ lệ penalty R0 từng khách, co giãn theo mức thiếu SL (badge "ước lượng"), và hỏi người dùng có thêm dữ liệu (luật penalty trong Info Center, các round khác) không.
- ⚠️ Contract index khi đổi điều kiện hợp đồng (SL hứa, shelf life, deadline, trade unit, payment term, promotion): game chỉ cho biết hướng ("hứa cao thì giá cao") → không dự đoán số → ô "CI game hiển thị".
- ✅ Nối sẵn: SL TP dự kiến (M2, `ScProductResult.slPiecesEst`) → dùng làm đầu vào SL. Trade unit/order deadline → giờ soạn hàng kho TP (`customerPicking` trong `sales.ts`, định mức 10 phút/dòng, 6 phút/pallet hoặc layer, 3 phút/thùng). Shelf life khách → tuổi tồn cho phép (`productRisk`).
- ⚠️ Promotion → sản lượng: luật cho khoảng % → dùng giữa khoảng + badge; biến động nhu cầu tăng thì chưa có số.
- ⚠️ **Phí phân phối**: luật ghi €31/pallet nhưng R0 = €192.114 ÷ (334,5 pallet/tuần × 26) = **€22,09/pallet**. Chưa rõ vì sao (có thể theo cỡ lô giao — tab 10 Distributor: 373 / 1.146 / 7.180 pallet theo lô nhỏ/vừa/lớn). → Neo theo R0, KHÔNG dùng thẳng €31.
- Revenue khi demand đổi: nhu cầu chỉ có R0 (tab 3, 6, 12) — chưa có dự báo round sau.

### UI Sales
- Mỗi khách: các điều khoản hợp đồng như game (dropdown), ô CI game hiển thị; shortage rule (Proportional / FCFS / Customer priority).
- Kết quả: contracted, penalty, realized revenue, SL dự kiến vs hứa, giờ soạn hàng (→ Ops), KPI Sales (GM, obsolete, SL outbound), điểm phòng (doanh thu).

---

## M4 — Finance đầy đủ

### Hiện trạng
- `src/model/finance.ts`: P&L R0, thay dòng Ops (M1), Stock + lãi tồn kho (M2), Machines. Các dòng khác giữ R0 (nhãn "số R0"). Phân rã ROI đã có (`buildBreakdown`).

### Còn phải làm
- ⚠️ **Payment terms (Investment) = 365.589 — công thức CHƯA RÕ.** Thử: AR theo realized revenue (2.306.255 ÷ 26 × 4 = 354.808) − AP (Σ purchase value ÷ 26 × payment term NCC = 140.602) = 214.206 ≠ 365.589; AR theo contracted (419.840) − AP = 279.238 ≠. Có thể liên quan "Start payment term" (When ordering / At delivery). → KHÔNG tự chế: neo 365.589 và co giãn theo thay đổi payment term khách/NCC (badge "ước lượng"), hỏi người dùng thêm thông tin Info Center.
- AR / AP tách riêng: ❌ thiếu dữ liệu (file chỉ có số ròng).
- Interest (27.419), Energy, Water, Other, Contracted suppliers (100.000), admin order lines: chưa rõ phụ thuộc gì → giữ R0, chỉ đổi khi có luật/dữ liệu.
- Costs of scrap (40.203): nối với obsolete (tuổi tồn M2) khi có công thức; hiện giữ R0.
- Test hiệu chỉnh ROI: baseline ROI = ô tab 2 (đã có), thêm test hướng tác động cho payment terms.

---

## M5 — Kịch bản & chia sẻ

- Nhóm đã có: snapshot có tên + bảng so sánh (tab Nhóm), kịch bản riêng.
- Còn thiếu theo CLAUDE.md mục 8: **"Copy link kịch bản"** (mã hóa `Inputs` vào URL hash, base64 nén — dùng `CompressionStream` hoặc LZ đơn giản, không thêm CDN), **Xuất/Nhập JSON**, so sánh nhiều kịch bản ở chế độ một mình (lưu localStorage).
- Hướng dẫn deploy GitHub Pages đã có trong README.

---

## Câu hỏi nên hỏi người dùng trước khi bắt đầu M3

1. Có luật penalty / bonus service level chính xác trong Info Center không? (để tính attained CI)
2. Khi đàm phán, đội có ghi lại contract index game hiển thị sau Calculate không? (để nhập vào app)
3. Có dữ liệu round khác (R1 trial…) để kiểm chứng công thức giá và penalty không?
4. Payment terms: Info Center có ghi cách tính phải thu / phải trả không?
