# ASSUMPTIONS — Giả định & hiệu chỉnh của TFC Simulator

Phiên bản: **M1 (Ops) + M1.5 (đồng bộ nhóm)**. Mọi số R0 lấy từ `data/TFC_Round0.xlsx` qua `npm run data`.

Nhãn trên giao diện:
- **ước lượng**: giả định không có trong luật game.
- **hiệu chỉnh R0**: chỉ số dùng để tính hệ số, nên khớp R0 do cấu tạo. Không phải bằng chứng là mô hình đúng.
- **số R0**: dòng giữ nguyên số Round 0, chưa mô hình hóa.
- **R0 suy ra**: số R0 dựng lại từ tab 11, game không in trực tiếp.

Tab "Giả định & R0" trong app cho phép chỉnh các giả định ước lượng. Chỉnh ở đó chỉ có tác dụng trên máy của người chỉnh.

## 0. Ghi chú dữ liệu

- File gốc tên `TFC Round Trial.xlsx`, đã `git mv` thành `data/TFC_Round0.xlsx`.
- Tab luật có tên `Luật for ops and others phòng b`, không phải `8_Luật game`, vì Excel giới hạn tên tab 31 ký tự.
- Cột "Start-up loss/mẻ (€)" ở tab 7 thực ra là **tổng cả round** của từng SKU: cộng 6 SKU ra 8.434.
- Tuần 0 / ngày 0 (tab 12 / tab 11) trùng tuần 1 / ngày 1, nên bị bỏ.
- Breakdown dây chuyền: tab 5 ghi 10,8, tab 10 ghi 11,0. App dùng 10,8.
- **"Tồn (tuần)" ở tab 7 và tab 11 tính theo nhu cầu dự báo của các tuần tới**, không theo nhu cầu trung bình:
  - Nếu quy ra pallet bằng nhu cầu trung bình: kho TP không ngày nào vượt 1.500 chỗ (đỉnh 1.362). Không giải thích được overflow 0,1% của game.
  - Nếu quy bằng proxy "trung bình nhu cầu thực tuần này và tuần sau" (tab 12): ra lại phí overflow của **cả hai kho** (kho NL €37.676 so với €35.423; kho TP €555 so với €607).
  - App dùng proxy này. Proxy là ước lượng, vì dự báo thật của game không có trong file.

## 1. Luật đã biết (dùng như chắc chắn)

Lấy từ CLAUDE.md mục 6 và tab 5_Operations "Định mức", nằm trong `src/model/rules.ts`. `tests/rules.test.ts` đối chiếu từng con số với chuỗi định mức trong Excel.

Tab luật **không nêu giới hạn số giờ thời vụ** và **không định nghĩa "cube utilization"**.

## 2. Công thức suy ra từ dữ liệu R0 (dự báo độc lập, không hiệu chỉnh)

| Chỉ số | Công thức | R0 thật → mô hình |
|---|---|---|
| Run time | lít cần đóng ÷ tốc độ + số changeover × start-up loss × 1 giờ | 62,6 → 62,7 |
| Start-up loss € | Σ SKU: số mẻ × (start-up loss × tốc độ × 1 giờ ÷ lít/đv) × giá vốn/đv | 8.435 → 8.442 |
| Cleaning máy trộn | vệ sinh 1 lần mỗi lần đổi SKU; tỷ lệ = vệ sinh ÷ (trộn + vệ sinh) | 14,5% → 14,6% |
| Lô trung bình | mỗi mẻ SKU chia thành ⌈lít ÷ mẻ tối đa⌉ lô, lô ≥ mẻ tối thiểu | 11.022 → 11.058 L |
| Mixer variable cost | (giờ trộn + vệ sinh) × €/giờ | 144.569 → 143.910 |
| Giờ kho NL (TB) | 4 giờ/ngày + nhận hàng + cấp sản xuất + chuyển overflow | 74 → 71,9 giờ/tuần |
| Giờ kho TP (TB) | 4 giờ/ngày + nhập từ sản xuất + soạn hàng + hủy obsolete | 100 → 98,6 giờ/tuần |
| Tồn NL lý thuyết | SS × dùng/tuần + ½ cỡ đơn (PET R0: 4,20 tuần = đúng số tab 7) | — |
| Tank yard TB | tank theo ngày (làm tròn lên) | 6 → 5,97 tank |

## 3. Dao động theo ngày: replay tab 11 (thay cho lịch đều trước đây)

Bản trước mô phỏng lịch đều, không ngẫu nhiên, nên đỉnh tải và số ngày vượt lệch nhiều so với game. Bản này:

