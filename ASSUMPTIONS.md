# ASSUMPTIONS — Giả định & hiệu chỉnh của TFC Simulator

Phiên bản: **M1 (Ops)**. Mọi số R0 lấy từ `data/TFC_Round0.xlsx` qua `npm run data`.
Trên giao diện:
- badge **ước lượng**: giả định không có trong luật game;
- badge **hiệu chỉnh R0**: chỉ số được dùng để tính hệ số, nên khớp R0 do cấu tạo;
- badge **số R0**: dòng giữ nguyên số Round 0, chưa mô hình hóa.

Xem đầy đủ ở tab "Giả định & R0" trong app.

## 0. Ghi chú về dữ liệu

- File gốc tên `TFC Round Trial.xlsx`, đã `git mv` thành `data/TFC_Round0.xlsx`.
- Tab luật trong file có tên `Luật for ops and others phòng b` (Excel giới hạn tên tab 31 ký tự), không phải `8_Luật game`. `build-data.ts` chấp nhận cả hai tên.
- Cột "Start-up loss/mẻ (€)" ở tab 7 thực ra là **tổng cả round** của từng SKU: cộng 6 SKU = 8.434 ≈ 8.435.
- Tuần 0 (tab 12) và ngày 0 (tab 11) trùng tuần 1 và ngày 1. Thống kê dùng tuần 1–26.
- Breakdown dây chuyền ghi 10,8 giờ/tuần ở tab 5 và 11,0 ở tab 10. App dùng 10,8 (tab 5).

## 1. Luật đã biết (dùng như chắc chắn)

Lấy từ CLAUDE.md mục 6 và tab 5_Operations "Định mức", nằm trong `src/model/rules.ts`. `tests/rules.test.ts` đối chiếu từng con số với chuỗi định mức trong Excel.

## 2. Công thức suy ra từ dữ liệu R0 (khớp mà không cần hiệu chỉnh)

| Chỉ số | Công thức | R0 thật → mô hình |
|---|---|---|
| Run time | lít cần đóng ÷ tốc độ + số changeover × start-up loss × 1 giờ | 62,6 → 62,7 |
| Start-up loss € | Σ SKU: số mẻ × (start-up loss × tốc độ × 1 giờ ÷ lít/đv) × giá vốn/đv (giá vốn = giá bán TB − GM/đv) | 8.435 → 8.442 |
| Cleaning máy trộn | vệ sinh 1 lần mỗi lần đổi SKU; tỷ lệ = giờ vệ sinh ÷ (giờ trộn + vệ sinh) | 14,5% → 14,6% |
| Lô trung bình | mỗi mẻ SKU chia thành ⌈lít ÷ mẻ tối đa⌉ lô, lô ≥ mẻ tối thiểu | 11.022 → 11.058 L |
| Mixer variable cost | (giờ trộn + giờ vệ sinh) × €/giờ | 144.569 → 143.910 |
| Pallet kho NL | tồn TB = SS × dùng/tuần + ½ cỡ đơn; PET 1.080/pallet, Pack 17.280/pallet, IBC = 1 pallet | 93,4% → 93,1% |
| Giờ kho NL | 4 giờ/ngày + nhận hàng + cấp sản xuất + chuyển overflow | 74 → 70,6 giờ/tuần |
| Giờ kho TP | 4 giờ/ngày + nhập từ sản xuất + soạn hàng + hủy obsolete | 100 → 98,1 giờ/tuần |
| Thời vụ kho NL | Σ ngày max(0, giờ cần − FTE × 8) × €42 | 6.753 → 6.792 |

**Cách hiểu chỉ số kho (diễn giải, chưa xác nhận):** utilization = số pallet TB (kể cả phần ở overflow) ÷ pallet location. Overflow % = pallet TB ở overflow ÷ số pallet TB. Lý do chọn cách hiểu này: phí overflow R0 €35.423 ÷ €3 ÷ 130 ngày = 91 pallet/ngày ≈ 10,8% × 840.

