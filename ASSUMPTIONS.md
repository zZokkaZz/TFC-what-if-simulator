# ASSUMPTIONS — Giả định & hiệu chỉnh của TFC Simulator

Phiên bản: **M1 (Ops) + M1.5 (đồng bộ nhóm) + M2 (Supply Chain) + M3 Purchasing + M3 Sales phần service level → penalty → doanh thu** (ô hợp đồng Sales chưa làm). Mọi số R0 lấy từ `data/TFC_Round0.xlsx` qua `npm run data`.

Nhãn trên giao diện:
- **ước lượng**: giả định không có trong luật game.
- **hiệu chỉnh R0**: chỉ số dùng để tính hệ số, nên khớp R0 do cấu tạo. Không phải bằng chứng là mô hình đúng.
- **số R0**: dòng giữ nguyên số Round 0, chưa mô hình hóa.
- **R0 suy ra**: số R0 dựng lại từ tab 11, game không in trực tiếp.

Tab "Giả định & R0" trong app cho phép chỉnh các giả định ước lượng. Chỉnh ở đó chỉ có tác dụng trên máy của người chỉnh.

## 0. Ghi chú dữ liệu

- File gốc tên `TFC Round Trial.xlsx`, đã `git mv` thành `data/TFC_Round0.xlsx`. Bản upload 25/11 (tối) đã copy đè vào `data/` và xóa ở thư mục gốc (mục 17).
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
- **Thời vụ** = Σ ngày max(0, giờ cần − FTE × 8) × €42 × **hệ số năng suất thời vụ 1,299** (≈ 1,30; app dùng số chưa làm tròn):
  - Hệ số lấy từ dây chuyền: 66.670 ÷ (9,4 giờ × 26 × 5 × €42).
  - Kho TP xác nhận độc lập: 68,1 giờ vượt (tab 11) × €42 × 1,299 = €3.714 so với P&L €3.725 (đúng số app hiện ở tab "Giả định & R0").
  - Kho NL: 107,1 giờ vượt (tab 11) → €5.843 so với €6.753 (−13%). Đây là phép kiểm chứng dùng giờ vượt **thật** của tab 11; khác với số **mô hình** €5.697 ở bảng mục 7 (giờ vượt do mô hình dựng lại).
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
| Availability NL, nhu cầu, order lines, obsolete | Availability: mô hình ở M2 (SC) + M3 (NCC, mục 15); nhu cầu, order lines khách, obsolete: giữ số R0 | Sales chưa làm |
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

**Hiển thị bảng SC (sửa 25/11):** bảng nguyên liệu và thành phẩm ở tab Supply Chain giờ theo **đúng thứ tự cột tab 7** và hiện **đúng số sheet** khi chưa đổi quyết định (có test kiểm từng ô). Khi đổi quyết định: số kịch bản = số sheet × (mô hình mới ÷ mô hình baseline), in đậm kèm "R0 …" bên dưới. Cột chưa mô hình (economic inventory, obsoletes, bias, MAPE, floating stock, rejects, demand, SL order lines) giữ số R0, in nghiêng xám. Bản trước hiện số mô hình tự tính (vd order size 620.814, Vitamin C 4,77 tuần) dưới tên cột của sheet — gây hiểu nhầm là sai số liệu.

**Số liệu SC rải rác ở nhiều tab (bổ sung 25/11):** tab Supply Chain hiện nguyên văn mọi bảng liên quan: tab 7 (NL, TP, kiểm tra tổng stock, dashboard), tab 10 (Analysis component, product, warehouse), tab 11 (biểu đồ, thống kê, bảng 130 ngày), tab 12 (26 tuần), tab 3 (BOM, quy cách), tab 13 (R-2 vs R0). `tests/sheet-fidelity.test.ts` đọc thẳng file Excel so từng ô.
- **Lệch giữa các tab trong file:** Economic inventory tab 10 làm tròn (NL 9/8/11/8/18; TP 8/7/8/8/7/7) so với tab 7 (NL 8,7/7,7/10,8/7,7/18,4; TP 7,5/7,5/7,5/7,6/7,4/7,5). App dùng tab 7, hiện cả hai.

