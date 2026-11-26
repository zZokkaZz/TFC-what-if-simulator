# Prompt trích xuất dữ liệu Round 1 từ game (dùng với Claude chat có trình duyệt)

Làm 4 lần, mỗi lần 1 tài khoản/phòng ban. Mỗi lần dán **Phần chung** + **Phần riêng** của phòng đó. Cả 4 lần ghi vào CÙNG một Google Sheet (share cho 4 tài khoản), mỗi lần thêm tab mới. Xong: File → Download → .xlsx → upload lên repo tên `TFC Round 1.xlsx` ở thư mục gốc, báo Claude Code.

## Phần chung

```text
Bạn là người nhập liệu cẩn thận. Vào game The Fresh Connection (tài khoản đã đăng nhập sẵn), CHỈ ĐỌC, chép số liệu ROUND 1 của phòng ban ghi bên dưới vào Google Sheet. Đây là dữ liệu thi thật, phải chép đúng tuyệt đối.

LUẬT BẮT BUỘC
1. CHỈ ĐỌC. Không bấm Save, Calculate, Negotiate, Deal, Submit, không đổi bất kỳ ô quyết định nào. Nếu một màn hình chỉ hiện ô nhập để sửa thì chỉ đọc giá trị đang hiện.
2. Ở thanh "Round" bên trái chọn 1 trước khi chép. Ô A1 của mỗi tab ghi "Round 1 — <Phòng> > <tên màn hình>".
3. Chép NGUYÊN VĂN số trên màn hình: không làm tròn, không tính thêm, không đổi đơn vị. Game dùng dấu phẩy ngăn nghìn và dấu chấm thập phân (67,394 / 0.2231) → nhập vào Sheet thành số 67394 / 0.2231; % nhập dạng % (96.1%); € bỏ ký hiệu, ghi số.
4. Ô trống trên game → để trống. Không thấy số → ghi "thiếu". TUYỆT ĐỐI không đoán.
5. Giữ đúng tên cột tiếng Anh như game, đúng thứ tự cột và thứ tự dòng. Dòng 2 của mỗi tab là tiêu đề cột.
6. Dòng tổng (in nghiêng/in đậm, vd "Fressie Orange 1 liter") chép thành 1 dòng riêng, ghi "TỔNG" ở cột thứ hai.
7. Bảng dài phải cuộn: chép đủ mọi dòng. Xong mỗi bảng, đếm số dòng và so với màn hình.
8. Dashboard: với mỗi biểu đồ, chép số của từng round −2, −1, 0, 1 (rê chuột vào điểm nếu số không hiện sẵn). Chép nguyên văn các câu nhận xét bên phải.
9. Decision log và các màn hình quyết định: chép MỌI ô quyết định đang áp dụng cho Round 1 (tên ô | giá trị), kể cả ô không đổi so với Round 0. Nếu decision log có cột thời gian/người sửa thì chép luôn.
10. Mỗi màn hình = 1 tab, đặt tên đúng như danh sách bên dưới.
11. Cuối cùng tạo tab README_<PHÒNG>: liệt kê các tab đã chép, số dòng mỗi tab, chỗ nào ghi "thiếu" và vì sao.
```

## Phần riêng 1 — Purchasing

```text
PHÒNG: PURCHASING. Vào mục Purchasing, chọn Round 1, chép các màn hình sau:
- R1_Pur_dashboard: 4 biểu đồ (ROI, Rejection components, Raw material costs, Delivery reliability suppliers) + nhận xét.
- R1_Pur_supplier: bảng đầy đủ theo từng nhà cung cấp đang dùng (supplier, component, contract index, quality, lead time, transport, trade unit, delivery window, payment term, agreed reliability, delivery reliability thực tế, rejection, purchase value, transport costs, số lần giao, order size, free capacity, certification... mọi cột game có).
- R1_Pur_component: bảng theo từng nguyên liệu.
- R1_Pur_analysis: mọi bảng trên màn hình analysis.
- R1_Pur_decisions: toàn bộ điều khoản hợp đồng đang áp dụng cho 5 nguyên liệu (mở từng hợp đồng/agreement để đọc, không bấm Negotiate/Calculate).
- R1_Pur_decisionlog: nguyên văn decision log.
- Nếu tài khoản xem được Finance (menu trái): chép thêm tab R1_Finance = toàn bộ P&L và Investment từng dòng.
```