- **Tồn theo ngày** của từng NL/SKU = mức TB mô hình + (tồn R0 ngày đó − TB R0) × (cỡ lô mới ÷ cỡ lô R0).
  - Mức TB mô hình = tồn lý thuyết × (TB tab 11 ÷ lý thuyết R0).
  - Cỡ lô: NL = cỡ đơn, TP = cỡ mẻ (∝ production interval).
- **Giờ công theo ngày** = 4 giờ cố định + giờ biến đổi TB mô hình + dao động R0 × a.
  - a = Σ (phần giờ mô hình × hệ số hình dạng) ÷ Σ phần giờ baseline.
  - Hệ số hình dạng: nhận hàng ∝ cỡ lô NL (pallet) × (intake R0 ÷ intake)^0,5 <sup>ước lượng</sup>; nhập TP / cấp NL ∝ cỡ mẻ; các phần khác = 1.
- **Thời vụ** = Σ ngày max(0, giờ cần − FTE × 8) × €42 × **hệ số năng suất thời vụ 1,30**:
  - Hệ số lấy từ dây chuyền: 66.670 ÷ (9,4 giờ × 26 × 5 × €42).
  - Kho TP xác nhận độc lập: 68,1 giờ vượt (tab 11) × €42 × 1,30 = €3.718 so với P&L €3.725.
  - Kho NL ra €5.848 so với €6.753 (−13%).
- Giới hạn: khi đổi production interval hay lot size, **biên độ** dao động co giãn nhưng **nhịp** vẫn theo lịch R0 (ví dụ chu kỳ 10 ngày).

Vì vậy đỉnh pallet, số ngày vượt sức chứa, đỉnh giờ và số ngày vượt giờ cố định ở baseline **khớp R0 gần như do cấu tạo**, và được gắn nhãn hiệu chỉnh. Kiểm chứng độc lập là phí overflow và chi phí thời vụ (so với P&L, không dùng để hiệu chỉnh).

## 4. Utilization và overflow (trả lời câu hỏi "70,7% mà vẫn overflow")

- Tab luật và tab Analysis không định nghĩa "cube utilization". Về số liệu, ở cả hai kho: utilization = usage ÷ capacity (840/900 = 93,3%; 1.061/1.500 = 70,7%). Tức là **trung bình**.
- Overflow tính theo **pallet từng ngày**. Ngày đỉnh vượt sức chứa thì tràn, dù trung bình thấp. Hai việc này không mâu thuẫn: kho TP trung bình ~1.000 pallet nhưng có 4 ngày vượt 1.500 (đỉnh ~1.608).
- Mô hình: utilization = pallet TB theo ngày ÷ capacity; overflow % = pallet TB ở overflow ÷ pallet TB.
- **Còn lệch:** "usage" game in ra cao hơn TB dựng từ tab 11 khoảng 5% ở cả hai kho (840 so với 799; 1.061 so với 1.003). Có thể do pallet lẻ chiếm trọn 1 chỗ, hoặc dự báo thật khác proxy. Chưa rõ nên **không hiệu chỉnh**. Kết quả: utilization mô hình thấp hơn: kho NL 88,8% (−4,6 điểm), kho TP 66,9% (−3,8 điểm).
- Bỏ nhãn "hiệu chỉnh" ở utilization kho TP. Bản trước khớp 70,6% vì lấy tồn từ tab 7; giờ chỉ số này là kiểm chứng độc lập.

## 5. Hệ số hiệu chỉnh (tự tính trong `src/model/calibration.ts`)

| Hệ số | Giá trị | Cách tính | Khớp do cấu tạo |
|---|---|---|---|
| Sản lượng / nhu cầu | 1,0935 | Bao bì tiêu thụ ÷ nhu cầu 6 SKU | — |
| Cỡ đơn NL / (lot × mua/tuần) | 1,10–1,38 | Cỡ đơn R0 ÷ (4 tuần × mua/tuần) | — |
| Dao động theo ngày | replay tab 11 | Mục 3 | Đỉnh pallet, ngày vượt sức chứa, đỉnh giờ, ngày vượt giờ cố định |
| Tỷ lệ changeover tính như size changeover | 100% | 12,1 ÷ 3 lần = 4,03 giờ ≈ size 4 giờ | Changeover |
| Giờ hỏng / giờ chạy | 0,1725 | 10,8 ÷ 62,6 | Breakdown |
| CV giờ tải tuần | 18,4% | chọn để unused = 3,9 (overtime suy ra 9,4) | Unused, Overtime |
| Độ nhạy plan adherence | 0,706 | adherence = [1 − k × (breakdown + overtime) ÷ (giờ ca + overtime)] × availability NL | Plan adherence |
| Năng suất thời vụ | 1,30 | Mục 3 | Flexible manpower (bottling) |