## 3. Hệ số hiệu chỉnh (tự tính trong `src/model/calibration.ts`)

Các hệ số này không gõ tay: code tính từ số R0 mỗi lần chạy. Chỉ số dùng để tính hệ số thì **khớp R0 do cấu tạo, nên không phải bằng chứng là mô hình đúng**.

| Hệ số | Giá trị | Cách tính | Khớp do cấu tạo |
|---|---|---|---|
| Sản lượng sản xuất / nhu cầu | 1,0935 | Bao bì tiêu thụ R0 ÷ nhu cầu 6 SKU. Phần dư gồm obsolete, reject và bù tồn | — |
| Cỡ đơn NL / (lot size × mua/tuần) | Pack 1,13 · PET 1,10 · Orange 1,20 · Mango 1,22 · VitC 1,38 | Cỡ đơn thực tế R0 ÷ (4 tuần × lượng mua/tuần) | — |
| Tồn TP thực tế / lý thuyết | 0,58–0,85 theo SKU | Tồn R0 ÷ (SS + ½ chu kỳ = 4 tuần). Lý thuyết cao hơn thực tế vì hết hàng và plan adherence thấp | Kho TP utilization |
| Tỷ lệ changeover tính như size changeover | 100% | R0: 12,1 giờ ÷ 3 lần/tuần = 4,03 giờ ≈ size changeover 4 giờ | Changeover |
| Giờ hỏng / giờ chạy | 0,1725 | 10,8 ÷ 62,6, ở điều kiện R0 (PET Poor, Middle, không PM/training/inspection) | Breakdown |
| CV giờ tải tuần | 18,4% | Giờ tải ~ phân phối chuẩn; chọn CV để unused = 3,9. Overtime suy ra = 9,4 | Unused, Overtime |
| Độ nhạy plan adherence k | 0,706 | Adherence = [1 − k × (breakdown + overtime) ÷ (giờ ca + overtime)] × availability NL của SKU | Plan adherence |
| Hệ số chi phí thời vụ dây chuyền | 1,30 | 66.670 ÷ (9,4 giờ × 26 × 5 người × €42). Có thể do thời vụ năng suất thấp hơn | Flexible manpower (bottling) |

Kiểm chứng độc lập cho công thức plan adherence: các SKU C-power có adherence ≈ 0,70 ≈ 0,84 × availability Vitamin C 0,843. Các SKU còn lại ≈ 0,83.

## 4. Giả định ước lượng (`src/model/assumptions.ts`)

Các giả định dưới đây chỉ đổi **độ nhạy** khi thử kịch bản. Baseline không đổi vì mọi hệ số đều tính tương đối so với điều kiện R0.

