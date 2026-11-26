# ROUND1_ANALYSIS — Quyết định Round 1, kết quả thật, đối chiếu model (26/11/2026)

> Bản trình bày đầy đủ (có biểu đồ): https://claude.ai/artifact/Va8AuYs3eTgJcPze3oPmbF (riêng tư, người dùng tự Share).
> Nhãn: **game** = số chép từ màn hình game (ảnh chụp, CHƯA có file Excel R1); **model** = simulator; **suy ra** = tính ngược từ số game, có khoảng sai số; **giả thuyết** = cần dữ liệu xác nhận.
> Khi người dùng upload sheet Round 1, số trong file Excel là nguồn chính thức — thay các số chép từ ảnh dưới đây.

## 1. Bộ quyết định đã nộp Round 1 ("Phương án Chính", kho TP 1.350)

| Phòng | Ô | R0 → R1 |
|---|---|---|
| Purchasing | Vitamin C: Supplier | Seitan Vitamins → **SYI** (Truck, trade unit **IBC**, High, 4 hours, payment term 6, agreed reliability 98%) |
| Purchasing | PET: Supplier / Trade unit | Trio PET PLC → **Philyp Jones Plastics** (Middle, 1 day, 4 tuần, 98%) / Pallet → **FTL** |
| Purchasing | Orange, Mango, Pack | giữ (Miami, NO8DO, Mono) |
| SC | Vitamin C safety stock | 2 → **4** tuần (lot 4 giữ) |
| SC | PET lot size | 4 → **2** tuần |
| SC | Orange lot size | 4 → **2** tuần |
| SC | Pack safety stock | 2 → **3** tuần |
| SC | SS thành phẩm Mango 1L, Orange PET, Mango PET | 3 → **2,5** tuần (interval 10 giữ) |
| SC | C-power 1L/PET, Orange 1L, frozen | giữ (SS 3, interval 10, frozen 3) |
| Ops | Solve breakdowns training / PM / SMED | **Yes / Minimal / Yes** |
| Ops | Kho NL: pallet locations / FTE | 900 → **800** / 5 → **3** |
| Ops | Kho TP: pallet locations / FTE | 1.500 → **1.350** / 4 → **3** |
| Ops | RM inspection, số ca, increase speed, máy | giữ (tắt, 2 ca, No, Fruitmix MQ, Swiss Fill 2) |
| Sales | Shortage rule (ord.mgmt) | Proportional → **Customer priority**: F&G > LAND Market > Dominick's |
| Sales | Điều khoản hợp đồng | giữ R0 (mentor: chưa đổi điều khoản Sales) |

Model cho bộ này: ROI **4,29%** (thận trọng 3,01%).

## 2. Kết quả thật Round 1 (game, chép từ ảnh)

- ROI **5,04%** (bảng xếp hạng; dashboard hiện 5,0%), hạng **14**. Top: 8,01%; hạng 2–5: 7,98 / 7,44 / 6,98 / 6,74%.
- Hạng điểm phòng (không tính vào ROI): Sales 44, Operations 18, Purchasing 91 (CI trung bình cao do SYI 1,052 & Philyp 1,024), Supply Chain 60.
- Nhận xét game: "company is making a good profit"; "production plan adherence on the Swiss Fill 2 is low"; obsolete cao ở Orange 1L, C-power 1L, Orange/C-power PET; "Pack 1 liter has a high level of stock"; availability components cao.
- Sales > product customer (Round 1): **Demand per week trùng nhu cầu R0** (67.394 / 11.361 / 42.162 / 118.084 / 17.741 / 51.040) → nhu cầu R1 giống R0.

