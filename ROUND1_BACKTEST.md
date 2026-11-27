# ROUND1_BACKTEST — Đối chiếu model với kết quả thật Round 1 (27/11/2026)

> Nguồn số game: `data/TFC_Round1.xlsx` (tab `R1_*`, người dùng trích từ game). Số model: chạy `simulate()` với đúng bộ quyết định Round 1 (tab `R1_*_decisions`).
> Hai bản chạy model:
> - **A (trước khi nộp)**: như lúc lập phương án — Philyp CI 1,024, reliability/rejection NCC mới là ước lượng (93,3% / 5,9%).
> - **B (biết trước điều kiện NCC)**: nhập đúng CI, reliability, rejection thật của Philyp và SYI → phần lệch còn lại là lỗi **cấu trúc** model, không phải do đoán sai NCC.
> Nhãn: **game** = số trong file; **suy ra** = tính ngược từ số game (có sai số); **chưa kiểm được** = R1 không có dữ liệu để thử.

## 0. Kết luận nhanh

| | R0 | model A | model B | game R1 |
|---|---|---|---|---|
| ROI | −7,68% | 4,29% | 4,44% | **5,04%** |
| Operating profit | −306.503 | 171.792 | 177.906 | **200.194** |
| Investment | 3.989.513 | 4.006.249 | 4.007.320 | **3.971.406** |

Model **thấp hơn game 0,60 điểm ROI** (bản B). Tách ra:

| Nguyên nhân | € OP | điểm ROI |
|---|---|---|
| Doanh thu: game **thưởng** +17.977 khi SL vượt mức hứa, model **phạt** −48.369 | +66.346 | +1,66 |
| Indirect cost model thiếu (scrap, overflow NL, thời vụ kho NL…) | −35.942 | −0,90 |
| Purchase value model thiếu (chủ yếu phí vận chuyển PET FTL) | −7.536 | −0,19 |
| Production costs | −581 | −0,01 |
| Investment model cao hơn (Payment terms tính AR sai cơ sở) | Inv −35.914 | +0,05 |

→ Model **đúng hướng ở mọi phòng**, nhưng có 2 lỗi cấu trúc lớn (thưởng SL, cơ sở phải thu) và 3 chỗ hiệu chỉnh lệch (tồn thực tế, obsolete, hỏng máy/SMED). Chi tiết dưới.

## 1. KPI dashboard

| KPI | R0 | model A | model B | game | Đánh giá |
|---|---|---|---|---|---|
| Gross margin (customer) | 903.148 | 1.256.569 | 1.262.800 | 1.335.030 | thấp 72k: thưởng/phạt 66k + cách xếp SMED/training 14k |
| Service level outbound order lines | 91,95% | 95,0% | 95,0% | 96,52% | thấp 1,5 điểm |
| Production plan adherence | 78,72% | 92,6% | 92,6% | 89,59% | cao 3 điểm |
| Obsolete products | 8,14% | 4,8% | 4,8% | 7,44% | **thấp 2,6 điểm** |
| Cube utilization kho NL | 93,39% | 80,4% | 81,0% | 86,77% | thấp 6 điểm |
| Cube utilization kho TP | 70,74% | 72,5% | 72,5% | 80,39% | **thấp 8 điểm** |
| Stock components (weeks) | 4,36 | 3,6 | 3,59 | 3,77 | thấp 0,2 |
| Stock products (weeks) | 3,18 | 2,9 | 2,93 | 3,26 | thấp 0,3 |
| Availability components | 99,41% | 100% | 100% | 99,8% | khớp |
| Raw material costs | 39,53% | 33,2% | 32,97% | 32,45% | khớp (lệch do mẫu số doanh thu) |
| Delivery reliability suppliers | 92,08% | 95,4% | 96,29% | 96,29% | A thấp 0,9 (đoán NCC mới quá bi quan) |
| Rejection components | 2,94% | 2,7% | 2,08% | 2,11% | A cao 0,6 (như trên) |

## 2. Finance — từng dòng P&L (model B vs game)

