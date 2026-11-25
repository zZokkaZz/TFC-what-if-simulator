# PROGRESS — Dự án đang ở đâu (đọc sau CLAUDE.md)

> Cập nhật: 25/11/2026. **Phiên nào làm xong việc gì cũng phải sửa file này** (mục "Đã xong", "Việc tiếp theo", "Nhật ký phiên").

## 0. Đọc theo thứ tự này trước khi làm bất cứ gì

1. `CLAUDE.md` — brief, **mục 0 LUẬT SỐ 1: KHÔNG BỊA SỐ**, luật game, kiến trúc.
2. `PROGRESS.md` (file này) — trạng thái, quyết định đã chốt, việc làm tay.
3. `ROADMAP_M3_M4_M5.md` — cách làm các mốc còn lại, cái gì đã biết / CHƯA biết trong dữ liệu.
4. `ASSUMPTIONS.md` — mọi giả định, hệ số, chỗ lệch giữa các tab.
5. Chạy `npm install` rồi `npm run verify` (đọc Excel → test → build). Phải xanh hết rồi mới sửa.

## 1. Đã xong

| Mốc | Nội dung | Ở đâu |
|---|---|---|
| M0 | Đọc `data/TFC_Round0.xlsx` theo tên cột → `src/data/round0.json`; bảng nguyên văn từng tab | `scripts/build-data.ts` |
| M1 Ops | Kho NL/TP (dao động theo ngày từ tab 11), dây chuyền, máy trộn, tank yard, chi phí Ops | `src/model/ops.ts`, `src/ui/OpsTab.tsx` |
| M1.5 Nhóm | Firebase realtime: mã đội, 5 vai trò, mỗi phòng 1 document, nhật ký, kịch bản riêng, snapshot, báo lỗi rõ | `src/sync/*`, `firestore.rules` |
| M2 SC | Ô quyết định SC, tồn kho/availability/SL dự kiến, nối Ops & Finance, cảnh báo liên phòng ban | `src/model/supplyChain.ts`, `src/model/warnings.ts`, `src/ui/SupplyChainTab.tsx` |
| Neo số đề bài | **Số hiển thị = số R0 sheet × (mô hình mới ÷ mô hình baseline)** → không đổi gì thì mọi số = đúng sheet (ROI −7,68%) | `src/model/anchor.ts` |
| Dashboard KPI | KPI 4 phòng như dashboard game + điểm phòng theo luật + danh sách số còn thiếu | `src/model/kpi.ts`, `src/ui/DashboardTab.tsx` |
| Sửa sau tự kiểm tra | Câu Investment→ROI theo dấu OP; cảnh báo lot size ↓ → phí vận chuyển/đơn hàng (chưa tính, M3); giải thích interval ngắn ↔ mẻ tối thiểu máy trộn; hiện cả số game in & tổng dòng sheet (OP, Indirect); ±0,00; lockfile | `src/model/warnings.ts`, `src/ui/r0Sources.ts`, `ASSUMPTIONS.md` mục 14 |
| M3 Purchasing | Ô quyết định NCC + ô đàm phán + 3 ô số game (CI, reliability, rejection) cho 5 NL; purchase value (công thức đã kiểm chứng), phí vận chuyển & phí đơn hàng (ước lượng), payment term → Investment, reliability/lead time → availability, quality bao bì → hỏng máy; KPI Purchasing; cảnh báo; rules Firestore | `src/model/purchasing.ts`, `src/ui/PurchasingTab.tsx`, `firestore.rules`, `ASSUMPTIONS.md` mục 15 |
| M3 Sales (SL) | Service level TP ← safety stock TP, interval, plan adherence (gồm availability NL, capacity); SL khách → penalty service level (neo từng khách, ước lượng) → realized revenue; KPI SL outbound; frozen period = chưa mô hình | `src/model/sales.ts`, `src/model/supplyChain.ts`, `src/ui/SalesTab.tsx`, `ASSUMPTIONS.md` mục 16 |
| Sửa sau rà soát | Dữ liệu mới (tab 5 D29, tab 6 cột mới); tiêu đề mơ hồ → lỗi; penalty có trần + cờ "ngoài vùng dữ liệu R0"; màu Investment theo ROI; tank yard 2 nguồn; bảng nguyên văn tab 6 | `scripts/build-data.ts`, `src/model/sales.ts`, `ASSUMPTIONS.md` mục 17 |
| C2 + V1 | Obsolete & Costs of scrap theo tuổi tồn (hiệu chỉnh R0, cảnh báo đỏ); plan adherence tách phần thiếu NL / capacity, số chính B (0,5) + thận trọng min(B, C) | `src/model/supplyChain.ts`, `finance.ts`, `ui/conservative.ts`, `ASSUMPTIONS.md` mục 18 |
| M3 Sales mục 1 | Đọc khối "LỰA CHỌN HỢP ĐỒNG SALES" (tab 6) → dropdown; ô trade unit (→ giờ soạn hàng kho TP), order deadline (chỉ cảnh báo), CI game khách (→ contracted sales); hệ số CI trong COEFFS (= 0); rules Firestore | `src/model/sales.ts`, `src/ui/SalesTab.tsx`, `firestore.rules`, `ASSUMPTIONS.md` mục 19 |
| M3 Sales 4 mục cuối | Shelf life (→ tuổi tồn → obsolete/scrap), promotion (→ nhu cầu → sản xuất/tồn/SL/doanh thu) + horizon (cảnh báo), SL hứa + SL type (→ mốc penalty), payment term khách (→ AR → Investment); 6 hệ số CI = 0; ghi chú "giá tăng/giảm"; rules | `src/model/sales.ts`, `supplyChain.ts`, `finance.ts`, `src/ui/SalesTab.tsx`, `firestore.rules`, `ASSUMPTIONS.md` mục 20 |
| Phần chung | Phân rã ROI, bảng kiểm tra dữ liệu Excel (16 phép), bảng nguyên văn Ops & SC từ tab 2/3/5/7/10/11/12/13 | `src/model/finance.ts`, `src/model/dataChecks.ts`, `src/ui/RawTable.tsx` |

