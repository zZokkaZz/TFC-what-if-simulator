# Biên bản thương lượng Round 2: 4 agent phòng ban + chủ tọa (27/11/2026)

> Trọng tài là simulator đã hiệu chỉnh R0 + R1 (`scripts/eval.ts`). Mọi số ở đây là **số model, tức ước lượng**. Riêng số game R1 được ghi rõ là "game".
> Gốc so sánh là bộ quyết định R1 đã nộp, model cho ROI 5,36% (game thật R1: 5,04%).
> Mục tiêu đội: **ROI trước**, chỉ nhường tối đa ~0,2 điểm ROI để nâng phòng yếu nhất (Purchasing, hạng 91 ở R1).
> Ràng buộc: không dùng Vitamin C Tank, không promotion Heavy, tuổi tồn TP ≤ mức cho phép, mẻ trộn C-power PET ≥ 8.000 L.

## 1. Cách làm

1. **Quét tự động** (`scripts/sweep.ts`, leo đồi có ràng buộc). Bước này giúp không bỏ sót phương án mà agent không nghĩ ra. Kết quả ROI 7,04%, nhưng SL Food & Groceries chỉ 95,01%, sát mức hứa 95%.
2. **Vòng 1:** mỗi agent chỉ được sửa ô của phòng mình, thử 10–75 kịch bản rồi đề xuất phương án và phản biện phương án quét.
3. **Vòng 2:** chủ tọa ghép bản nháp C3. Mỗi phòng được giao đúng điểm vướng: SL F&G 95,68% < 96,0% mà Sales yêu cầu.
4. **Chủ tọa chốt** bằng phép thử "trượt": giả sử game giao SL thấp hơn model 0 / 0,5 / 1,0 / 1,5 điểm, rồi chọn phương án có ROI trung bình cao nhất.

## 2. Vòng 1: mỗi phòng đòi gì

| Phòng | Đề xuất chính | Lập luận có số (model) | Không nhường |
|---|---|---|---|
| **Sales** | Bác phương án quét | F&G 95,01% chỉ dư 0,01 điểm. Mỗi điểm thiếu: F&G ≈ €67k, LAND ≈ €16k, Dominick's ≈ €13k. Vượt mức hứa chỉ được thưởng 0,675% | SL model F&G ≥ 96,0%, LAND/Dom ≥ 95,8%; SL hứa giữ 95% |
| **Supply Chain** | Lot NL Pack 2 / PET 0,5 / Orange 0,5 / Mango 2; interval 7 cho Orange 1L & Mango 1L; SS C-power 2,5 | Lot nhỏ cho +0,53 ROI mà SL gần như không đổi. Cắt SS NL như phương án quét làm F&G −0,74 điểm | Vitamin C SS ≥ 3, Pack SS ≥ 2 |
| **Purchasing** | Pack → Swenska, Mango → Tampa, Vitamin C → AIL; giữ Orange Miami | CI TB 1,0256 → 0,9987 (điểm phòng yếu nhất cải thiện mạnh), ROI cao hơn quét | Phản đối Orange → Medina (CI 1,03, quality Middle cho nước chính) |
| **Operations** | Increase speed; kho NL 600–650 / 2 FTE; kho TP 1.200–1.250 | Speed: điểm Ops 32,40 → 31,83%, tăng ca 4,2 → 1,8 h/tuần, +0,36 điểm SL, ROI −0,02…−0,06. Không đổi SMED/PM/ca/dây chuyền (đổi đều xấu hơn) | Kho TP giữ 3 FTE (2 FTE thì thời vụ TP lên €40k) |

## 3. Vòng 2: giải điểm vướng (nền C3, ROI 7,08%, F&G 95,68%)

| Phòng | Cách đưa F&G ≥ 96% | ROI | F&G |
|---|---|---|---|
| Ops | Intake 5 → 4 ngày (không đủ một mình) | 7,05% | 95,80% |
| Supply Chain | SS NL Orange 2,5 + Mango 2,5 (che rủi ro Tampa) | 6,97% | 96,28% |
| Purchasing | Pack SS 2,5 + Orange SS 2,3; giữ cả 3 NCC mới | 6,99% | 96,12% |
| Sales | Orange SS 2,5; không hạ yêu cầu 96,0% vì dư 0,89 điểm đã mất 0,41 ROI khi game trượt 1 điểm | 6,98% | 96,22% |