| Dòng | R0 | model B | game | lệch | Nguồn model | Đánh giá |
|---|---|---|---|---|---|---|
| Contracted sales (3 khách) | 2.628.963 | 2.628.963 | 2.628.963 | 0 | estimate | ✅ (nhu cầu R1 = R0) |
| Penalty/bonus F&G | −252.766 | −48.369 | **+9.200** | −57.569 | estimate | ❌ xem 6.1 |
| Penalty/bonus LAND | −46.360 | 0 | **+4.075** | −4.075 | estimate | ❌ |
| Penalty/bonus Dominick's | −23.582 | 0 | **+4.702** | −4.702 | estimate | ❌ |
| Mono (Pack) | 110.692 | 110.692 | 110.598 | +94 | model | ✅ |
| Philyp (PET) | — | 248.125 | 260.842 | −12.717 | model | ❌ phí vận chuyển, xem 4.2 |
| Miami (Orange) | 409.042 | 409.757 | 405.783 | +3.974 | model | ⚠️ +1% lượng |
| NO8DO (Mango) | 81.658 | 81.658 | 80.263 | +1.395 | model | ⚠️ +1,7% lượng |
| SYI (Vitamin C) | — | 1.078 | 1.360 | −282 | model | nhỏ |
| Bottling fixed / permanent | 249.000 | 249.000 | 249.000 | 0 | rule | ✅ |
| Flexible manpower (bottling) | 66.670 | 27.664 | 28.704 | −1.040 | estimate | ✅ (−3,6%) |
| Mixer fixed | 31.250 | 31.250 | 31.250 | 0 | rule | ✅ |
| Mixer variable | 144.569 | 144.569 | 144.110 | +459 | model | ✅ |
| SMED + Solve breakdowns training | 0 | 14.000 | 14.000 | 0 | rule/estimate | ✅ số đúng; ⚠️ **game xếp vào Indirect**, model xếp vào Production costs |
| Energy | 150.904 | 150.904 (giữ R0) | 150.178 | +726 | r0 | ✅ giữ R0 chấp nhận được |
| Water | 26.779 | 26.779 | 26.777 | +2 | r0 | ✅ |
| Other | 146.619 | 146.619 | 146.619 | 0 | r0 | ✅ |
| Interest components | 11.181 | 9.194 | 9.179 | +15 | model | ✅ |
| Interest products | 12.926 | 11.899 | 12.330 | −431 | model | ⚠️ theo tồn TP thấp |
| Pallet locations NL / TP | 90.000 / 150.000 | 80.000 / 135.000 | 80.000 / 135.000 | 0 | rule | ✅ |
| Overflow kho NL | 35.423 | 4.406 | **15.694** | −11.288 | model | ❌ xem 3.3 |
| Outsourcing tank yard | 25.282 | 19.846 | 21.228 | −1.382 | estimate | ⚠️ −6,5% |
| Overflow kho TP | 607 | 1.886 | 2.970 | −1.084 | model | ⚠️ theo tồn TP thấp |
| Costs of scrap | 40.203 | 25.864 | **37.242** | −11.378 | estimate | ❌ xem 5.3 |
| Inbound permanent / Outbound permanent | 100.000 / 80.000 | 60.000 / 60.000 | 60.000 / 60.000 | 0 | rule | ✅ |
| Inbound flexible manpower | 6.753 | 8.605 | **17.809** | −9.204 | model | ❌ xem 3.3 |
| Outbound flexible manpower | 3.725 | 14.130 | 14.836 | −706 | model | ✅ (−4,8%) |
| Inbound order lines / orders | 271 / 1.353 | 356 / 1.778 | 351 / 1.757 | +5 / +21 | estimate | ✅ |
| Contracted suppliers, Outbound order lines/orders | 100.000 / 927 / 7.167 | giữ R0 | giữ R0 | 0 | r0 | ✅ |
| Distribution costs | 192.114 | 192.114 | 192.114 | 0 | estimate | ✅ đúng tuyệt đối |
| Interest | 27.419 | 27.419 (giữ R0) | 28.658 | −1.239 | r0 | ⚠️ +4,5%, chưa rõ cơ sở |
| Fixed / Machines | 2.500.000 / 802.500 | = | = | 0 | rule | ✅ |
| Stock | 321.424 | 281.232 | 286.794 | −5.562 | model | ⚠️ theo tồn TP thấp |
| **Payment terms** | 365.589 | 423.588 | **382.112** | +41.476 | estimate | ❌ xem 6.3 |