Test: 350 test (`npm test`) + 59 test rules trên emulator (`scripts/test-rules.mjs`), trong đó quan trọng nhất:
- `tests/sheet-fidelity.test.ts` — đọc thẳng file Excel so **từng ô**; baseline hiển thị = đúng sheet (ROI = ô tab 2).
- `tests/calibration.test.ts` — độ chính xác mô hình thô so với R0 (mục 7 CLAUDE.md).
- `tests/kpi.test.ts`, `tests/supplychain.test.ts`, `tests/directions.test.ts`, `tests/sync.test.ts`.
- `tests/sales.test.ts` — M3 Sales: **bắt buộc** giảm safety stock TP 3 → 1 làm ROI (và Operating profit) xấu đi; frozen period không đổi số.
- `tests/purchasing.test.ts` — M3 Purchasing: hướng tác động, ô số game, cảnh báo, đồng bộ.
- `tests/sales-terms.test.ts` — M3 Sales 4 mục cuối: mỗi ô 1+ test đúng hướng, baseline = sheet, giới hạn = khoảng sheet = rules.
- `tests/sales-contract.test.ts` — M3 Sales mục 1: lựa chọn đọc từ sheet, hướng trade unit → giờ kho TP, deadline chưa mô hình, CI game → contracted, đồng bộ & rules.
- `tests/fixes-review.test.ts` — các chỗ sửa sau phiên tự kiểm tra (câu ROI khi lỗ, cảnh báo lot size, mẻ tối thiểu máy trộn, số game in, định dạng ±0).

## 2. Việc tiếp theo (CHỜ người dùng ra lệnh — không tự làm)

1. ~~M3 Sales~~ — **đã đủ ô hợp đồng** (PR Sales cuối, chờ merge). Chờ người dùng ra lệnh mốc tiếp theo.
2. **M4 — Finance đầy đủ** (payment terms → AR/AP, các dòng còn giữ R0).
3. **M5 — Kịch bản có tên + so sánh + "Copy link kịch bản" + Xuất/Nhập JSON** (snapshot nhóm đã có một phần).

## 3. Đang chờ dữ liệu từ người dùng

- **Bản sheet có tiêu đề song ngữ** (bạn Thư sửa trên Google Sheet) — CHƯA upload vào repo. Khi upload: `npm run data`; nếu script báo không nhận ra cột → sửa regex trong `build-data.ts` (nhận cả tên cũ và mới), KHÔNG đoán cột.
- **Dashboard KPI có 2 loại "thiếu" — đừng nhầm:**
  - Nhãn **"chưa mô hình"** (số đứng yên = R0): Sales obsolete. (SL outbound, điểm phòng Sales đã nối ở M3 Sales — ước lượng.) (Purchasing đã nối ở M3 Purchasing: rejection/reliability "ước lượng", raw material costs "mô hình".) (trong `src/model/kpi.ts` đổi `scenarioBasis` + công thức kịch bản). Rejection/reliability NCC mới chỉ có số cam kết → "ước lượng" trừ khi đội nhập số game.
  - **"R-2: thiếu"** (dấu ? đỏ): số lịch sử game KHÔNG có trong sheet → M3/M4 KHÔNG tạo ra được, **cấm tự điền**; chỉ người dùng bổ sung vào sheet (số có trong game: tab dashboard từng phòng, rê chuột điểm Round -2).