**Số liệu Ops nguyên văn (bổ sung 25/11):** tab Ops có mục "Toàn bộ số liệu Ops trong sheet": tab 5 (quyết định kèm cột lựa chọn/chi phí, kết quả R0 đủ 29 dòng, máy trộn, dây chuyền, định mức), tab 10 (bottling line, mixers, warehouse, distributor), tab 11 (giờ công thật R0 theo ngày + thống kê), tab 2 (P&L), tab 13 (lịch sử dây chuyền/máy trộn/kho). Định dạng % lấy từ chính ô trong file (cellNF). Lệch giữa các tab trong file: breakdown tab 10 = 11,0 vs tab 5 = 10,8 (app dùng 10,8); tank yard tab 10 (capacity 20, usage 6) vs tab 5 (29 tank-days/tuần).

## 12. Số hiển thị neo vào số đề bài (sửa 25/11)

- **Số hiển thị = số R0 trong sheet × (mô hình kịch bản ÷ mô hình baseline)**; riêng plan adherence: R0 + (mới − baseline). Không đổi quyết định nào → ROI = **−7,6828% = ô ROI tab 2**, Operating profit −306.505, Investment 3.989.513, mọi dòng P&L, mọi chỉ số Ops (run, changeover, breakdown, unused, overtime, adherence, start-up loss, cleaning, lô TB, utilization, overflow, giờ công, thời vụ, ngày vượt, tank yard) = đúng sheet. Có test `tests/sheet-fidelity.test.ts`.
- Trước đây app hiện số mô hình thô (ROI −7,64%, giờ kho NL 71,9…) — lệch đề bài. Số mô hình thô giờ chỉ dùng ở bảng "Độ chính xác của mô hình" (tab Ops) để biết phần thay đổi đáng tin tới đâu.
- Lưu ý từ sheet: game in Operating profit −306.503 / Indirect 1.209.651; tổng các dòng trong sheet ra −306.505 / 1.209.653 (game làm tròn từng dòng — ghi chú có sẵn ở tab 2). App dùng số tính từ các dòng của sheet (giống ô ROI của sheet).

## 13. Dashboard KPI từng phòng

KPI giống dashboard game: Purchasing (rejection, raw material costs, delivery reliability), Operations (cube utilization kho NL/TP, plan adherence), Sales (gross margin, obsolete, SL outbound order lines), Supply Chain (availability, stock components, stock products), ROI chung. Nguồn: tab 7 dashboard, tab 1 KPI nhanh, tiêu đề tab 4 ("dashboard: rejection TB 2,9%…"), tab 5, tab 2, tab 13 (R-2). R-1 = R0 theo ghi chú tab 13.
- **Thiếu trong sheet (app ghi "thiếu", không tự điền):** R-2 của rejection, raw material costs, delivery reliability (Purchasing); R-2 của gross margin tổng, obsolete, SL outbound (Sales); nhận xét game của Purchasing/Operations/Sales.
- Điểm phòng theo tab luật: Purchasing = contract index TB (TB đơn giản — ước lượng trọng số); Ops = (production costs + dòng kho) ÷ doanh thu (ước lượng dòng nào là "kho"); Sales = realized revenue; SC = Investment: Stock.
- Thay đổi KPI theo kịch bản: Ops & ROI & GM theo mô hình; SC (availability, stock weeks) ước lượng; Purchasing/Sales chưa mô hình (M3) nên đứng yên.

## 14. Sửa sau phiên tự kiểm tra app (25/11/2026)