| KPI dashboard | R0 | model R1 | game R1 |
|---|---|---|---|
| ROI | −7,68% | 4,29% | 5,04% |
| Gross margin (customer) | 903.148 | 1.256.569 | 1.335.030 |
| Service level outbound order lines | 92,0% | 95,0% | 96,5% |
| Production plan adherence | 78,7% | 92,6% | 89,6% |
| Obsolete products | 8,1% | 4,8% | 7,4% |
| Cube utilization kho NL / kho TP | 93,4 / 70,7% | 80,4 / 72,5% | 86,8 / 80,4% |
| Stock components / products (weeks) | 4,4 / 3,2 | 3,6 / 2,9 | 3,8 / 3,3 |
| Availability components | 99,4% | 100,0% | 99,8% |
| Raw material costs | 39,5% | 33,2% | 32,5% |
| Delivery reliability suppliers | 92,1% | 95,4% | 96,3% |
| Rejection components | 2,9% | 2,7% | 2,1% |

SL theo SKU (dòng tổng, Sales > product customer, pieces / order lines): Orange 1L 96,1/95,7; C-power 1L 96,7/95,7; Mango 1L 97,6/97,1; Orange PET 98,3/98,1; C-power PET 95,6/94,4; Mango PET 97,9/97,1.

## 3. Dựng ngược P&L Round 1 (suy ra)

| Dòng | model | suy ra | Cách |
|---|---|---|---|
| Realized revenue | 2.580.589 | 2.629.000 – 2.643.000 | PV ÷ 32,5%, hoặc contracted 2.628.963 với penalty 0 → **penalty ≈ 0** |
| Purchase value | 857.536 | 853.000 – 857.500 | 32,5% × revenue |
| COGS / Production costs | 1.324.020 / 466.483 | 1.294–1.308k / 438–450k | revenue − GM; COGS − PV |
| Stock | 280.951 | 304.000 – 313.000 | theo số tuần tồn game |
| Investment | 4.006.249 | 4.037.000 – 4.047.000 | Fixed + Machines chắc chắn |
| Operating profit | 171.792 | 203.300 – 204.200 | 5,04% × Investment |
| Indirect cost | 1.084.777 | ≈ 1.131.000 (+€46k) | GM − OP |

+€46k indirect: tách được ≈ €25k (scrap +10,9k nếu ∝ obsolete %, overflow TP +6,7k, overflow NL +5,5k, lãi tồn +2,1k); **≈ €21k chưa giải thích** (thời vụ kho, Energy/Water/Other đang giữ R0, phân phối, phí đơn) → cần tab Finance R1.

## 4. Phát hiện cốt lõi (giả thuyết mạnh): tồn thực tế bám theo plan adherence

Tồn TP lý thuyết = SS + nửa chu kỳ (gia quyền giá trị/tuần 6 SKU, tab 7):

| | lý thuyết | thực tế | thực ÷ lý thuyết | plan adherence |
|---|---|---|---|---|
| R0 (game) | 4,00 | 3,18 | 0,795 | 0,787 |
| R1 (game) | 3,69 | 3,3 ± 0,05 | 0,880 – 0,907 | 0,896 |
| R1 (model) | 3,69 | 2,93 | 0,792 (cố định theo R0) | 0,926 |
| R-2 (nếu cùng quyết định R0) | 4,00 | 3,27 | 0,818 | 0,783 |

Model neo cứng tỷ lệ 0,795 → thiếu tồn TP, cube kho TP, obsolete (3 SKU SS 3 + chu kỳ 2 chạm trần 5 tuần), SL. Cùng cơ chế ở kho NL (+8%).
**Nhiễu game:** R-2 và R0 nhiều khả năng cùng quyết định (changeover 12,1 = 12,1 giờ; lô trộn 11.015 / 11.022 L) nhưng ROI −6,67% vs −7,68% → mục tiêu sai số model ≲ 0,5 điểm ROI, không thể khớp tuyệt đối.

## 5. Kế hoạch sửa model (chưa làm — chờ dữ liệu R1 và lệnh người dùng)