| Giả định | Đang dùng | Vì sao |
|---|---|---|
| Hỏng máy theo chất lượng bao bì | High ×1 · Middle ×1,25 · Poor ×1,6 (trung bình theo lít Pack/PET) | Luật chỉ nói "Poor gây hỏng", không cho độ lớn |
| RM inspection lên hỏng máy | Giảm 50% phần hỏng do bao bì kém | Luật không cho độ lớn |
| Tolerance dây chuyền | Narrow ×1,25 · Middle ×1 · Wide ×0,8 | Luật chỉ gợi ý |
| Drum/IBC ra pallet | 4 drum = 1 pallet · 1 IBC = 1 pallet · tank → tank yard | Không có quy đổi |
| Giờ chuyển overflow | 6 phút cho mỗi pallet vào overflow (không tính lần ra) | Định mức "ra/vào" chưa rõ tính 1 hay 2 lần. Nếu tính 2 lần: giờ kho NL ≈ 78,6 thay vì 70,6 (vẫn trong ±15%) |
| Soạn hàng | Phần chẵn soạn theo pallet; mỗi dòng đơn lẻ TB nửa pallet, soạn theo layer/thùng | Nếu tính mọi layer là 1 lần soạn thì giờ kho TP ≈ 200 giờ/tuần, gấp đôi số R0 100 |
| Thuê ngoài > 168 giờ | 2 × (công nhân/ca × €42)/giờ | "Gấp 2" nhưng không nói gấp 2 của gì |
| Training | €400 × công nhân/ca × số ca, trả 1 lần/round | Không rõ số người |
| Giờ máy trộn sẵn có | = giờ dây chuyền (giờ ca + overtime) | Không có số ca riêng cho máy trộn |
| Chi phí đổi máy trộn/dây chuyền | 0 € (chỉ đổi phí năm, đầu tư, thông số) | Không có dữ liệu |
| Cỡ đơn NL | Không làm tròn theo trade unit | Cỡ đơn R0 (vd PET 951.612 cái) không phải bội số pallet/drum |
| Tank yard | €25 × số tank mỗi ngày (130 ngày làm việc) + €10/tank nhận + €100/tank giao cho sản xuất | Cách game đếm tank-ngày và "lần giao" chưa rõ |
| Availability NL, nhu cầu, order lines, obsolete | Giữ số R0 | Sẽ mô hình ở M2/M3 |
| Mô phỏng theo ngày | Lịch đều, không ngẫu nhiên: lô NL về đúng chu kỳ, các SKU sản xuất so le trong chu kỳ, nhận hàng dàn đều trong intake time | Game có ngẫu nhiên nên đỉnh và số ngày vượt khác thực tế |
| Intake time | Chỉ dàn giờ nhận hàng; chưa làm NL sẵn sàng muộn hơn | Ảnh hưởng availability sẽ làm ở M2 |
| Finance M1 | Thay các dòng Ops trong P&L R0 bằng số mô hình; doanh thu, mua NL, lãi vay, phân phối, tồn kho, payment terms giữ R0 | M2–M4 |

## 5. Chỉ số còn lệch (baseline R0)

Mọi chỉ số Ops ở mục 7 của CLAUDE.md đều **đạt** sai số. Các chỗ còn lệch đáng chú ý:

| Chỉ số | R0 thật | Mô hình | Ghi chú |
|---|---|---|---|
| Kho NL overflow | 10,8% | 9,2% | −1,6 điểm % (trong ±5) |
| Phí overflow kho NL | €35.423 | €30.105 | −15%. Lịch nhận hàng đều thì ít dồn đỉnh hơn game |
| Giờ công kho NL | 74 | 70,6 | −4,6% |
| Ngày vượt giờ cố định kho NL / đỉnh | 12 ngày / 65 giờ | 7 ngày / 82 giờ | Không ngẫu nhiên, nên phân bố đỉnh khác game |
| Ngày vượt giờ cố định kho TP | 6 ngày | 13 ngày | Mô hình dồn giờ nhập TP vào ngày sản xuất |
| Thời vụ kho TP | €3.725 | €2.694 | −28% |
| Overflow kho TP | €607 | €0 | Đỉnh mô hình 1.143 < 1.500 pallet |
| Tank yard | €25.282 | €21.566 | −15% (ước lượng) |
| Indirect cost (dòng Ops thay, còn lại R0) | €1.209.651 | €1.199.021 | −0,9% |
| ROI (dòng không phải Ops giữ R0) | −7,68% | −7,41% | +0,27 điểm % (trong ±1,5) |

## 6. Giới hạn đã biết

- Plan adherence chưa nối sang service level, doanh thu và penalty (M3).
- Thay đổi Ops chưa làm đổi tồn kho, lãi vay hay Investment Stock (M2/M4).
- Đổi dây chuyền chỉ đổi tốc độ, changeover, start-up loss, tolerance, nhân công, phí và đầu tư. Hệ số hỏng máy vẫn lấy theo R0, nhân với hệ số tolerance (ước lượng).