## Phần riêng 2 — Operations

```text
PHÒNG: OPERATIONS. Vào mục Operations, chọn Round 1, chép:
- R1_Ops_dashboard: 4 biểu đồ (ROI, Cube utilization raw materials warehouse, Cube utilization finished goods warehouse, Production plan adherence) + nhận xét.
- R1_Ops_warehousing: mọi bảng của kho nguyên liệu, kho thành phẩm, tank yard (capacity/pallet locations, usage, cube utilization, overflow % và €, số nhân viên, giờ công/tuần, flexible hours, inspection...).
- R1_Ops_mixing_bottling: máy trộn (lô trung bình, cleaning %, giờ chạy...) và dây chuyền (Run, Changeover, Breakdown, Unused, Overtime theo giờ/tuần và %, Production plan adherence, Start-up productivity loss, outsourced, preventive maintenance...).
- R1_Ops_analysis: mọi bảng.
- R1_Ops_decisions: mọi ô quyết định đang áp dụng (RM inspection 5 nguyên liệu, pallet locations, FTE, intake time, mixer, bottling line, số ca, PM, training, SMED, increase speed, kho TP pallet locations, FTE).
- R1_Ops_decisionlog: nguyên văn.
- R1_Finance (QUAN TRỌNG NHẤT, nếu tài khoản xem được menu Finance bên trái): toàn bộ P&L và Investment từng dòng (Revenue/Penalty/Bonus từng khách, Purchase value từng NCC, Production costs từng dòng, Indirect costs từng dòng, Investment từng dòng, Gross margin, Operating profit, ROI).
```

## Phần riêng 3 — Sales

```text
PHÒNG: SALES. Vào mục Sales, chọn Round 1, chép:
- R1_Sales_dashboard: 4 biểu đồ (ROI, Gross margin (customer), Obsolete products, Service level outbound order lines) + nhận xét.
- R1_Sales_customer: theo từng khách (revenue, contract index, attained contract index, service level pieces/order lines/orders, OSA, gross margin, distribution cost, attained shelf life, order lines, shipments... mọi cột).
- R1_Sales_product: theo từng SKU (demand, price, gross margin, service level, obsolete, forecast error/MAPE, bias... mọi cột).
- R1_Sales_customer_product và R1_Sales_product_customer: chép đủ cả 2 bảng.
- R1_Sales_analysis: mọi bảng.
- R1_Sales_decisions: điều khoản hợp đồng từng khách (mở agreements, chỉ đọc: service level type, service level, shelf life, order deadline, trade unit, payment term, promotional pressure, promotion horizon, contract index), ord.mgmt (shortage rule, thứ tự customer priority), cat.mgmt (SKU bán cho từng khách).
- R1_Sales_decisionlog: nguyên văn.
```

## Phần riêng 4 — Supply Chain

```text
PHÒNG: SUPPLY CHAIN. Vào mục Supply Chain, chọn Round 1, chép:
- R1_SC_dashboard: 4 biểu đồ (ROI, Availability components, Stock components (weeks), Stock products (weeks)) + nhận xét.
- R1_SC_component: theo từng nguyên liệu (stock pieces/liters, stock weeks, stock value, economic inventory, availability, obsolete, bias, số lần giao, order size... mọi cột).
- R1_SC_product: theo từng SKU (stock weeks, stock value, economic inventory, obsolete, service level pieces/order lines, MAPE, bias, plan adherence, batches, start-up loss, rejects... mọi cột).
- R1_SC_analysis: mọi bảng; nếu có biểu đồ tồn kho theo ngày/tuần thì chép vào tab R1_SC_daily (mỗi dòng 1 ngày/tuần, mỗi cột 1 nguyên liệu/SKU), chỗ không đọc được ghi "thiếu".
- R1_SC_decisions: safety stock và lot size 5 nguyên liệu; production interval và safety stock 6 SKU; frozen period.
- R1_SC_decisionlog: nguyên văn.
```