## 6. Giả định ước lượng (`src/model/assumptions.ts`, chỉnh được trên giao diện)

| Giả định | Mặc định | Vì sao |
|---|---|---|
| Hỏng máy theo chất lượng bao bì | High ×1 · Middle ×1,25 · Poor ×1,6 (trung bình theo lít Pack/PET) | Luật chỉ nói "Poor gây hỏng". **Nguồn của PET 10,8 → 10,0 giờ khi bật inspection:** PET chiếm ~32% số lít; phần dư Poor (0,6) giảm 50% → hệ số chất lượng 1,190 → 1,095 (×0,92) |
| RM inspection giảm phần hỏng do bao bì kém | 50% | Luật không cho độ lớn |
| Tolerance dây chuyền | Narrow ×1,25 · Middle ×1 · Wide ×0,8 | Luật chỉ gợi ý |
| Intake time | Chỉ dàn đỉnh giờ nhận hàng (mũ 0,5). **Tác động lên component availability chưa mô hình** (có cảnh báo trên ô) | Sẽ làm ở M2 |
| Giới hạn thời vụ | Không giới hạn. Cảnh báo khi giờ vượt > 50% tổng giờ công kho | Luật không nêu giới hạn. Với 0 FTE, mô hình tính toàn bộ bằng thời vụ (€42 × 1,30), nên 0 FTE ≈ 5 FTE về chi phí và tối ưu là 2 FTE kho NL. Kết quả có thể quá lạc quan |
| Gợi ý số pallet location | Hai số: (a) đỉnh mô hình + 10% biên; (b) số chỗ tối ưu theo chi phí (€100/chỗ/round so với €3/pallet/ngày). Nhãn "ước lượng – có thể quá lạc quan" | Đỉnh thật phụ thuộc nhu cầu ngẫu nhiên. Chưa tính giờ chuyển overflow. **Gợi ý cũ "kho TP thừa ~357 chỗ ≈ €35.653" đã bỏ:** đỉnh mới ~1.608 > 1.500, tức kho TP không thừa ở ngày đỉnh |
| Drum/IBC ra pallet | 4 drum = 1 pallet · 1 IBC = 1 pallet · tank → tank yard | Không có quy đổi |
| Chuyển overflow | 6 phút cho mỗi pallet vào overflow | "ra/vào" chưa rõ tính 1 hay 2 lần |
| Soạn hàng | Phần chẵn soạn theo pallet; mỗi dòng đơn lẻ TB nửa pallet, soạn theo layer/thùng | Nếu tính mọi layer là 1 lần soạn → ~200 giờ/tuần, gấp đôi R0 |
| Thuê ngoài > 168 giờ | 2 × (công nhân/ca × €42)/giờ | "Gấp 2" không nói gấp 2 của gì |
| Training | €400 × công nhân/ca × số ca, trả 1 lần/round | Không rõ số người |
| Giờ máy trộn | = giờ dây chuyền (giờ ca + overtime) | Không có dữ liệu |
| Đổi máy trộn/dây chuyền | Chi phí chuyển đổi = 0. App hiện dòng "Thay đổi đầu tư: ±€X" (Investment → ROI) | Không có dữ liệu |
| Cỡ đơn NL | Không làm tròn theo trade unit | Cỡ đơn R0 không phải bội số pallet/drum |
| Tank yard | €25 × tank mỗi ngày (130 ngày) + €10/tank nhận + €100/tank giao | Cách đếm của game chưa rõ |
| Availability NL, nhu cầu, order lines, obsolete | Giữ số R0 | M2/M3 |
| Finance | Thay các dòng Ops trong P&L R0; các dòng khác giữ R0 | M2–M4 |

## 7. Bảng đối chiếu baseline (sau sửa)

Tất cả 27 chỉ số trong bảng đối chiếu (mục 7 của CLAUDE.md và 11 dòng theo ngày mới thêm) đều đạt sai số. Sai số gợi ý cho dòng mới: đỉnh ±15%, số ngày ±max(3; 30%), thời vụ ±25%. Các chỗ còn lệch:

| Chỉ số | R0 | Mô hình | Ghi chú |
|---|---|---|---|
| Kho NL utilization | 93,4% | 88,8% | Mục 4 (−4,6 điểm, sát mép ±5) |
| Kho NL overflow | 10,8% | 12,1% | Phí €37.723 so với €35.423 (+6,5%) |
| Thời vụ kho NL | €6.753 | €5.697 | −15,6% |
| Kho TP utilization | 70,7% | 66,9% | Mục 4 |
| Tank yard | €25.282 | €22.790 | −9,9% (ước lượng) |
| Indirect cost (dòng Ops thay, còn lại R0) | €1.209.651 | €1.208.417 | −0,1% |
| ROI | −7,68% | −7,64% | +0,04 điểm % |

## 8. Đồng bộ nhóm: giới hạn bảo mật (mã đội)

- Ai biết **mã đội** đều đọc/ghi được dữ liệu đội đó. Anonymous Auth không xác định danh tính; nó chỉ chặn truy cập không qua SDK. Mã đội đóng vai trò như mật khẩu chung.
- Rules chặn: liệt kê danh sách teams, đọc document gốc, mã < 8 ký tự, giả uid, ghi sai phòng, trường lạ, sai kiểu, xóa/sửa nhật ký. Rules **không** chặn được người có mã ghi số vô lý trong phạm vi hợp lệ, hoặc ghi phần của phòng khác bằng cách tự sửa code (vai trò chỉ kiểm tra ở giao diện; rules chỉ buộc trường `role` khớp tên phòng).
- `apiKey` web Firebase công khai theo thiết kế. Có thể giới hạn API key theo HTTP referrer trong Google Cloud Console, nhưng làm vậy thì mở file trực tiếp (`file://`) sẽ không đồng bộ được.
- Nên dùng mã dài (≥ 16 ký tự ngẫu nhiên) và gửi qua kênh riêng. Khi lộ mã: đổi sang mã mới (dữ liệu cũ vẫn nằm trên Firestore dưới mã cũ, xóa thủ công trong Console nếu cần).
- Nhật ký không xóa được qua app (rules). App chỉ hiện 50 dòng mới nhất; dòng cũ vẫn chiếm dung lượng nhưng rất nhỏ so với 1 GiB của gói Spark.

## 9. Giới hạn ô nhập & báo lỗi đồng bộ

- Giới hạn mỗi ô (`src/sync/limits.ts`) dùng chung cho ô nhập và kiểm tra trước khi ghi; khớp `firestore.rules` (có test đối chiếu): pallet location 0–100.000, FTE 0–200, intake 1–60 ngày, số ca 1–5; SC: safety stock 0–26 tuần, lot size 0,2–26 tuần, production interval 1–130 ngày, frozen 0–26 tuần.
- Số sai/vượt giới hạn: ô viền đỏ, không gửi lên Firebase. Lỗi khi ghi: báo phần nào, thay đổi gì, nguyên nhân (quyền, mạng, hạn mức, đăng nhập); trạng thái lưu từng phòng ở nút trạng thái góc phải và tab Nhóm; 30 lỗi gần nhất lưu trên máy, có nút "Copy chi tiết lỗi". Nhật ký nhóm chỉ ghi khi bản chung đã nhận thay đổi.
- Giới hạn trên là giới hạn chống nhập nhầm, không phải luật game.

## 10. Dữ liệu bản 25/11/2026 (file cập nhật)

- Tab 2, 3, 5, 6, 9, 10, 11, 12 và tab luật **không đổi** so với bản trước → số Round 0 và mọi kết quả hiệu chỉnh giữ nguyên.
- Tab 7 đổi tiêu đề sang tên gốc tiếng Anh của game; `build-data.ts` nhận cả hai kiểu. Thêm cột: obsoletes, bias (NL); demand, floating stock, obsolete value, bias, rejects (TP); dashboard KPI R-2/R-1/R0.
- Cột "Start up productivity loss **per batch**" (tab 7): game ghi "per batch" nhưng 6 SKU cộng lại = 8.434 ≈ tổng start-up loss cả round (€8.435) → app hiểu là **tổng/SKU/round** (khớp công thức: 13 mẻ × ~72 € = 934 cho Orange 1L).
- Tab 4, cột mới "Số lần giao/tuần" = 5,7 / 5,9 / 5,4 / 5,3 / 4,7: trùng "Deliveries/round" ở tab 10 và khớp lot size 4 tuần (~6 lần/round) → nhiều khả năng là **mỗi round**, tiêu đề ghi nhầm "tuần". App chưa dùng cột này.
- Tab 1, ô "Availability Vitamin C" = 0 ở bản mới: công thức `='7_Supply Chain'!H29` trỏ vào cột Obsoletes sau khi tab 7 đổi cột (đúng phải là cột I = 84,3%). Lỗi trong sheet; app không đọc ô này (đọc trực tiếp bảng tab 7).
- Tab 13 (R-2 vs R0, 497 chỉ số): **thiếu dữ liệu quyết định Round -2** nên chưa dùng làm điểm hiệu chỉnh thứ hai; chỉ dùng để xem mức dao động giữa các round.
- Bảng thông số 23 NCC (tab 4): lead time, phí mỗi chuyến, phí / pallet-drum-IBC, phí / FTL-tank theo Truck/Boat — đã đọc vào dữ liệu, **chưa dùng trong mô hình** (Purchasing chưa làm). Thử khớp nhanh phí vận chuyển R0: phí mỗi chuyến × số lần giao + phí đơn vị × số đơn vị (làm tròn lên mỗi chuyến) cho sai lệch −6% đến +3% (PET chưa rõ tính theo pallet hay FTL: +8% / −10%).