## 3. Operations

### 3.1 Dây chuyền Swiss Fill 2 (giờ/tuần)

| | R0 game | model B | game R1 | Đánh giá |
|---|---|---|---|---|
| Run | 62,6 | 62,6 | 62,2 | ✅ |
| Changeover | 12,1 | 8,47 | 9,4 | ⚠️ SMED thực ≈ −22% (9,4 ÷ 12,1; số mẻ vẫn 13/SKU như R0), luật ghi −30% |
| Breakdown | 10,8 | 4,11 | 4,7 | ⚠️ model giảm 62%, game giảm 56% |
| Unused | 3,9 | 7,69 | 7,7 | ✅ |
| Overtime | 9,4 | 3,90 | 4,0 | ✅ |
| Plan adherence | 78,7% | 92,6% | 89,6% | ⚠️ cao 3 điểm |
| Start-up productivity loss | 8.435 | 8.435 | 7.812 | ⚠️ model giữ R0; game giảm 7,4% vì PET rẻ hơn (SKU PET −8…−11%/mẻ, 1L −3…−5%) |
| Máy trộn: cleaning / lô TB | 14,5% / 11.022 L | 14,5% / 11.022 | 14,6% / 11.013 | ✅ |

**Giả định hỏng máy** (`EST.qualityBreakdownMult` Poor 1,6 / Middle 1,25; PM Minimal −30%; training −40% thời gian sửa): nếu PM và training đúng như Info Center (0,7 × 0,6 = 0,42), game R1 suy ra đổi PET Poor → Middle chỉ làm thay đổi hỏng máy khoảng **+4%** (gần như không giảm), trong khi model cho −9%. Có 3 ẩn số và 1 phương trình, nên **không tách được** cái nào lệch; tổng hiệu ứng model mạnh hơn game ~13%.

**Plan adherence**: model lệch +3 điểm, một phần do breakdown thấp (4,1 so với 4,7). Hai điểm R0/R1 không khớp cùng một công thức tuyến tính theo (breakdown + overtime) → hệ số `adherenceK` hiệu chỉnh trên 1 điểm R0 chưa đủ.

### 3.2 Kho TP (DC Netherlands)

| | R0 game | model B | game R1 |
|---|---|---|---|
| Usage (pallet TB) | 1.061 | 979 | **1.085** |
| Cube utilization | 70,7% | 72,5% | 80,4% |
| Overflow | 0,1% | 0,0% | 0,7% |
| Giờ/tuần | 100 | 101 | 102 ✅ |
| Flex FTE | 0,1 | — | 0,3 |

Giờ công đúng; **tồn TP thấp 10%** → xem 5.1.

### 3.3 Kho NL

| | R0 game | model B | game R1 |
|---|---|---|---|
| Usage (pallet TB) | 840 | 647 | **694** |
| Cube utilization | 93,4% | 81,0% | 86,8% |
| Overflow | 10,8% | 2,0% | **5,8%** |
| Order lines / tuần | 1,0 | 1,37 | 1,4 ✅ |
| Pallet nhận / tuần | 212,4 | 207,9 | 204,7 ✅ |
| Giờ/tuần | 74 | 65,6 | **74** (TB 130 ngày biểu đồ: 70,7) |
| Đỉnh giờ/ngày | 65 | 45,1 | 55,8 |
| Giờ vượt 3 FTE (24 h/ngày), cả round | — | 133 | **263** (22 ngày) |
| Thời vụ (giờ trả tiền) | — | 205 | 424 (= 17.809 ÷ €42) |
| Tank yard (tank-ngày/tuần) | 29 | 22,3 | 23 ✅ |

- Tồn NL model thấp 7% (PET và Orange: cỡ đơn game lớn hơn — PET 527.683 so với 484.810; Orange 97.846 so với 86.290).
- Giờ công: model cho giờ chuyển overflow giảm mạnh (9,1 → 1,3 h/tuần) khi overflow giảm, nhưng game giờ công **không giảm** (74 = 74) và đỉnh ngày còn cao. Model làm phẳng đỉnh quá mức → thời vụ chỉ bằng ½ game.
- Tỷ lệ "giờ thời vụ trả tiền ÷ giờ vượt" game = 424 ÷ 263 = **1,61**; model 1,54 → giả định "thời vụ năng suất thấp hơn" ✅ đúng độ lớn.