- **Investment → ROI theo dấu Operating profit.** ROI = OP ÷ Investment. R0 đang lỗ (OP âm) nên **giảm Investment làm ROI xấu đi** (cùng khoản lỗ chia mẫu nhỏ hơn). Cảnh báo "Giá trị tồn kho tăng/giảm" giờ ghi đúng chiều theo dấu OP và in "phần do Investment" = OP ÷ Inv kịch bản − OP ÷ Inv baseline (chỉ là số học của công thức ROI, không phải luật mới). Ví dụ safety stock TP 3 → 2: OP +€3.925, Investment −€43.087, riêng phần Investment −0,08 điểm % → ROI tổng chỉ +0,02 điểm %.
- **Giảm lot size NL → nhiều chuyến giao hơn.** Phí mỗi chuyến của NCC (nằm trong Purchase value / transport) và phí đơn hàng nhập (Inbound orders, Inbound order lines) **chưa mô hình** (giữ R0). App thêm cảnh báo "Giảm lot size làm tăng số chuyến giao → phí vận chuyển & phí đơn hàng tăng (chưa tính, M3)" kèm số lần giao/round (tab 10 × tỷ lệ mô hình). Không có công thức tự chế; các dòng ROI ghi "chưa tính".
- **Production interval ngắn → tồn NL và availability NL tăng: do mẻ tối thiểu máy trộn (đã kiểm chứng).** Với Fruitmix MQ (mẻ tối thiểu 8.000 L), interval 5 ngày làm mẻ của các SKU nhỏ bị làm tròn lên (dư 5.757 L/tuần). Lít dư vẫn trộn và đóng chai nên tiêu thụ thêm NL (Vitamin C +32%, Pack +3%, PET +4%, Orange +3%) → cỡ đơn (lot size tuần × lượng dùng) và tồn NL tăng (€149.076 → €153.505). Đổi sang FMM 4000 (mẻ tối thiểu 3.000 L) thì interval 5 **không** còn đổi lượng dùng, tồn hay availability NL (có test).
  - Availability Vitamin C 84,3% → 85,4% là **hệ quả của cách mô hình** (ước lượng): safety stock = tuần × lượng dùng (đã gồm phần thừa) nên nhiều đơn vị hơn trong khi σ nhu cầu giữ nguyên. **Chưa chắc game tính safety stock theo lượng dùng có phần sản xuất thừa** — không sửa mô hình, chỉ ghi rõ trong cảnh báo. Cần người dùng xác nhận nếu có thông tin từ game.
  - Dòng "Interest on components" trong cảnh báo Vitamin C chỉ hiện khi **tăng safety stock** của NL đó (trước đây luôn hiện, gây hiểu nhầm khi đổi interval).
- **Hai nguồn số R0 của dòng TỔNG tab 2.** `build-data.ts` đọc thêm số game in từ cột Ghi chú ("Game: …") → `finance.gamePrinted`: Operating profit −306.503, Indirect cost 1.209.651. App dùng **tổng dòng sheet** (−306.505 / 1.209.653, = ô TỔNG tab 2) để tính ROI; thanh trên cùng và tab Finance hiện cả hai và ghi rõ nguồn. Có test đọc thẳng file Excel.
- Định dạng chênh lệch: dấu theo số đã làm tròn (không còn "−0,00 điểm %", hiện "±0,00").

## 15. M3 — Purchasing (25/11/2026)

Ô quyết định mỗi nguyên liệu (đúng tab 4 "Lựa chọn khi đàm phán"): Supplier (23 NCC thị trường), Transport (chỉ đổi được với NCC có cả Truck/Boat), Trade unit, Quality, Delivery window, Payment term (tuần), Agreed delivery reliability, và 3 ô **số game** bỏ trống được: *CI game hiển thị*, *Reliability thực tế*, *Rejection thực tế*. Đổi NCC → các ô đặt lại về điều kiện niêm yết của NCC mới (bảng thị trường). Giới hạn chống nhập nhầm (không phải luật game): payment term 0–52 tuần (số nguyên), reliability cam kết 50–100%, CI 0,5–2, reliability thực tế 0–100%, rejection 0–50% (`src/sync/limits.ts` = `firestore.rules`).

**Không đổi gì → mọi số = đúng sheet** (test `tests/sheet-fidelity.test.ts` đọc thẳng file): reliability, rejection, purchase value, transport cost, giá thực trả từng NCC (tab 4); 5 dòng mua NL, Inbound order lines/orders, Payment terms, Purchase value (tab 2); KPI rejection 2,9%, reliability 92,1%, raw material costs 39,5%; contract index TB 0,9968; ROI −7,68%.

**Đã kiểm chứng bằng số R0 (dùng như công thức):**
- **Purchase value = giá cơ bản × contract index × lượng mua + phí vận chuyển** — khớp cả 5 NCC, lệch ≤ €1. (ROADMAP cũ ghi "giá thực trả ≠ giá × CI, tỷ lệ 1,04–3,26": vì giá thực trả đã gồm phí vận chuyển.)
- KPI dashboard: rejection TB và reliability TB = **trung bình gia quyền theo purchase value** (2,93% / 92,1%); raw material costs = purchase value ÷ realized revenue (39,5%).
- Số kịch bản neo R0: tiền hàng = (PV R0 − phí vận chuyển R0) × (lượng mua mô hình ÷ baseline) × (giá cơ bản × CI ÷ của R0). Giá thực trả = số sheet × (giá/đv mới ÷ giá/đv R0).