## 11. M2 — Supply Chain

Ô quyết định: safety stock & lot size từng NL, production interval & safety stock từng SKU, frozen period (giới hạn chống nhập nhầm ở mục 9).

**Đã nối (theo luật/dữ liệu):** lot size, safety stock NL → cỡ đơn, số lần nhận, pallet & giờ công kho NL (dao động tab 11 co giãn theo cỡ lô), overflow; production interval → changeover, overtime, start-up loss, máy trộn (mẻ tối thiểu), đỉnh pallet & giờ nhập kho TP; safety stock TP → pallet kho TP.

**Hiệu chỉnh tỷ lệ (baseline = đúng số game):**
- Giá trị tồn từng NL/SKU = giá trị tồn R0 (tab 7) × (tồn TB mô hình ÷ tồn TB baseline) → Investment: Stock. Baseline €321.425 (tab 7) / €321.424 (tab 2).
- Lãi tồn kho (Interest on components / products) = số P&L R0 × (giá trị tồn mới ÷ giá trị tồn R0).

**Ước lượng (badge trên giao diện):**
| Giả định | Đang dùng | Vì sao |
|---|---|---|
| Availability NL | = availability R0 − (tỷ lệ thiếu mới − tỷ lệ thiếu baseline). Tỷ lệ thiếu = số lần nhận × σ_P × G(z) ÷ lượng dùng; z = SS ÷ σ_P | Công thức chuẩn (mục 6); dạng cộng thêm để baseline đúng 84,3% Vitamin C |
| σ nhu cầu NL | Từ σ nhu cầu SKU tuần 1–26 (tab 12) qua BOM, giả định SKU độc lập | Không có σ nhu cầu NL trực tiếp |
| Giao trễ NCC | Độ lệch lead time = (1 − reliability thực tế R0) × lead time | Không có phân phối giao trễ trong file |
| Lead time | Ngày (tab 4) ÷ 7 (ngày lịch) + intake time ÷ 5 | Không rõ game tính ngày lịch hay ngày làm việc. Intake time giờ đã ảnh hưởng availability (mục Ops cũ "chưa mô hình" → đã nối) |
| SL pieces TP dự kiến | = SL R0 − (tỷ lệ thiếu mới − baseline); σ_P = σ tuần × √(interval + frozen period) | Chưa tính adherence/Vitamin C riêng; **chưa vào doanh thu/penalty (M3)** |
| SS gợi ý | NL: z(99%) × σ_P ÷ nhu cầu; TP: z(SL hứa cao nhất của khách mua SKU) × σ_P ÷ nhu cầu | Tham khảo, không phải luật game |
| Tuổi tồn | Lớn nhất ≈ SS + interval/5 tuần; cho phép = hạn dùng 20 tuần (tab 3) × (1 − shelf life khách đòi 75%, tab 6) = 5 tuần | Cảnh báo obsolete, chưa tính chi phí scrap theo tuổi |
| Frozen period | Chỉ vào σ_P của TP (gợi ý SS, SL dự kiến) | Tác động lên giờ dây chuyền/overtime chưa mô hình |

**Hệ quả cần nhớ:** vì doanh thu/penalty chưa mô hình (M3), giảm safety stock (NL hoặc TP) hiện chỉ làm ROI **tốt lên** (ít tồn, ít lãi, ít overflow) mà chưa trừ thiệt hại service level. Bảng cảnh báo nói rõ điều này ở từng trường hợp; dòng ROI chưa mô hình ghi "M3 — chưa tính".

**Chờ dữ liệu / M3:** đổi NCC (lead time, reliability, trade unit, giá) → availability & SS gợi ý; hợp đồng Sales (SL hứa, shelf life) → z, tuổi tồn cho phép; obsolete theo tuổi tồn → Costs of scrap.