## 4. Purchasing

### 4.1 Nhà cung cấp

| NCC | | model A (đoán) | game | |
|---|---|---|---|---|
| Philyp (PET) | CI | 1,024 | 1,02 | ✅ |
| | Reliability | 93,3% | **96,4%** | ❌ đoán bi quan |
| | Rejection | 5,9% | **3,8%** | ❌ đoán bi quan |
| SYI (Vitamin C) | CI | 1,0518 | 1,0518 | ✅ |
| | Reliability | 93,3% | **98,2%** | ❌ |
| | Rejection | 1,2% | **0%** | ❌ |
| Mono / Miami / NO8DO (giữ) | Reliability | 92,3 / 97,8 / 93,7% | 92,4 / 97,8 / 93,5% | ✅ |

→ Cách đoán reliability NCC mới (theo agreed reliability, free capacity, certification) **quá bi quan 3–5 điểm**: cả 2 NCC mới đều giao gần đúng mức agreed (98%) trừ 1,6–3,4 điểm.

### 4.2 Giá & vận chuyển

| | model B | game |
|---|---|---|
| PET: giá hàng (không vận chuyển) | 168.576 | 166.768 ✅ |
| PET: phí vận chuyển (FTL) | 79.549 | **94.074** ❌ |
| PET: cỡ đơn / số đơn | 484.810 / 11,4 | 527.683 / 10,3 |
| Orange / Pack / Mango: vận chuyển | 35.761 / 4.552 / 3.314 | 35.282 / 4.548 / 3.273 ✅ |
| Lượng mua PET / Orange | 5.509.005 / 931.265 | 5.449.939 / 922.562 (model +1%) |

FTL: phí PET mỗi đơn ≈ 94.074 ÷ 10,3 − €100 = €9.033 ≈ **18 xe × €500**, cho 488,6 pallet/đơn → **≈ 27 pallet/xe (suy ra)**. Model dùng 30 pallet/xe (sheet R0) → phí FTL thấp 15%. Cần người dùng xác nhận số pallet/FTL trong game.

## 5. Supply Chain

### 5.1 Tồn TP thực tế ÷ lý thuyết — giả thuyết A **được xác nhận**

Lý thuyết = SS + ½ chu kỳ (interval 10 ngày = 2 tuần → +1).

| SKU | SS R1 | lý thuyết | tồn game R0 → R1 | thực ÷ lý thuyết R0 → R1 | adherence game R0 → R1 | (thực ÷ lt) ÷ adherence R0 / R1 |
|---|---|---|---|---|---|---|
| Orange 1L | 3 | 4 | 3,2 → 3,4 | 0,80 → 0,85 | 0,829 → 0,895 | 0,965 / 0,950 |
| C-power 1L | 3 | 4 | 2,5 → 3,2 | 0,63 → 0,80 | 0,698 → 0,895 | 0,895 / 0,894 |
| Mango 1L | 2,5 | 3,5 | 3,3 → 3,2 | 0,83 → 0,91 | 0,829 → 0,895 | 0,995 / 1,021 |
| Orange PET | 2,5 | 3,5 | 3,4 → 3,3 | 0,85 → 0,94 | 0,833 → 0,897 | 1,020 / 1,051 |
| C-power PET | 3 | 4 | 2,3 → 3,1 | 0,58 → 0,78 | 0,701 → 0,897 | 0,820 / 0,864 |
| Mango PET | 2,5 | 3,5 | 3,2 → 3,1 | 0,80 → 0,89 | 0,833 → 0,897 | 0,960 / 0,988 |

Cột cuối gần như **không đổi giữa 2 round với từng SKU** (lệch ≤ 0,04) → tồn thực ≈ lý thuyết × k_SKU × plan adherence SKU. Model đang giữ tỷ lệ R0 cố định → C-power 1L/PET (SS giữ 3) model 2,5/2,3 tuần, game 3,2/3,1 tuần.

### 5.2 Service level từng SKU (pieces / order lines)