Nguyên nhân gốc mà cả 4 phòng cùng tìm ra: **Orange (Miami, lead time 5,3 tuần) và Pack là nút thắt SL của F&G**, vì F&G mua cả 3 SKU 1 lít. Swenska và AIL gần như không ảnh hưởng SL; Tampa làm F&G giảm khoảng 0,08 điểm.

## 4. Chủ tọa chốt: phép thử trượt

| Phương án | ROI khi game trượt 0 / 0,5 / 1,0 / 1,5 điểm SL | TB | F&G model | CI TB | Ops | Tồn (SC) |
|---|---|---|---|---|---|---|
| C3 (nháp) | 7,08 / 7,08 / 6,32 / 5,18 | 6,41 | 95,68 | 0,9987 | 29,67% | 249.204 |
| C3O (Sales) | 6,98 / 6,98 / 6,98 / 6,17 | 6,78 | 96,22 | 0,9987 | 29,77% | 258.178 |
| E3 (SC) | 6,97 / 6,97 / 6,97 / 6,38 | 6,82 | 96,28 | 0,9987 | 29,77% | 259.752 |
| Y2 (Purchasing) | 6,99 / 6,99 / 6,99 / 6,00 | 6,74 | 96,12 | 0,9987 | 29,75% | 256.842 |
| **K1 = Pack 2,5 + Orange 2,5 + Mango 2,5 (CHỐT)** | **6,94 / 6,94 / 6,94 / 6,70** | **6,88** | **96,49** | 0,9987 | 29,79% | 262.169 |
| E3 + intake 4 | 6,93 / 6,93 / 6,93 / 6,58 | 6,84 | 96,43 | 0,9987 | 29,82% | 260.003 |

**Vì sao chọn K1:**
- ROI trung bình cao nhất qua các mức trượt.
- Khi game trượt 1,5 điểm vẫn giữ 6,70%. C3 chỉ còn 5,18%.
- Chỉ nhường 0,14 điểm ROI so với C3, nằm trong ngân sách 0,2 điểm.
- Đáp ứng mức không-nhường của mọi phòng: Pack SS ≥ 2, Vitamin C SS ≥ 3, F&G ≥ 96%, giữ 3 NCC rẻ.
- **Cả 4 điểm phòng đều tốt hơn R1:**
  - Purchasing: CI 1,0256 → 0,9987.
  - Ops: 32,40% → 29,79%.
  - SC: tồn 289.258 → 262.169.
  - Sales: doanh thu bằng R1, có thưởng ở cả 3 khách.

**Phải trả giá gì:**
- Tồn tăng khoảng €13k so với C3.
- Số lần nhận PET và Orange tăng mạnh vì lot 0,5 tuần.
- Rủi ro NCC mới (mục 6).

## 5. Bộ quyết định Round 2 để nhập game (★ = đổi so với R1)

| Phòng | Ô | R1 | **R2** |
|---|---|---|---|
| Purchasing | Pack | Mono Packaging Materials | ★ **Swenska Cartons**: điều kiện niêm yết (Pallet, High, window 1 week, payment 4, agreed 90%) |
| | PET | Philyp Jones Plastics (FTL) | giữ |
| | Orange | Miami Oranges | giữ |
| | Mango | NO8DO Mango | ★ **Tampa Fruits**: niêm yết (IBC, Boat, Middle, window 1 week, payment 2, agreed 93%) |
| | Vitamin C | SYI | ★ **AIL Vitamins**: niêm yết (Drum, Truck, Middle, window 1 day, payment 4, agreed 96%) |
| Supply Chain | NL Pack: SS / lot (tuần) | 3 / 4 | ★ **2,5 / 2** |
| | NL PET | 2 / 2 | ★ 2 / **0,5** |
| | NL Orange | 2 / 2 | ★ **2,5 / 0,5** |
| | NL Mango | 2 / 4 | ★ **2,5 / 2** |
| | NL Vitamin C | 4 / 4 | giữ |
| | Frozen period | 3 | giữ |
| | TP Orange 1L: interval / SS | 10 / 3 | ★ **7** / 3 |
| | TP C-power 1L | 10 / 3 | ★ 10 / **2,5** |
| | TP Mango 1L | 10 / 2,5 | ★ **7** / 2,5 |
| | TP Orange PET, Mango PET | 10 / 2,5 | giữ |
| | TP C-power PET | 10 / 3 | ★ 10 / **2,5** |
| Operations | Kho NL: chỗ / FTE / intake | 800 / 3 / 5 | ★ **650 / 2** / 5 |
| | Increase speed | No | ★ **Yes** |
| | Kho TP: chỗ / FTE | 1.350 / 3 | ★ **1.200** / 3 |
| | Training, PM (A little), SMED, 2 ca, Swiss Fill 2, Fruitmix MQ, inspection tắt | | giữ |
| Sales | Điều khoản 3 khách | SL 95% order lines, shelf life 75%, payment 4, promotion Middle/Short | giữ (xem mục 7) |
| | Shortage rule | Customer priority: F&G > LAND > Dominick's | giữ |

