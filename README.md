# TFC What-if Simulator

Web app để thử quyết định cho game **The Fresh Connection** (VSCC 2027, Challenge A) trước khi nhập vào game thật.
Sửa một ô quyết định thì mọi chỉ số liên quan và ROI tính lại ngay trong trình duyệt. Không cần backend, tài khoản hay mạng.

**Trạng thái: M0 + M1 (Operations) + M1.5 (đồng bộ nhóm realtime) + M2 (Supply Chain, cảnh báo liên phòng ban) + M3 Purchasing.** Tab Sales hiện đang hiển thị dữ liệu Round 0 thô. Finance là P&L, trong đó các dòng Ops, SC (tồn kho) và Purchasing (mua NL, phí đơn hàng, payment terms NCC) đã tính từ model.

## Mở app

- **Cách nhanh nhất:** tải file [`dist/index.html`](dist/index.html) rồi double-click để mở bằng Chrome/Edge/Firefox. File tự chứa toàn bộ JS, CSS và dữ liệu, mở được cả khi offline.
- Quyết định đang thử được lưu trong trình duyệt (localStorage), nên F5 không mất. Nút **Reset về Round 0** đưa mọi quyết định về baseline.

## Dùng theo nhóm (realtime)

1. Mở app, nhập **mã đội** (8–64 ký tự: chữ không dấu, số, `-`, `_`) và chọn vai trò. Mã do nhóm tự đặt; gửi cho nhau qua kênh riêng, **không** ghi vào repo.
2. Mỗi người chỉ sửa được ô của phòng mình. Người khác thấy thay đổi sau khoảng 1 giây. Tab **Nhóm** có nhật ký, bản chụp có tên và bảng so sánh.
3. Muốn thử số mà không làm đổi bản chung: bấm **Tách kịch bản riêng**, rồi **Đẩy lên bản chung** hoặc **Lấy lại bản chung**.
4. Muốn thử mà không dùng Firebase: thêm `?mock=1` vào cuối link. Các tab trên cùng máy sẽ đồng bộ với nhau qua bộ nhớ trình duyệt.

Thiết lập Firebase một lần (người quản lý project): dán `firestore.rules` vào Firebase Console → Firestore Database → Rules → **Publish**. Giới hạn bảo mật xem `ASSUMPTIONS.md` mục 8.

## Dành cho người phát triển / phiên Claude mới

Đọc theo thứ tự: `CLAUDE.md` (mục 0: KHÔNG BỊA SỐ, mục 0b: quy trình) → `PROGRESS.md` → `ROADMAP_M3_M4_M5.md` → `ASSUMPTIONS.md`. Chạy `npm install && npm run verify` trước khi sửa.


```bash
npm install
npm run data     # đọc data/TFC_Round0.xlsx → src/data/round0.json
npm test         # Vitest: test hiệu chỉnh R0 + hướng tác động + định mức
npm run report   # in bảng so sánh mô hình vs Round 0
npm run dev      # chạy thử ở localhost
npm run build    # → dist/index.html (1 file) + docs/index.html (GitHub Pages)
```

Kiểm thử Firebase:

```bash
# rules trên Firestore Emulator (cần Java 11+)
npm i -D firebase-tools @firebase/rules-unit-testing
npx firebase emulators:exec --only firestore --project demo-tfc "node scripts/test-rules.mjs"
# 2 phiên thật (sau khi đã Publish rules); TEAM nên là mã thử, không phải mã đội thật
NODE_USE_ENV_PROXY=1 TEAM=thu-nghiem-123 npx tsx scripts/firebase-smoke.ts
```

Cập nhật dữ liệu: tải Google Sheet ra .xlsx, thay vào `data/TFC_Round0.xlsx`, rồi chạy `npm run data && npm test && npm run build`.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `data/TFC_Round0.xlsx` | Dữ liệu gốc Round 0 |
| `scripts/build-data.ts` | Đọc Excel theo tiêu đề cột → `src/data/round0.json` |
| `src/model/` | Hàm thuần `simulate(inputs, data)`: `ops.ts`, `supplyChain.ts`, `purchasing.ts`, `sales.ts`, `finance.ts`. Luật game nằm trong `rules.ts`, giả định trong `assumptions.ts`, hệ số hiệu chỉnh tự tính trong `calibration.ts` |
| `src/sync/` | Đồng bộ nhóm: controller (không phụ thuộc Firebase), backend Firebase, backend giả lập |
| `src/ui/` | Giao diện Preact |
| `firestore.rules` | Quyền Firestore (dán vào Console) |
| `tests/` | Vitest |
| `ASSUMPTIONS.md` | Mọi giả định, hệ số hiệu chỉnh và chỉ số còn lệch |