| SKU | model B | game |
|---|---|---|
| Orange 1L | 96,6 / 95,3 | 96,1 / 95,7 |
| C-power 1L | 98,3 / 94,8 | 96,7 / 95,7 |
| Mango 1L | 98,6 / 98,2 | 97,6 / 97,1 |
| Orange PET | 99,1 / 98,6 | 98,3 / 98,1 |
| C-power PET | 98,2 / 95,2 | 95,6 / 94,4 |
| Mango PET | 98,4 / 97,4 | 97,9 / 97,1 |

Theo SKU: pieces model cao 0,5–2,6 điểm, order lines lệch ±1. Theo khách (bảng 6.2) model lại thấp 1,6–1,8 điểm → cách quy đổi SKU → khách (neo R0 từng khách) chưa đúng.

### 5.3 Obsolete

| SKU | R0 game | model B | game R1 |
|---|---|---|---|
| Orange 1L (SS 3) | 8,4% | 8,4% | 9,1% |
| C-power 1L (SS 3) | 7,1% | 7,1% | 9,0% |
| Mango 1L (SS 2,5) | 8,8% | 4,0% | 7,0% |
| Orange PET (SS 2,5) | 8,2% | 3,4% | 6,2% |
| C-power PET (SS 3) | 5,5% | 5,5% | 8,1% |
| Mango PET (SS 2,5) | 8,0% | 3,3% | 5,9% |
| **Dashboard** | 8,14% | 4,8% | **7,44%** |

- Giảm SS 0,5 tuần: model giảm obsolete **55–59%**, game chỉ giảm **20–26%** → C2 (`obsoleteAgeSpreadScale` = 2) quá nhạy.
- SKU giữ SS: game tăng theo tồn thực (5.1), model đứng yên.
- `scrapObsoleteElasticity` = 1: game scrap ÷ R0 = 0,926 trong khi giá trị obsolete/tuần ÷ R0 = 3.748 ÷ 4.421 = 0,848 → **co giãn suy ra ≈ 0,5** (1 điểm dữ liệu).

### 5.4 Tồn NL

| | Pack | PET | Orange | Mango | Vitamin C |
|---|---|---|---|---|---|
| Tuần tồn model / game | 5,31 / 5,2 | 3,15 / 3,4 | 3,27 / 3,4 | 4,4 / 4,5 | 8,4 / 7,4 |
| Availability model / game | 100 / 99,8 | 100 / 100 | 99,3 / 99,6 | 100 / 100 | 100 / 100 |
| Số đơn/round model / game | 5,7 / 5,7 | 11,4 / 10,3 | 10,8 / 9,4 | 5,3 / 5,4 | 2,4 / 4,3 |

## 6. Sales

### 6.1 Thưởng khi vượt SL — model **thiếu cơ chế**

| Khách | SL hứa | SL order lines game | vượt | thưởng game | % contracted |
|---|---|---|---|---|---|
| F&G | 95% | 95,9% | +0,9 | +9.200 | +0,71% |
| LAND | 95% | 96,7% | +1,7 | +4.075 | +0,64% |
| Dominick's | 95% | 97,4% | +2,4 | +4.702 | +0,67% |

Info Center (tab `R1_Sales_infocenter`): *"if service levels exceed expectations, the customer may offer a small bonus. The bonus is generally lower than what could have been achieved through negotiating…"*. Thưởng gần như **phẳng ~0,64–0,71%** không phụ thuộc mức vượt (0,9 → 2,4 điểm) → có thể có trần. Model: chỉ có phạt.

Phạt R0 (thiếu → % contracted): Dominick's 1,8 điểm → −3,4%; LAND 2,9 → −7,3%; F&G 3,8 → −19,5% → **lồi mạnh**, không tuyến tính (`penaltyShortfallExponent` = 1 chỉ đúng vì neo từng khách). R1 không có khách nào thiếu → **chưa kiểm được**.

### 6.2 SL theo khách (order lines)

| | R0 game | model B | game R1 |
|---|---|---|---|
| F&G | 91,2 | 94,3 | 95,9 |
| LAND | 92,1 | 95,3 | 96,7 |
| Dominick's | 93,2 | 95,6 | 97,4 |