Model cho bộ này: **ROI 6,94%** (R1 model 5,36%). SL F&G / LAND / Dom 96,49 / 96,75 / 97,84%; adherence 91,0%; obsolete 6,1%; cube NL 77,7%, TP 85,5%; không cảnh báo đỏ; tuổi tồn TP ≤ 4,5/5 tuần; mẻ C-power PET 11.640 L.

## 6. Rủi ro còn lại (phải biết khi trình bày)

- **Reliability của NCC mới là ước lượng** (cam kết − 2,7 điểm): Swenska ≈ 87,3%, Tampa ≈ 90,3%, AIL ≈ 93,3%. R1 cho thấy cách ước lượng cũ đã quá bi quan, nhưng mới chỉ có 2 NCC làm bằng chứng.
- **Tampa:** free capacity chỉ 2%, không certified. Model không mô hình free capacity, chỉ có safety stock Mango 2,5 tuần che. Nếu đội lo, dùng phương án dự phòng: **giữ NO8DO Mango** (vẫn SS 2,5): ROI 6,80% (−0,14), CI TB 1,0186, SL F&G 96,51%.
- **Quality Middle cho Mango và Vitamin C:** game có thể hủy thành phẩm không đạt vị (thư "Component quality"). Model chưa đo riêng việc này.
- **Lot 0,5 tuần:** nằm ngoài vùng dữ liệu đã hiệu chỉnh (R0 lot 4, R1 lot 2). Số lần nhận tăng mạnh nên giờ nhận hàng kho NL có thể cao hơn model. Ops đã stress: 2 FTE vẫn rẻ hơn 3 FTE cho tới khi đỉnh giờ cao hơn model khoảng 30%.
- **Nhiễu game:** cùng quyết định, ROI R-2 so với R0 lệch khoảng 1 điểm. Phép thử trượt chính là để chịu được nhiễu này.

## 7. Việc làm TRONG game trước khi Calculate

1. **Purchasing:** chọn Swenska, Tampa, AIL, rồi ghi CI game hiện ra vào ô "CI game hiển thị" trên web (CI niêm yết: Swenska 0,988, Tampa 0,9587, AIL 1,023). Kiểm ROI trên web lần cuối.
2. **Sales (đòn bẩy chưa đo, không tính vào ROI ở trên):** bấm thử Negotiate. Chỉ nhận điều khoản nếu CI game vượt ngưỡng hòa vốn, theo thứ tự:
   - Dominick's trade unit Pallet → Pallet layer: cần CI +0,09%.
   - Payment term 4 → 6 tuần: cần CI +0,54% mỗi khách.
   - Deadline Dominick's 12 → 14 giờ: model chưa tính chi phí.
   - KHÔNG đổi shelf life (tuổi tồn sẽ vượt), KHÔNG đổi SL type sang Orders, KHÔNG hứa SL > 95% cho F&G và LAND.
3. **Supply Chain:** kiểm tra game có nhận safety stock 2,5 và lot 0,5 tuần không. Ô cho phép 0–8 / 0–26 tuần, R1 đã nhập được 2,5.
4. **Cả nhóm:** chụp bản chung trên web (snapshot "R2 – K1"), rồi bấm Calculate một lần.
