# TFC What-if Simulator

Web app để thử quyết định cho game **The Fresh Connection** (VSCC 2027, Challenge A) trước khi nhập vào game thật.
Sửa một ô quyết định thì mọi chỉ số liên quan và ROI tính lại ngay trong trình duyệt. Không cần backend, tài khoản hay mạng.

**Trạng thái: M0 + M1 (Operations).** Các tab Supply Chain, Purchasing, Sales hiện đang hiển thị dữ liệu Round 0 thô. Finance là P&L, trong đó các dòng Ops đã tính từ model.

## Mở app

- **Cách nhanh nhất:** tải file [`dist/index.html`](dist/index.html) rồi double-click để mở bằng Chrome/Edge/Firefox. File tự chứa toàn bộ JS, CSS và dữ liệu, mở được cả khi offline.
- Quyết định đang thử được lưu trong trình duyệt (localStorage), nên F5 không mất. Nút **Reset về Round 0** đưa mọi quyết định về baseline.

## Dành cho người phát triển

```bash
npm install
npm run data     # đọc data/TFC_Round0.xlsx → src/data/round0.json
npm test         # Vitest: test hiệu chỉnh R0 + hướng tác động + định mức
npm run report   # in bảng so sánh mô hình vs Round 0
npm run dev      # chạy thử ở localhost
npm run build    # → dist/index.html (1 file)
```

Cập nhật dữ liệu: tải Google Sheet ra .xlsx, thay vào `data/TFC_Round0.xlsx`, rồi chạy `npm run data && npm test && npm run build`.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `data/TFC_Round0.xlsx` | Dữ liệu gốc Round 0 |
| `scripts/build-data.ts` | Đọc Excel theo tiêu đề cột → `src/data/round0.json` |
| `src/model/` | Hàm thuần `simulate(inputs, data)`: `ops.ts`, `supplyChain.ts`, `purchasing.ts`, `sales.ts`, `finance.ts`. Luật game nằm trong `rules.ts`, giả định trong `assumptions.ts`, hệ số hiệu chỉnh tự tính trong `calibration.ts` |
| `src/ui/` | Giao diện Preact |
| `tests/` | Vitest |
| `ASSUMPTIONS.md` | Mọi giả định, hệ số hiệu chỉnh và chỉ số còn lệch |