Model thấp ~1,7 điểm cả 3 khách; F&G bị model báo **dưới 95% → phạt 48k**, game thực tế vượt → thưởng. Shortage rule "Customer priority" (F&G ưu tiên 1): F&G vẫn thấp nhất (vì mua cả 1L) → không thấy tác dụng rõ.

### 6.3 Payment terms (Investment) — cơ sở phải thu **sai**

- Game: Payment terms 365.589 → 382.112 (**+16.523**).
- Model: +57.999 = Δ phải thu +42.205 (realized revenue tăng 274k × 4 ÷ 26) + Δ phải trả +15.794.
- Nếu phải thu tính trên **contracted sales** (không đổi giữa R0 và R1) → Δ chỉ còn phần NCC ≈ +15,8k ≈ game +16,5k ✅.
- Kiểm R0: nếu phải thu = realized × 4 ÷ 26 = 354.808 thì phải trả = −10.781 (âm, vô lý); theo contracted = 404.456 → phải trả 38.867 (hợp lý).
→ **Suy ra mạnh: phải thu tính theo contracted sales** (trước phạt/thưởng).

### 6.4 Khác

- Distribution costs, pallet/tuần, order lines/tuần theo khách: = R0 ✅ (nhu cầu R1 = R0).
- Attained CI = CI × (revenue ÷ contracted) ✅ (F&G 1,0085 × 1,0071 = 1,016).
- Info Center Sales có mục **"Bonus policy"** (sales volume rebate) — không có trong decision R1 → có thể là **ô mới ở Round 2**; cần người dùng kiểm.

## 7. Bảng chấm từng giả định

| # | Giả định / hệ số | Giá trị model | Kết quả R1 | Kết luận |
|---|---|---|---|---|
| 1 | Phải thu = realized revenue ÷ 26 × payment term | — | game khớp nếu dùng contracted | ❌ **sửa** |
| 2 | Chỉ phạt, không thưởng khi vượt SL | — | thưởng ≈ +0,67% contracted | ❌ **sửa** |
| 3 | Tồn TP thực ÷ lý thuyết cố định theo R0 | 0,795 | tỷ lệ ∝ adherence từng SKU | ❌ **sửa** (giả thuyết A xác nhận) |
| 4 | `obsoleteAgeSpreadScale` | 2 | model quá nhạy với SS (−55…59% so với −20…26%) | ❌ hiệu chỉnh lại |
| 5 | `scrapObsoleteElasticity` | 1 | suy ra ≈ 0,5 | ⚠️ hiệu chỉnh lại |
| 6 | Reliability/rejection NCC mới (đoán) | 93,3% / 5,9% | 96,4–98,2% / 0–3,8% | ⚠️ đoán quá bi quan; luôn nhập số game khi có |
| 7 | Pallet/FTL | 30 | suy ra ≈ 27 | ⚠️ hỏi người dùng |
| 8 | SMED −30% changeover | 0,7 | 0,777 | ⚠️ tác dụng thật ≈ −22% |
| 9 | `qualityBreakdownMult`, PM −30%, training −40% | tổng 0,38 | tổng 0,435 | ⚠️ model mạnh hơn ~13% |
| 10 | `adherenceK` (hiệu chỉnh 1 điểm R0) | — | +3 điểm | ⚠️ cần 2 điểm R0 + R1 |
| 11 | Start-up loss giữ R0 | 8.435 | 7.812 (theo giá NL) | ⚠️ nên nhân theo giá NL/lít |
| 12 | Giờ kho NL: giờ chuyển overflow, độ phẳng đỉnh | — | giờ thấp 11%, thời vụ ½ | ❌ hiệu chỉnh lại |
| 13 | Thời vụ năng suất thấp hơn | 1,54 | 1,61 | ✅ |
| 14 | Energy/Water/Other giữ R0 | — | lệch ≤ 0,5% | ✅ |
| 15 | Interest giữ R0 | 27.419 | 28.658 (+4,5%) | ⚠️ nhỏ, chưa rõ cơ sở |
| 16 | Distribution theo pallet giao | 192.114 | 192.114 | ✅ |
| 17 | Inbound order lines/orders theo số chuyến | 356 / 1.778 | 351 / 1.757 | ✅ |
| 18 | Flexible manpower dây chuyền | 27.664 | 28.704 | ✅ |
| 19 | Mixer (lô, cleaning, chi phí) | — | khớp | ✅ |
| 20 | Tank yard | 580 tank-ngày | 598 | ✅ (−3%) |
| 21 | Nhu cầu R1 = R0 | — | đúng từng SKU | ✅ |
| 22 | SMED/training xếp vào Production costs | — | game xếp vào Indirect | ⚠️ đổi nhóm (ROI không đổi, GM đổi 14k) |
| 23 | `penaltyShortfallExponent` = 1 | — | R1 không thiếu SL | chưa kiểm được (R0 cho thấy lồi) |
| 24 | 8 hệ số CI khách = 0 | — | R1 không đổi điều khoản | chưa kiểm được |
| 25 | `capacitySlopeB/C`, `maintenanceDisruptionWeight` | — | — | chưa kiểm được riêng |