| # | Sửa | Ở đâu | Dữ liệu cần |
|---|---|---|---|
| A (ưu tiên 1) | Tỷ lệ tồn thực ÷ lý thuyết = tỷ lệ R0 × (adherence ÷ adherence R0)^β; thêm `COEFFS.stockRealizationAdherenceExp` (2 điểm cho β ≈ 1: 0,795 × 0,896/0,787 = 0,905) | `ops.ts` (rmTheory/fgTheory × hệ số tab 11), `calibration.ts` | SC component/product R1 |
| B | Obsolete theo SS thực (SS × tỷ lệ A), hiệu chỉnh lại σ / `obsoleteAgeSpreadScale` | `supplyChain.ts` (C2) | obsolete từng SKU R1 |
| C | SL: phụ thuộc tồn TP nhiều hơn, adherence ít hơn → hiệu chỉnh độ dốc 0,974 và `capacitySlopeB/C`; penalty ≈ 0 + thưởng khi vượt SL hứa | `supplyChain.ts`, `sales.ts` | SL từng SKU/khách, penalty R1 |
| D | Plan adherence bị đánh giá cao 3 điểm: hiệu chỉnh `adherenceK`, `EST.qualityBreakdownMult`, tác dụng Training/PM | `ops.ts`, `calibration.ts` | giờ run/changeover/breakdown/unused/overtime R1 |
| E | NCC mới: Philyp suy ra reliability ≈ 96,3–96,6% (giả định 93,3%), rejection ≈ 3,7–4,0% (giả định 5,9%) → nhập ô "thực tế", về lâu dài rejection theo quality | `purchasing.ts` | Purchasing > supplier R1 |
| F | Chi phí sản xuất thấp hơn model €16–28k; €21k indirect chưa giải thích; CI thật SYI/Philyp | `finance.ts`, `purchasing.ts` | Finance R1 |

Lộ trình: (1) người dùng upload sheet R1 (prompt trích xuất: `notes/prompts_trich_xuat_R1.md`) → (2) `build-data.ts` đọc tab R1_* → (3) `tests/backtest-r1.test.ts` (ngưỡng: ROI ±0,5 điểm, GM ±2%, SL ±1, adherence ±2, cube ±3, tuần tồn ±0,2, obsolete ±1) → (4) sửa A → F, hệ số ghi nguồn R0 + R1, trạng thái "đã xác minh" → (5) cho neo theo round gần nhất → (6, tùy chọn, lớn) mô phỏng theo ngày Monte Carlo.

## 6. Vì sao đội khác đạt ~8% (quét model, 26/11)

- Quét các ô model tính được (không đổi điều khoản Sales, không Tank, không Heavy, tuổi tồn ≤ 5 tuần, C-power PET interval ≥ 8): ROI model **7,3% (không đổi máy, không đổi NCC) – 7,9% (đổi được máy)**, so với 4,29% đã nộp. Model đang thấp hơn game ~0,75 điểm → tương ứng ~8% thật.
- Bậc thang cộng dồn (model): PET lot 0,5 + SS 1 → RM pallet 550 (4,87%) → Increase speed (5,32%) → RM FTE 2 (5,59%) → Orange 1L interval 5 (5,75%) → Orange lot 1/SS 3 (5,81%) → PM Extensive (5,87%) → kho TP 1.250 (6,07%). Sau phát hiện mục 4: không cắt kho TP dưới ~1.250 (tồn thật cao hơn model ~11%).
- Tham khảo (CI / chất lượng chưa mô hình): Orange Tank → IBC +0,56 điểm; Orange → Medina (quality Middle) +0,1.
- **Đòn bẩy lớn nhất chưa mô hình: CI khách.** +1% CI cả 3 khách ≈ +0,65 điểm ROI (+2% → 7,16%, +3% → 7,81% từ mức 6,07%). Hạng Sales 44 → đội top nhiều khả năng lấy doanh thu ở đây (SL thật 96,5% cho phép hứa SL cao hơn).

## 7. Round 2

- Game hiện sẵn quyết định Round 1 làm điểm xuất phát; có thêm mục **KPI** mới — nội dung CHƯA biết (chờ ảnh chụp từ người dùng, không đoán).
- Khi lập phương án R2: dùng bậc thang mục 6 làm gốc, cộng biên an toàn theo mục 4, ghi lại CI game hiển thị khi đàm phán thử.