- **Số dashboard còn thiếu trong sheet** (app đang ghi "thiếu"): R-2 của Purchasing (rejection, raw material costs, delivery reliability), Sales (gross margin tổng, obsolete, SL outbound order lines); nhận xét game của Purchasing/Operations/Sales. Gợi ý người dùng thêm bảng "DASHBOARD" mỗi tab như tab 7 dòng 48–53.
- ~~Lỗi tab 1 ô "Availability Vitamin C" = 0~~ — đã sửa trong bản upload 25/11 (C29 = 0,843).
- Tab 6 B69 (khối lựa chọn, ghi chú "Kiểm chứng") viết "F&G và LAND 2,9–3,7% nằm trong 3,0–4,0%": 2,9% thực ra hơi dưới 3,0% — app chỉ hiện nguyên văn, không dùng ô này.

## 4. Quyết định đã chốt (không tự đổi)

- Chỉ đọc dữ liệu từ `data/TFC_Round0.xlsx` (bản upload GitHub). Người dùng upload bản mới lên `main` ở thư mục gốc với tên "TFC Round Trial.xlsx" → copy đè vào `data/TFC_Round0.xlsx`, `git rm` file ở thư mục gốc, rồi `npm run verify`. Code KHÔNG đọc file ở thư mục gốc.
- Tab luật trong file tên `Luật for ops and others phòng b` (= `8_Luật game`).
- Firebase: project `tfc-group`, Firestore + Anonymous Auth, gói Spark. **Mã đội KHÔNG bao giờ ghi vào code/repo/commit/log.** Rules ở `firestore.rules`; đổi rules → nhắc người dùng Publish lại trong Console (Firestore → Rules) và chạy `scripts/test-rules.mjs` trên emulator.
- Giới hạn ô nhập (`src/sync/limits.ts`) phải khớp `firestore.rules` (có test).
- **Neo số**: mọi số mang tên cột/KPI của game phải = đúng sheet khi chưa đổi quyết định. Số mô hình thô chỉ hiện ở bảng "Độ chính xác của mô hình".
- Chưa mô hình → giữ số R0 và gắn nhãn "chưa mô hình"; giả định → badge "ước lượng" + ghi `ASSUMPTIONS.md`.
- Deploy: GitHub Pages phục vụ `docs/index.html` (`npm run build` tự chép từ `dist/`). `dist/index.html` được commit có chủ đích.
- Làm việc trên nhánh riêng, mở PR nháp; không push thẳng `main` khi chưa được phép.

## 5. Việc người dùng phải làm tay (Claude không làm được)

- **M3 Sales 4 mục cuối đổi `firestore.rules` (validCust thêm 6 trường) → Publish lại rules** (bản mục 1 đã Publish 25/11 lúc 22:16 — đã đối chiếu khớp repo). Chưa Publish bản mới thì ghi SL hứa / shelf life / payment term / promotion lên bản chung bị chặn.
- Hệ số CI Sales (`COEFFS.salesCiPerStepTradeUnit`, `salesCiPerStepOrderDeadline`) **người dùng chốt giữ = 0**; web ghi rõ "Chưa tính phần giá tăng (CI)…" cạnh ô. Có CI game thì nhập ô "CI game hiển thị".
- **M3 Purchasing đổi `firestore.rules` → Publish lại rules** trong Firebase Console (Firestore → Rules). Chưa Publish thì ghi phần Purchasing có `terms` sẽ bị chặn (báo lỗi rõ trên app).

- Upload file .xlsx mới khi sửa Google Sheet.
- Publish `firestore.rules` trong Firebase Console khi rules đổi.
- Merge PR và (nếu đổi nhánh) chỉnh Settings → Pages.
- Giữ và gửi mã đội cho đồng đội qua kênh riêng.

## 6. Nhật ký phiên (thêm dòng mới ở trên cùng)

- 25/11/2026 — M3 Sales 4 mục cuối (gộp 1 PR theo yêu cầu): shelf life, promotion + horizon, SL hứa + SL type, payment term khách; 6 hệ số CI = 0; 350/350 + rules 59/59. Rules mục 1 đã Publish (22:16, khớp repo). Cần người dùng: Publish rules mới, merge PR.

## 7. Ý tưởng phát sinh (CHƯA làm — chỉ ghi lại, chờ người dùng quyết)

