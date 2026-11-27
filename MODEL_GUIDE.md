# MODEL_GUIDE — Simulator chạy thế nào (đọc sau PROGRESS.md)

> Mục đích: phiên Claude mới hiểu ngay model, luồng dữ liệu giữa 4 phòng, file nào làm gì, sửa ở đâu. Không lặp lại luật game (xem `CLAUDE.md` mục 6) hay giả định (xem `ASSUMPTIONS.md`).

## 1. Nguyên tắc nền

1. **Neo số R0**: mỗi số hiển thị mang tên cột/KPI của game = số R0 trong sheet × (model kịch bản ÷ model baseline). Không đổi quyết định nào → đúng từng ô sheet (ROI −7,68%). Code: `src/model/anchor.ts`, và các `cell(...)`/`ratio(...)` trong `supplyChain.ts`, `purchasing.ts`, `finance.ts`.
2. **Hàm thuần**: `simulate(inputs, data, est?) → Results` trong `src/model/simulate.ts`, không đụng DOM, chạy lại toàn bộ mỗi lần đổi một ô (vài ms).
3. **Ba loại số**: luật (định mức Info Center, `rules.ts`), mô hình hiệu chỉnh R0 (`calibration.ts`), ước lượng (hệ số trong `COEFFS` / `EST` ở `assumptions.ts`, có nguồn, trạng thái, nơi dùng). Trên giao diện có badge tương ứng.
4. **Dữ liệu chỉ từ Excel**: `scripts/build-data.ts` đọc `data/TFC_Round0.xlsx` theo tiêu đề cột → `src/data/round0.json`. Không gõ tay số vào code.

## 2. Luồng tính trong `simulate()`

```
inputs (4 phòng) + data (round0.json)
  │
  ├─ simulateOps (ops.ts)              ← dùng: SC (SS/lot NL, interval TP), Purchasing (NCC, quality, trade unit, lead time),
  │    │                                  Sales (promotion → nhu cầu, trade unit khách → giờ soạn hàng)
  │    ├─ sản xuất từng SKU: nhu cầu × hệ số promotion, interval → mẻ, máy trộn (mẻ tối thiểu/tối đa)
  │    ├─ dây chuyền: run, changeover (SMED), breakdown (chất lượng bao bì, PM, training, tolerance), overtime, plan adherence
  │    ├─ componentFlows/componentRisk (supplyChain.ts): lượng dùng, cỡ đơn (≥ 1 trade unit), tồn NL, tỷ lệ thiếu → availability NL
  │    ├─ kho NL / kho TP / tank yard: replay 130 ngày tab 11, co giãn theo cỡ lô → đỉnh, overflow, giờ công, thời vụ
  │    └─ chi phí Ops từng dòng
  ├─ anchorOps (anchor.ts)             → số Ops hiển thị (neo R0)
  ├─ simulateSupplyChain (supplyChain.ts) ← dùng Ops thô
  │    ├─ tồn NL/TP (giá trị, tuần), availability NL hiển thị
  │    ├─ SL TP dự kiến từng SKU: thiếu hàng (SS, interval) + plan adherence (phần thiếu NL 0,974; phần capacity COEFFS.capacitySlopeB/C)
  │    └─ obsolete theo tuổi tồn (C2): tuổi cho phép = 20 tuần × (1 − shelf life khách cao nhất)
  ├─ simulateSales (sales.ts)          ← dùng SL TP từng SKU + ô hợp đồng Sales
  │    ├─ SL khách (pieces / order lines / orders) → mức thiếu so với SL hứa → penalty (neo từng khách, COEFFS.penaltyShortfallExponent)
  │    ├─ contracted = R0 × lượng promotion × CI ÷ CI R0 (CI = số game nhập, hoặc hệ số COEFFS = 0)
  │    └─ phải thu (AR) = revenue ÷ 26 × payment term khách; phí phân phối theo pallet
  ├─ simulatePurchasing (purchasing.ts) ← dùng lượng mua từ Ops, revenue
  │    └─ purchase value = giá cơ bản × CI × lượng + phí vận chuyển; phải trả (AP) theo start payment term
  ├─ simulateFinance (finance.ts)      → P&L từng dòng (nhãn nguồn LINE_BASIS), Investment, ROI
  └─ conservative                      → ROI "thận trọng" (SL = min phương án B, C)
```

## 3. Các phòng tác động lẫn nhau ở đâu trong code