**Ước lượng (badge "ước lượng" trên giao diện):**

| Giả định | Đang dùng | Vì sao |
|---|---|---|
| Phí vận chuyển | Phí R0 × (mô hình mới ÷ mô hình baseline). Mô hình = số chuyến × (phí mỗi chuyến + phí đơn vị × số đơn vị/chuyến làm tròn lên). Pallet/drum/IBC dùng "phí / Pallet-Drum-IBC"; FTL/tank dùng "phí / FTL-Tank" × số xe/bồn (30 pallet = 1 FTL, đọc từ ghi chú tab 3). Pallet layer (PET) tính như pallet tương đương | Công thức mô hình lệch R0: Pack +3,5%, PET +8,6%, Orange −5,7%, Mango −7,1%, Vitamin C +3,4% → chỉ dùng tỷ lệ |
| FTL | Mỗi chuyến tính đủ số xe (làm tròn lên); **cỡ đơn không làm tròn** theo xe | Luật: "lot size có thể bị trade unit làm vượt" — game làm tròn thế nào chưa rõ; cỡ đơn R0 không phải bội số pallet/tank. Hệ quả: Pack lot 4 tuần ≈ 35,9 pallet/chuyến → FTL 2 xe đắt hơn pallet lẻ; lot 3,3 tuần (~30 pallet) → FTL rẻ hơn |
| Phí đơn hàng nhập | Inbound order lines (€271) và Inbound orders (€1.353) × (tổng số chuyến mới ÷ baseline 27,1) ≈ €10/order line, €50/đơn | Suy ra từ R0, game không công bố đơn giá |
| Contracted suppliers (€100.000) | Giữ R0 | Luôn 5 NCC (1 NCC/nguyên liệu) |
| Payment term NCC | Phải trả ≈ purchase value/tuần × payment term; Investment: Payment terms = R0 − (phải trả mới − phải trả baseline). Bỏ qua "start payment term" (When ordering / At delivery) | Cách game tính AR/AP chưa biết (M4) |
| Contract index khi đổi điều kiện / NCC mới | Dùng CI niêm yết (hợp đồng R0 hoặc bảng thị trường) cho tới khi đội nhập "CI game hiển thị"; có cảnh báo "Chưa nhập số game" | Game chỉ hiện CI mới sau Calculate |
| Reliability thực tế | NCC R0: số R0 + (cam kết mới − cam kết R0). NCC mới: cam kết − 4,72 điểm (chênh lệch TB cam kết − thực tế của 5 NCC R0). Nhập số game thì dùng số game | Sheet chỉ có reliability cam kết của NCC mới |
| Rejection | NCC mới hoặc đổi quality: = rejection R0 của nguyên liệu đó (Pack 3,6%, PET 5,9%, Orange 1,0%, Mango 0,5%, Vitamin C 1,2%) | Không có dữ liệu rejection NCC mới. (Bản M1 dùng High 1% / Middle 3% / Poor 6% — đã bỏ vì tự đặt) |
| Quality bao bì → hỏng dây chuyền | Giữ hệ số mục 6 (Poor ×1,6, Middle ×1,25 so với High) | Luật chỉ nói "Poor gây hỏng" |
| Lead time | Theo phương tiện đang chọn (tab 4 thông số chi tiết) | Có trong sheet |

**Chỉ cảnh báo, KHÔNG đưa vào số (theo duyệt của người dùng):**
- Delivery window: rộng hơn → "hàng về lệch ngày nhiều hơn" (luật) — không có độ lớn.
- Quality Orange/Mango/Vitamin C khác High → "thành phẩm không đạt kiểm tra bị hủy" (luật) — không có độ lớn.
- NCC mới không certification / free capacity < 10% → hay giao trễ (luật) — nên nhập reliability thực tế.

**Firestore rules:** thêm `validTerms` cho `terms` (5 nguyên liệu × 9 trường). Firestore chỉ cho **1.000 biểu thức mỗi request**: bản viết đầy đủ (`is number`, hàm phụ) làm ghi hợp lệ đủ 5 nguyên liệu bị chặn oan → viết tối giản, dựa vào việc so sánh khác kiểu là lỗi = bị chặn. `scripts/test-rules.mjs`: 40/40 trên emulator, gồm ca tốn biểu thức nhất (5 nguyên liệu, điền đủ ô số game). **Người dùng cần Publish lại rules.**