- Shortage rule (Proportional / FCFS / Customer priority) và bật/tắt SKU cho từng khách (tab 6 dòng 65–66) chưa có ô.
- Promotion làm nhu cầu biến động hơn (σ) và promotion horizon → safety stock TP: luật chỉ cho hướng, chưa có độ lớn.
- Thưởng khi vượt SL hứa ("bonus nhỏ"): chưa có độ lớn.
- Shelf life: app dùng mức cao nhất của các khách mua SKU; nếu game phân hàng già cho khách đòi thấp hơn thì obsolete thấp hơn — kiểm chứng bằng vòng trial.
- AR theo realized revenue: nếu game tính AR theo contracted / theo "start payment term" thì Payment terms khác — kiểm chứng khi có số AR/AP tách riêng.
- Promotion: số dòng đơn giữ R0 (dòng to hơn) — nếu game thêm dòng đơn thì giờ soạn hàng cao hơn.
- Hàng obsolete bị hủy chưa kéo theo sản xuất bù (đã ghi từ C2).

- 25/11/2026 — Dữ liệu mới (tab 6 khối LỰA CHỌN HỢP ĐỒNG SALES, tab 1 C29) + M3 Sales mục 1 (session_018GSfKVc6kuoV5G75kcCjSs, nhánh `claude/modest-curie-joo7me`): trade unit → giờ soạn hàng kho TP, order deadline chỉ cảnh báo, CI game khách → contracted; hệ số CI trong COEFFS = 0; 312/312 + rules 49/49. Người dùng chốt giữ hệ số CI = 0 + thêm ghi chú cạnh ô trên web (313/313). Cần người dùng: Publish rules, merge PR #7.

- 25/11/2026 — PR #6 bổ sung: `obsoleteAgeSpreadScale` = 2 (người dùng chọn); kiểm tra PM → hệ số `maintenanceDisruptionWeight` = 0 (người dùng chọn: bảo trì có lịch trước, không làm trễ kế hoạch như hỏng đột xuất); bảng kịch bản thêm tổ hợp Training; ghi "chưa mô hình: sản xuất bù hàng hủy" trên web.
- 25/11/2026 — C2 + V1 (nhánh `claude/c2-v1`): obsolete/scrap theo tuổi tồn, V1 B chính + thận trọng; 270/270. Cần người dùng xem độ dốc obsolete (SS TP 5 → ~92%) và hệ số `obsoleteAgeSpreadScale`.

- 25/11/2026 — Gom hệ số ước lượng chưa xác minh vào `COEFFS` (`src/model/assumptions.ts`): mốc ngoài vùng R0, mũ penalty, độ dốc capacity V1 phương án B/C. Có dữ liệu trial → sửa ở đó, chạy `npm run verify`.
- 25/11/2026 — Rà soát 4 phòng (chỉ đọc) + PR sửa lỗi C1, V3, T1–T4 (nhánh `claude/fix-audit`). Còn chờ người dùng chọn phương án: **C2** (obsolete/scrap theo tuổi tồn — đã duyệt hướng) và **V1** (tách adherence thiếu NL / capacity — đang chọn phương án).

- 25/11/2026 — M3 Sales phần service level (nhánh `claude/m3-sales`): SL dự kiến → penalty → realized revenue (ước lượng, neo từng khách), kiểm chứng revenue = contracted + penalty (khớp tuyệt đối), frozen period chưa mô hình, 217/217. Cần người dùng xem độ lớn (vd thêm ca → penalty = 0).

- 25/11/2026 — M3 Purchasing (session_018GSfKVhedGZtbWSVUzvR7M, nhánh `claude/m3-purchasing`): ô quyết định + mô hình + rules + 35 test mới (200/200) + 40/40 rules. Phát hiện: Purchase value = giá cơ bản × CI × lượng mua + phí vận chuyển (khớp ≤ €1). Chưa làm Sales.

- 25/11/2026 — Phiên tự kiểm tra app (session_018GSfKVhedGZtbWSVUzvR7M): vọc app bằng Playwright (một mình + `?mock=1` 2 tab), sửa 5 mục người dùng duyệt (xem `ASSUMPTIONS.md` mục 14). Câu hỏi còn mở: game có tính safety stock NL theo lượng dùng gồm phần sản xuất thừa (mẻ tối thiểu) không. Câu hỏi trước M3 (penalty, CI sau đàm phán, round khác, payment terms): người dùng sẽ trả lời sau.

- 25/11/2026 — Ghi rõ 2 loại "thiếu" trên dashboard (chưa mô hình → M3; R-2 thiếu → chỉ sheet bổ sung).

- 25/11/2026 — Phiên đầu (session_01S6eySWv8rcftxr28S1gPYY): M0, M1, M1.5, M2, neo số đề bài, dashboard KPI, bảng nguyên văn, luật "không bịa số", bộ tài liệu bàn giao.
