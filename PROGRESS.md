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
| Phần chung | Phân rã ROI, bảng kiểm tra dữ liệu Excel (16 phép), bảng nguyên văn Ops & SC từ tab 2/3/5/7/10/11/12/13 | `src/model/finance.ts`, `src/model/dataChecks.ts`, `src/ui/RawTable.tsx` |

Test: 165 test (`npm test`), trong đó quan trọng nhất:
- `tests/sheet-fidelity.test.ts` — đọc thẳng file Excel so **từng ô**; baseline hiển thị = đúng sheet (ROI = ô tab 2).
- `tests/calibration.test.ts` — độ chính xác mô hình thô so với R0 (mục 7 CLAUDE.md).
- `tests/kpi.test.ts`, `tests/supplychain.test.ts`, `tests/directions.test.ts`, `tests/sync.test.ts`.
- `tests/fixes-review.test.ts` — các chỗ sửa sau phiên tự kiểm tra (câu ROI khi lỗ, cảnh báo lot size, mẻ tối thiểu máy trộn, số game in, định dạng ±0).

## 2. Việc tiếp theo (CHỜ người dùng ra lệnh — không tự làm)

1. **M3 — Purchasing + Sales** (xem `ROADMAP_M3_M4_M5.md` mục M3). Người dùng muốn làm **từng mục một**, hỏi trước khi bắt đầu.
2. **M4 — Finance đầy đủ** (payment terms → AR/AP, các dòng còn giữ R0).
3. **M5 — Kịch bản có tên + so sánh + "Copy link kịch bản" + Xuất/Nhập JSON** (snapshot nhóm đã có một phần).

## 3. Đang chờ dữ liệu từ người dùng

- **Bản sheet có tiêu đề song ngữ** (bạn Thư sửa trên Google Sheet) — CHƯA upload vào repo. Khi upload: `npm run data`; nếu script báo không nhận ra cột → sửa regex trong `build-data.ts` (nhận cả tên cũ và mới), KHÔNG đoán cột.
- **Dashboard KPI có 2 loại "thiếu" — đừng nhầm:**
  - Nhãn **"chưa mô hình"** (số đứng yên = R0): Purchasing (rejection, raw material costs, delivery reliability), Sales (obsolete, SL outbound), điểm phòng Purchasing/Sales → **M3 sẽ nối** vào mô hình (trong `src/model/kpi.ts` đổi `scenarioBasis` + công thức kịch bản). Rejection/reliability NCC mới chỉ có số cam kết → "ước lượng" trừ khi đội nhập số game.
  - **"R-2: thiếu"** (dấu ? đỏ): số lịch sử game KHÔNG có trong sheet → M3/M4 KHÔNG tạo ra được, **cấm tự điền**; chỉ người dùng bổ sung vào sheet (số có trong game: tab dashboard từng phòng, rê chuột điểm Round -2).
- **Số dashboard còn thiếu trong sheet** (app đang ghi "thiếu"): R-2 của Purchasing (rejection, raw material costs, delivery reliability), Sales (gross margin tổng, obsolete, SL outbound order lines); nhận xét game của Purchasing/Operations/Sales. Gợi ý người dùng thêm bảng "DASHBOARD" mỗi tab như tab 7 dòng 48–53.
- **Lỗi trong sheet (người dùng sửa):** tab 1 ô "Availability Vitamin C" = 0 vì công thức trỏ `'7_Supply Chain'!H29` (phải là I29 = 84,3%). App không đọc ô này.

## 4. Quyết định đã chốt (không tự đổi)

- Chỉ đọc dữ liệu từ `data/TFC_Round0.xlsx` (bản upload GitHub). File gốc tên "TFC Round Trial.xlsx" — khi người dùng upload bản mới lên `main` với tên đó, phải `git merge origin/main` (git tự áp vào `data/TFC_Round0.xlsx`) hoặc copy đè, rồi `npm run verify`.
- Tab luật trong file tên `Luật for ops and others phòng b` (= `8_Luật game`).
- Firebase: project `tfc-group`, Firestore + Anonymous Auth, gói Spark. **Mã đội KHÔNG bao giờ ghi vào code/repo/commit/log.** Rules ở `firestore.rules`; đổi rules → nhắc người dùng Publish lại trong Console (Firestore → Rules) và chạy `scripts/test-rules.mjs` trên emulator.
- Giới hạn ô nhập (`src/sync/limits.ts`) phải khớp `firestore.rules` (có test).
- **Neo số**: mọi số mang tên cột/KPI của game phải = đúng sheet khi chưa đổi quyết định. Số mô hình thô chỉ hiện ở bảng "Độ chính xác của mô hình".
- Chưa mô hình → giữ số R0 và gắn nhãn "chưa mô hình"; giả định → badge "ước lượng" + ghi `ASSUMPTIONS.md`.
- Deploy: GitHub Pages phục vụ `docs/index.html` (`npm run build` tự chép từ `dist/`). `dist/index.html` được commit có chủ đích.
- Làm việc trên nhánh riêng, mở PR nháp; không push thẳng `main` khi chưa được phép.

## 5. Việc người dùng phải làm tay (Claude không làm được)

- Upload file .xlsx mới khi sửa Google Sheet.
- Publish `firestore.rules` trong Firebase Console khi rules đổi.
- Merge PR và (nếu đổi nhánh) chỉnh Settings → Pages.
- Giữ và gửi mã đội cho đồng đội qua kênh riêng.

## 6. Nhật ký phiên (thêm dòng mới ở trên cùng)

- 25/11/2026 — Phiên tự kiểm tra app (session_018GSfKVhedGZtbWSVUzvR7M): vọc app bằng Playwright (một mình + `?mock=1` 2 tab), sửa 5 mục người dùng duyệt (xem `ASSUMPTIONS.md` mục 14). Câu hỏi còn mở: game có tính safety stock NL theo lượng dùng gồm phần sản xuất thừa (mẻ tối thiểu) không. Câu hỏi trước M3 (penalty, CI sau đàm phán, round khác, payment terms): người dùng sẽ trả lời sau.

- 25/11/2026 — Ghi rõ 2 loại "thiếu" trên dashboard (chưa mô hình → M3; R-2 thiếu → chỉ sheet bổ sung).

- 25/11/2026 — Phiên đầu (session_01S6eySWv8rcftxr28S1gPYY): M0, M1, M1.5, M2, neo số đề bài, dashboard KPI, bảng nguyên văn, luật "không bịa số", bộ tài liệu bàn giao.