| Quyết định | Đi qua | Đến |
|---|---|---|
| SC: safety stock / lot size NL | `componentFlows`, `componentRisk` | tồn & kho NL (Ops), availability → plan adherence → SL → penalty (Sales), số chuyến → phí vận chuyển (Purchasing), Stock (Finance) |
| SC: interval / SS TP | `opsCore` (mẻ, changeover), `productRisk` | giờ dây chuyền (Ops), tồn & kho TP, obsolete/scrap, SL |
| Purchasing: NCC, trade unit, quality | `activeSupplier` | lead time/reliability → availability; quality → hỏng máy; trade unit → cỡ đơn, cách chứa (pallet/tank) |
| Ops: ca, SMED, PM, training, speed | `opsCore` | plan adherence → SL → penalty (Sales) |
| Ops: pallet locations, FTE | replay theo ngày | overflow, thời vụ (Finance) |
| Sales: promotion | `demandBySku`, `promoFactor` | sản xuất, tồn, mua NL, doanh thu |
| Sales: shelf life | `requiredShelfLife` | tuổi tồn cho phép → obsolete |
| Sales: SL hứa / SL type | `simulateSales` | penalty; gợi ý SS TP (SC) |
| Sales: payment term | `simulateSales` (AR) | Investment |
| Sales: trade unit, deadline | `customerPicking`; cảnh báo | giờ soạn hàng kho TP (deadline: chỉ cảnh báo) |
| Sales: shortage rule | — | **chưa mô hình** (chỉ ghi nhận + cảnh báo) |

- Nhãn "← do SC đổi lot size" trên giao diện: bảng `DRIVERS` trong `src/ui/trace.ts`.
- Cảnh báo liên phòng ban (phòng gây ra → phòng bị ảnh hưởng → dòng ROI): `src/model/warnings.ts`.
- KPI dashboard 4 phòng như game: `src/model/kpi.ts`.

## 4. Đồng bộ nhóm (Firebase)

- `src/sync/controller.ts`: bản chung, ghi trễ 500 ms, nhật ký, snapshot; chỉ bỏ qua "tiếng vọng" của lần ghi trong phiên (theo `rev`) — sửa lỗi F5 ngày 26/11.
- `src/sync/sanitize.ts` (ghép dữ liệu nhận về lên baseline), `src/sync/limits.ts` (giới hạn ô) **phải khớp** `firestore.rules` (có test). Đổi rules → chạy `scripts/test-rules.mjs` trên emulator (`npm install --no-save firebase-tools @firebase/rules-unit-testing@4`) và nhắc người dùng Publish.
- Mã đội không bao giờ ghi vào repo.

## 5. Test quan trọng

| Test | Kiểm |
|---|---|
| `tests/sheet-fidelity.test.ts` | Đọc thẳng Excel, baseline = đúng từng ô sheet. Đỏ thì không push. |
| `tests/calibration.test.ts` | Model thô so với R0 (CLAUDE.md mục 7) |
| `tests/coeffs.test.ts` | Mỗi hệ số COEFFS có nguồn, `usedIn` khớp code |
| `tests/finance-m4.test.ts` | Đẳng thức P&L/ROI ở nhiều kịch bản, dòng giữ R0 không đổi |
| `tests/directions.test.ts`, `sales*.test.ts`, `purchasing.test.ts`, `review-fixes.test.ts` | Hướng tác động từng quyết định |
| `tests/sync.test.ts`, `tests/shortage-rule.test.ts` | Đồng bộ, F5, rules |

Lệnh: `npm run verify` = đọc Excel → toàn bộ test → build `dist/index.html` (chép sang `docs/` cho GitHub Pages).

## 6. Muốn thử nhanh nhiều kịch bản

Viết test tạm trong `tests/zz-*.test.ts` (gọi `baselineInputs`, `simulate`, `defaultTerms`), chạy `npx vitest run tests/zz-x.test.ts`, **xóa khi xong**. Ví dụ bộ quyết định Round 1 đã nộp: xem `ROUND1_ANALYSIS.md` mục 1.

## 7. Giới hạn đã biết (chi tiết ở `ROUND1_BACKTEST.md` mục 9.3)

- Đã hiệu chỉnh theo 2 điểm (R0 + R1, 27/11): backtest R1 ROI 5,36% (nhập số NCC thật) / 5,12% (đoán NCC) vs game 5,04%. Test: `tests/backtest-r1.test.ts`; dữ liệu R1: `src/data/round1.json` (`scripts/build-data-r1.ts`), bộ quyết định R1: `src/model/round1.ts`.
- Còn lệch: phí FTL PET (pallet/xe 30 trong sheet vs ≈ 27 suy ra), hỏng máy thấp hơn game, thời vụ kho NL thấp, SL pieces C-power cao.
- Hệ số mới chỉ có 1–2 điểm dữ liệu: thưởng SL, dao động kho NL, phân tán tuổi tồn.
- Chưa mô hình: CI khi đổi điều khoản (hệ số = 0), shortage rule, frozen period, promotion horizon, hạn dùng NL, sản xuất bù hàng hủy, Energy/Water/Other/Interest (giữ R0).