## 16. M3 — Sales, phần service level → penalty → doanh thu (25/11/2026)

Theo yêu cầu người dùng: nối service level ước tính (availability NL + plan adherence + safety stock TP) vào realized revenue và 3 dòng Penalty service level. **Ô quyết định hợp đồng Sales (SL hứa, shelf life, deadline, trade unit, promotion) CHƯA làm**; contracted sales giữ R0.

**Không đổi gì → mọi số = đúng sheet** (test đọc thẳng file): 3 dòng penalty và contracted (tab 2), realized revenue (tab 2), revenue / SL order lines / SL pieces / attained CI từng khách (tab 6), SL outbound 92,0% (tab 1), SL TP từng SKU (tab 7), ROI −7,68%.

**Đã kiểm chứng bằng số R0:**
- Revenue khách (tab 6) = contracted + penalty (tab 2) — **khớp tuyệt đối** cả 3 khách.
- Penalty ≈ contracted × (1 − attained CI ÷ CI): lệch 0,05% (F&G), 0,09% (LAND), 0,77% (Dominick's) — do attained CI làm tròn 3 chữ số.
- Dashboard "Service level outbound order lines" 92,0% = TB gia quyền order lines/tuần của SL order lines 3 khách (91,99%).

**Ước lượng (game không công bố công thức penalty):**

| Giả định | Đang dùng | Cơ sở |
|---|---|---|
| SL TP từng SKU | SL R0 − (tỷ lệ thiếu hàng mới − baseline) + **0,974 × (plan adherence mới − baseline)** | Tỷ lệ thiếu hàng: công thức chuẩn mục 11 (safety stock TP, interval). Độ dốc 0,974: hồi quy SL pieces theo plan adherence của 6 SKU R0 (tab 7), R² = 0,95. Plan adherence đã gồm availability NL và capacity dây chuyền. **Giới hạn:** độ dốc lấy từ chênh lệch GIỮA các SKU (chủ yếu do thiếu Vitamin C), áp cho thay đổi theo kịch bản — có thể quá mạnh khi adherence đổi vì capacity (vd thêm ca) |
| SL order lines | SKU: R0 + cùng thay đổi như SL pieces. Khách: R0 + TB (gia quyền nhu cầu khách × SKU, tab 6) thay đổi SL các SKU khách mua | Không có quan hệ pieces ↔ order lines |
| Penalty | Penalty R0 của khách × (mức thiếu mới ÷ mức thiếu R0); mức thiếu = max(0, SL hứa − SL order lines). Đạt/vượt SL hứa → 0 | R0: penalty/điểm thiếu = 5,12% / 2,53% / 1,88% contracted → **không có một công thức chung** cho 3 khách; neo từng khách, tuyến tính theo mức thiếu. (Khách R0 không thiếu mà kịch bản thiếu → dùng tỷ lệ TB 3 khách.) |
| Thưởng khi vượt SL hứa | **Chưa tính** | Luật: "vượt thì được thưởng nhỏ" — không có độ lớn |
| Attained CI kịch bản | Attained CI R0 × (revenue mới ÷ revenue R0) | Giữ đúng ô tab 6 ở baseline |
| Contracted sales, phí phân phối, obsolete | Giữ R0 | Nhu cầu, giá, hợp đồng chưa mô hình |

**Frozen period: CHƯA MÔ HÌNH** (theo yêu cầu): đổi ô không đổi số nào — gợi ý SS TP, SL dự kiến, doanh thu, giờ dây chuyền đều dùng frozen R0 (3 tuần). Bản M2 cho frozen vào σ bảo vệ của TP (gợi ý SS, SL dự kiến) — đã bỏ.

**Độ lớn đáng chú ý (để người dùng biết, KHÔNG chỉnh hệ số cho "đẹp"):**

| Kịch bản | ROI | Ghi chú |
|---|---|---|
| Safety stock TP 3 → 1 tuần | −7,68% → −23,33% | Penalty +€611.442 (SL order lines F&G 91,2% → 84,7%) |
| Safety stock TP 3 → 2 tuần | → −10,32% | |
| Thêm ca 2 → 3 | → −0,44% | Adherence +9 điểm → SL vượt 95% cả 3 khách → penalty = 0. Có thể quá lạc quan (xem giới hạn độ dốc) |
| SMED | → −4,09% | |
| Production interval 10 → 5 | → −26,47% | Changeover ×2 → adherence ↓ + thiếu hàng ↑ |
| Production interval 10 → 15 | → −3,93% | |
| Vitamin C → NCC SYI | → −6,80% | |

## 17. Sửa sau rà soát 4 phòng (25/11/2026)

- **Dữ liệu mới** (`TFC Round Trial.xlsx` upload lên `main`, đã copy vào `data/TFC_Round0.xlsx`, xóa bản ở thư mục gốc). So từng ô với bản trước: chỉ 2 tab đổi.
  - 5_Operations D29: ghi chú tank yard thêm "usage TB 5,85 tank…".
  - 6_Sales: thêm cột Carbon footprint, Revenue/tuần, MAPE theo SKU, €/tuần & GM theo khách × SKU, bảng Distributor (dòng 51–53), ghi chú Webshop; distribution cost và nhu cầu khách × SKU có số lẻ (tổng 192.114,41 / 307.782,22); G9 "Revenue (€, 26 tuần)", J16 "Assignable Contribution Rate".
  - ROI R0 vẫn −7,68%; mọi số đã hiển thị không đổi.
- **Đọc theo tiêu đề không còn "khớp cột đầu tiên"**: `build-data.ts` dừng với lỗi nếu một mẫu tiêu đề khớp nhiều cột. Đã sửa 3 mẫu mơ hồ: "Vận chuyển" (tab 4, lẫn "Vận chuyển chọn được"), "Revenue" (tab 6, lẫn "Revenue/tuần (€)"), "Nhu cầu/tuần" (khách × SKU, lẫn "Nhu cầu/tuần (€)").
- **Penalty có trần**: penalty khách ≤ contracted → doanh thu khách ≥ 0. Trước đây 2 → 1 ca cho doanh thu F&G −€880.333, attained CI −0,684.
- **"Ngoài vùng dữ liệu R0"** (quy ước hiển thị, không phải luật game): mức thiếu SL > **2 ×** mức thiếu R0 của khách, hoặc R0 không thiếu mà kịch bản thiếu, hoặc penalty bị chặn. Penalty là ngoại suy tuyến tính từ 1 điểm R0 duy nhất mỗi khách → chỉ nên đọc chiều hướng. Hiện ở tab Sales, cảnh báo service level và dưới ROI trên thanh trên.
- **Tank yard hai nguồn**: tab 10 Usage = 6 (app neo tank TB theo số này), ghi chú tab 5 = 5,85. App hiện cả hai (luật 4).
- **Màu Investment trên thanh trên** theo tác động lên ROI (đang lỗ: Investment tăng → ROI tốt lên → xanh).

### 17b. Hệ số ước lượng chưa xác minh — một chỗ duy nhất

Tất cả nằm trong `src/model/assumptions.ts` → `COEFFS`. Mỗi hệ số có: giá trị, nguồn, trạng thái ("chưa xác minh" / "đã xác minh"), file dùng, dữ liệu cần để xác minh. Tab "Giả định & R0" hiện nguyên bảng này.

| Hệ số | Giá trị | Trạng thái | Dùng ở |
|---|---|---|---|
| `outOfRangeFactor` — mốc "ngoài vùng dữ liệu R0" | 2 lần mức thiếu R0 | chưa xác minh | `src/model/sales.ts` |
| `penaltyShortfallExponent` — penalty theo mức thiếu | 1 (tuyến tính) | chưa xác minh | `src/model/sales.ts` |
| `capacitySlopeB` — V1 phương án B | 0,5 | chưa xác minh | chưa dùng (chờ chọn) |
| `capacitySlopeC` — V1 phương án C | 0,25 | chưa xác minh | chưa dùng (chờ chọn) |

**Khi có dữ liệu vòng trial:** sửa `value` (và `status`, `source`) trong `COEFFS` → `npm run verify`. Test đọc giá trị từ `COEFFS`, không gõ lại số; baseline R0 không phụ thuộc các hệ số này (đã thử đổi mốc 2 → 3 và mũ 1 → 1,3: 240/240 vẫn xanh). `tests/coeffs.test.ts` còn kiểm tra mục `usedIn` khớp thực tế: hệ số ghi "chưa dùng" mà có file đọc (hoặc ngược lại) thì test đỏ.

## 18. C2 — obsolete & Costs of scrap theo tuổi tồn; V1 — tách plan adherence (25/11/2026)

### C2 (ước lượng, hiệu chỉnh R0)

- **Tuổi cho phép** A = hạn dùng SP (tab 3: 20 tuần) × (1 − shelf life khách đòi cao nhất, tab 6: 75%) = **5 tuần**.
- **Tuổi lúc xuất kho** của SKU ≈ Đều[S, S + P] + Chuẩn(0, σ): S = safety stock TP (tuần), P = production interval ÷ 5 (tuần). Tỷ lệ quá tuổi
  `f(S, P, A, σ) = σ/P × [L((A − S − P)/σ) − L((A − S)/σ)]`, với L(z) = E[(Z − z)+], Z ~ N(0,1).
- **σ từng SKU hiệu chỉnh** sao cho f(R0: S = 3, P = 2, A = 5) = obsolete R0 tab 7: σ = 0,42 / 0,36 / 0,44 / 0,41 / 0,28 / 0,40 tuần (Orange 1L … Mango PET). Giả định: toàn bộ obsolete R0 do tuổi tồn (không tách được phần do sai dự báo).
- **Obsolete kịch bản** = obsolete R0 × f(mới, σ × `obsoleteAgeSpreadScale`) ÷ f(R0, σ × `obsoleteAgeSpreadScale`) (≤ 100%); không đổi SS/interval → đúng số tab 7.
- **Obsolete value/tuần** = số tab 7 × (obsolete mới ÷ R0).
- **Costs of scrap** = €40.203 (tab 2) × (Σ obsolete value/tuần mới ÷ R0)^`scrapObsoleteElasticity`. R0: obsolete 4.421 €/tuần × 26 = 114.946 € ≠ scrap 40.203 € → quan hệ chính xác chưa rõ.
- **KPI Obsolete products** = 8,1% (tab 1) + (TB gia quyền nhu cầu của obsolete mới − R0).
- **Cảnh báo ĐỎ** khi tuổi tồn lớn nhất (S + P) > A, kèm số Costs of scrap.
- **Chưa mô hình:** hàng hủy làm giảm hàng bán / phải sản xuất bù (giờ dây chuyền, NL); giờ hủy hàng kho TP vẫn theo obsolete R0.
- **`obsoleteAgeSpreadScale` = 2 (người dùng chọn 25/11, vẫn "chưa xác minh").** Lý do: R0 nằm sát mép (SS 3 + chu kỳ 2 = 5 tuần = tuổi cho phép) nên hiệu chỉnh từ 1 điểm cho σ quá nhỏ (~0,4 tuần) → obsolete đổi rất dốc; MAPE dự báo 47–61% (tab 7) cho thấy tuổi hàng phải phân tán rộng hơn. Độ nhạy (obsolete Orange 1L, R0 8,4%):

| Hệ số phân tán | σ (tuần) | Interval 15 | Interval 20 | SS TP 4 | SS TP 5 | Interval 5 |
|---|---|---|---|---|---|---|
| 1 | 0,42 | 33,4% | 50,0% | 50,0% | 91,6% | 0,1% |
| **2 (đang dùng)** | 0,84 | 17,6% | 25,2% | 25,2% | 42,0% | 2,3% |
| 3 | 1,26 | 13,3% | 17,7% | 17,7% | 27,1% | 4,4% |

### V1 (ước lượng) — người dùng chọn phương án B làm số chính, C làm cận dưới

- Δ plan adherence của SKU = **phần thiếu NL** (capacity R0 × Δ availability) + **phần capacity** (availability mới × Δ capacity adherence).
- **Phần thiếu NL**: tuyến tính 0,974 điểm SL / điểm adherence (hồi quy 6 SKU R0, R² 0,95 — chênh lệch giữa SKU trong R0 chỉ do thiếu Vitamin C).
- **Phần capacity** (R0 không có điểm dữ liệu): bão hòa mũ trên tỷ lệ thiếu hàng: `thiếu mới = thiếu × e^(−(độ dốc ÷ 0,0778) × Δ capacity)`; 0,0778 = tỷ lệ thiếu TB R0 (1 − SL pieces, 6 SKU) → độ dốc tại R0 = `capacitySlopeB` (0,5, **số chính**) hoặc `capacitySlopeC` (0,25).
- **"Thận trọng"** = SL thấp hơn giữa B và C từng SKU → doanh thu & ROI thận trọng **luôn ≤ số chính**. Khi capacity giảm (vd 1 ca), C cho SL cao hơn B nên thận trọng = B (C không phải cận dưới khi capacity giảm). Hiện "(thận trọng: x%)" cạnh ROI (thanh trên, Dashboard) và doanh thu thận trọng ở tab Sales khi phần capacity thay đổi.

### PM — giờ bảo trì và plan adherence (kiểm tra 25/11)

- Giờ bảo trì **có** trừ vào công suất: giờ tải = run + changeover + breakdown + giờ bảo trì → overtime, chi phí thời vụ. Lời giờ ròng gần bằng nhau: Minimal 2,25 giờ/tuần (giảm hỏng 3,24 − bảo trì 1), Extensive 2,41 giờ/tuần (5,41 − 3); overtime 7,90 so với 7,79 giờ/tuần.
- Plan adherence = 1 − k × (breakdown + `maintenanceDisruptionWeight` × giờ bảo trì + overtime + thuê ngoài) ÷ (giờ ca + overtime), k hiệu chỉnh R0 (R0 không có PM). Mặc định hệ số = **0**: giờ bảo trì là việc có kế hoạch, không tính như hỏng đột xuất → Extensive có adherence cao hơn Minimal 1,7 điểm (89,4% so với 87,6% phần capacity) → penalty ít hơn ~€39k → ROI hơn ~1 điểm. Đặt hệ số = 1 nếu coi mọi giờ mất như nhau: hai mức gần bằng nhau (có test).
- **Người dùng chọn giữ hệ số = 0 (25/11):** bảo trì có lịch trước nên không làm trễ kế hoạch sản xuất như hỏng đột xuất; giờ bảo trì chỉ làm giảm công suất (đã tính qua giờ tải → overtime). Vẫn "chưa xác minh" — xem lại khi có plan adherence của vòng trial có bật PM.

### Bảng kịch bản trước / sau (ROI; trước = main b59c6a4; sau = phân tán tuổi tồn × 2, PM hệ số 0)

| Kịch bản | Trước | Sau (số chính B) | Thận trọng | Plan adherence | Penalty | Costs of scrap |
|---|---|---|---|---|---|---|
| R0 | −7,68% | −7,68% | −7,68% | 78,7% | −€322.708 | €40.203 |
| 2 → 1 ca | −58,88% | −55,55% | −55,55% | 50,1% | −€2.077.153 | €40.203 |
| 2 → 3 ca | −0,44% | −3,38% | −5,59% | 87,6% | −€117.239 | €40.203 |
| SMED | −4,09% | −6,49% | −6,99% | 80,1% | −€282.015 | €40.203 |
| PM Minimal | −1,06% | −5,14% | −6,22% | 82,0% | −€232.183 | €40.203 |
| PM Extensive | +0,13% | −4,14% | −5,64% | 83,7% | −€193.090 | €40.203 |
| Training | +0,22% | −4,05% | −5,54% | 83,7% | −€194.025 | €40.203 |
| Training + PM Minimal | +0,91% | −2,99% | −4,85% | 85,5% | −€155.639 | €40.203 |
| Training + PM Minimal + SMED | +1,00% | −2,29% | −4,38% | 86,8% | −€131.191 | €40.203 |
| Training + PM Extensive | +0,84% | −2,72% | −4,71% | 86,2% | −€142.087 | €40.203 |
| Interval 10 → 5 | −26,47% | −16,21% | −16,21% | 72,7% | −€540.084 | €10.599 |
| Interval 10 → 15 | −3,93% | −7,81% | −8,37% | 80,3% | −€280.370 | €86.071 |
| Interval 10 → 20 | −3,68% | −9,37% | −10,17% | 81,0% | −€264.369 | €123.807 |
| SS TP 3 → 5 | −8,60% | −12,70% | −12,70% | 78,7% | −€306.284 | €207.410 |