## 8. Đề xuất sửa (chờ người dùng duyệt — CHƯA sửa code)

Xếp theo tác động lên ROI dự báo:

1. **Thưởng SL** (≈ +1,7 điểm ROI ở R1): thêm thưởng khi SL > hứa = contracted × hệ số (suy ra ≈ 0,67%, có thể có trần) — hệ số mới trong COEFFS, nguồn R1.
2. **SL theo khách** (gắn với 1): sửa quy đổi SKU → khách; SL phụ thuộc tồn TP thực (5.1).
3. **Phải thu theo contracted sales** (+0,05 điểm, nhưng quan trọng khi đổi CI/promotion).
4. **Tồn TP thực = lý thuyết × k_SKU × adherence SKU** (giả thuyết A) → kéo theo cube kho TP, overflow TP, Stock, Interest products.
5. **Obsolete**: hiệu chỉnh lại `obsoleteAgeSpreadScale` theo 2 điểm R0 + R1; `scrapObsoleteElasticity` ≈ 0,5.
6. **Kho NL**: giờ công / đỉnh ngày / overflow — hiệu chỉnh theo biểu đồ 130 ngày R1 (có trong `R1_Ops_warehousing`).
7. **Pallet/FTL** (cần người dùng xác nhận 27 hay 30).
8. Nhỏ: SMED 22%, hỏng máy, start-up loss theo giá NL, đổi nhóm SMED/training sang Indirect.

Mỗi sửa: thêm `tests/backtest-r1.test.ts` (R1 đúng trong ngưỡng) **và** giữ `tests/sheet-fidelity.test.ts` (R0 đúng từng ô).

## 9. Sau hiệu chỉnh R1 (27/11, người dùng yêu cầu "chỉnh bám sát kết quả thật")

Dữ liệu R1 đọc tự động: `scripts/build-data-r1.ts` → `src/data/round1.json` (chạy trong `npm run data`). Bộ quyết định R1 dựng lại: `src/model/round1.ts`. Kiểm tra cố định: `tests/backtest-r1.test.ts` (12 test). R0 vẫn đúng từng ô (ROI −7,68%).

### 9.1 Đã sửa (theo thứ tự tác động)

| # | Sửa | Loại | Bằng chứng R1 |
|---|---|---|---|
| 1 | **Thưởng SL**: đạt/vượt SL hứa → + contracted × `COEFFS.salesBonusRate` (0,675%) | hệ số mới, đã xác minh R1 | 3 khách +0,64…0,71%; Info Center "small bonus" |
| 2 | **SL theo khách / order lines**: mức THIẾU co giãn tỷ lệ (SKU: order lines theo pieces; khách: theo TB gia quyền SKU), thay cho cộng thẳng | cấu trúc | 6 SKU: tỷ số mức thiếu OL ÷ pieces R0→R1 lệch ≤ 0,09; khách: 95,97 / 96,31 / 97,31 so với game 95,9 / 96,7 / 97,4 |
| 3 | **Plan adherence**: gián đoạn = hỏng + **changeover** + giờ PM + overtime (k hiệu chỉnh R0); `maintenanceDisruptionWeight` 0 → 1 | cấu trúc + hệ số | chỉ (hỏng + overtime) thì R0 cần k 0,71, R1 cần 1,0; thêm changeover → 1 hệ số khớp cả hai. Game gộp giờ PM vào changeover (9,4 ≈ 12,1 × 0,7 + 1) |
| 4 | **Tồn TP thực ∝ plan adherence SKU** (giả thuyết A) | cấu trúc | bảng 5.1; cube kho TP 79,8% vs 80,4% |
| 5 | **Obsolete × (adherence ÷ baseline)** và `obsoleteAgeSpreadScale` 2 → 4 | cấu trúc + hệ số | RMSE 6 SKU 0,43 điểm (3 → 0,83; 5 → 0,55) |
| 6 | **Phải thu theo contracted sales** | cấu trúc | Payment terms 381.384 vs 382.112 |
| 7 | **Cỡ đơn NL = lot × lượng mua + phần cộng thêm cố định (tuần nhu cầu)** thay cho × tỷ lệ | cấu trúc | phần cộng thêm R0 → R1: PET 0,66 → 0,62; Orange 0,88 → 0,78; Pack 0,68 → 0,73; Mango 0,90 → 0,85 tuần. Cỡ đơn PET 517k vs 528k |
| 8 | **Dao động kho NL theo ngày ∝ (cỡ đơn mới ÷ R0)^0,5** (`rmLotDispersionExp`, trước = 1) | hệ số mới, đã xác minh R1 | overflow kho NL 5,7% vs 5,8% (mũ 1: 2,7%; mũ 0: 10,0%) |
| 9 | **Định giá lại tồn theo giá mua mới** (NL: giá mua; TP: giá vốn + Δ giá NL; start-up loss theo chi phí vật tư) | cấu trúc | Stock 290k vs 287k; Interest components 0,82 × R0 như game; start-up loss 7.783 vs 7.812 |
| 10 | **Vận chuyển Tank tính theo phần xe bồn** (không làm tròn lên) | cấu trúc | Miami: lot 4 → 2 mà phí gần như không đổi |
| 11 | **Reliability NCC mới = cam kết − TRUNG VỊ chênh lệch R0** (trước: trung bình) | cấu trúc | trung bình 4,7 bị Trio/Seitan kéo; Philyp thật 96,4%, SYI 98,2% |
| 12 | SMED / Increase speed / Training xếp vào **Indirect** (như game), không vào Production costs | trình bày | ROI không đổi; Gross margin đúng nhóm |

### 9.2 Kết quả

| | model trước | model sau (đoán NCC như lúc nộp) | model sau (nhập số NCC thật) | game |
|---|---|---|---|---|
| ROI | 4,29% | **5,12%** | 5,36% | 5,04% |
| Realized revenue | 2.580.589 | — | 2.646.709 | 2.646.940 |
| Investment | 4.006.249 | — | 3.973.142 | 3.971.406 |
| SL outbound order lines | 95,0% | — | 96,41% | 96,52% |
| Plan adherence | 92,6% | — | 90,2% | 89,6% |
| Obsolete | 4,8% | — | 7,0% | 7,4% |
| Cube kho TP / NL | 72,5 / 80,4% | — | 79,8 / 82,8% | 80,4 / 86,8% |
| Overflow kho NL (€) | 4.406 | — | 14.360 | 15.694 |

### 9.3 Còn lệch (chưa sửa — cần dữ liệu / người dùng quyết)

| Chỗ | Lệch (model − game) | Vì sao chưa sửa |
|---|---|---|
| Phí vận chuyển PET FTL | −12.799 | Sheet R0 ghi **30 pallet/xe**; số R1 khớp **≈ 27 pallet/xe** (2 cách tính độc lập: phí/đơn và cỡ đơn/xe). Đổi số sheet → cần người dùng xác nhận |
| Hỏng máy | 4,1 vs 4,7 giờ | Muốn khớp phải cho PET Middle hỏng nhiều hơn Poor (trái Info Center) → giữ nguyên, báo |
| Thời vụ kho NL | 13.924 vs 17.809 | Giờ TB model 66 vs 74 (biểu đồ ngày game TB 70,7) |
| SL pieces SKU C-power | cao 1,4–2,3 điểm | Khách vẫn khớp; độ dốc theo availability Vitamin C có thể cao hơn thật |
| Overflow kho TP | 5.524 vs 2.970 | Nhỏ |
| Energy / Interest (giữ R0) | +726 / −1.239 | Nhỏ |
