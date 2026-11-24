// GIẢ ĐỊNH ƯỚC LƯỢNG — không có trong luật game, cũng không suy ra được từ số R0.
// Mỗi mục đều hiện trên giao diện (badge "ước lượng") và được ghi trong ASSUMPTIONS.md.
// Đổi số ở đây thì baseline R0 KHÔNG đổi (các hệ số đều tính tương đối so với điều kiện R0),
// chỉ đổi độ nhạy khi thử kịch bản.

export interface Assumption {
  id: string;
  label: string;
  value: string;
  why: string;
}

export const EST = {
  /** Hệ số hỏng máy theo chất lượng bao bì (High = 1). */
  qualityBreakdownMult: { High: 1, Middle: 1.25, Poor: 1.6 } as Record<string, number>,
  /** RM inspection trên NCC bao bì làm giảm một nửa phần hỏng máy do chất lượng kém. */
  inspectionQualityRelief: 0.5,
  /** Hệ số hỏng máy theo tolerance của dây chuyền (Middle = 1). */
  toleranceMult: { Narrow: 1.25, Middle: 1, Wide: 0.8 } as Record<string, number>,
  /** Số drum (250 L) trên 1 pallet location; IBC chiếm 1 pallet location. */
  drumsPerPallet: 4,
  ibcPerPallet: 1,
  /** Một pallet đi qua overflow tính 1 lần di chuyển (6 phút). */
  overflowMovesPerPallet: 1,
  /** Soạn hàng: phần lẻ trung bình mỗi dòng đơn = nửa pallet (soạn theo layer/thùng); phần chẵn soạn theo pallet. */
  pickRemainderPallet: 0.5,
  /** Thuê ngoài > 168 giờ: đơn giá = 2 × (công nhân/ca × €42/giờ). */
  outsourcingBase: 'flex',
  /** Training: số người = công nhân/ca × số ca, trả 1 lần trong round. */
  trainingPeople: 'workersPerShift×shifts',
  /** Máy trộn chạy cùng giờ với dây chuyền (giờ ca + overtime). */
  mixerSharesLineHours: true,
} as const;

export const ASSUMPTIONS: Assumption[] = [
  { id: 'qualityBreakdown', label: 'Hỏng máy theo chất lượng bao bì', value: 'High ×1 · Middle ×1,25 · Poor ×1,6', why: 'Luật chỉ nói "Quality Poor gây hỏng dây chuyền", không cho độ lớn.' },
  { id: 'inspectionRelief', label: 'Hiệu quả RM inspection lên hỏng máy', value: 'Giảm 50% phần hỏng máy do bao bì kém (chỉ áp cho Pack/PET)', why: 'Luật chỉ nói "giảm hỏng dây chuyền và hàng lỗi", không cho độ lớn.' },
  { id: 'tolerance', label: 'Hỏng máy theo tolerance dây chuyền', value: 'Narrow ×1,25 · Middle ×1 · Wide ×0,8', why: 'Luật chỉ gợi ý "tolerance rộng" chịu bao bì kém tốt hơn.' },
  { id: 'drums', label: 'Quy đổi drum/IBC ra pallet location', value: '4 drum = 1 pallet · 1 IBC = 1 pallet · tank → tank yard', why: 'Không có quy đổi trong Info Center.' },
  { id: 'overflowMoves', label: 'Giờ chuyển overflow', value: '6 phút cho mỗi pallet đi vào overflow (không tính lần ra)', why: 'Định mức ghi "chuyển ra/vào overflow 6 phút/pallet", chưa rõ tính 1 hay 2 lần.' },
  { id: 'picking', label: 'Cách tính soạn hàng', value: 'Phần chẵn soạn theo pallet; mỗi dòng đơn lẻ trung bình nửa pallet, soạn theo layer/thùng', why: 'Nếu tính mọi layer là 1 lần soạn thì giờ kho TP ≈ 200 giờ/tuần, gấp đôi R0 (100).' },
  { id: 'outsourcing', label: 'Chi phí thuê ngoài > 168 giờ', value: '2 × (công nhân/ca × €42) mỗi giờ', why: 'Luật ghi "chi phí gấp 2" nhưng không nói gấp 2 của gì.' },
  { id: 'training', label: 'Số người được training', value: 'Công nhân/ca × số ca, trả 1 lần/round', why: 'Luật ghi €400/người, không rõ bao nhiêu người.' },
  { id: 'mixerHours', label: 'Giờ máy trộn sẵn có', value: 'Bằng giờ dây chuyền (giờ ca + overtime)', why: 'Không có số ca riêng cho máy trộn trong dữ liệu.' },
  { id: 'lineChange', label: 'Chi phí đổi máy trộn/dây chuyền', value: 'Chưa tính (0 €); chỉ đổi phí năm, đầu tư, thông số', why: 'Dữ liệu không có chi phí chuyển đổi.' },
  { id: 'availability', label: 'Availability nguyên liệu (cho plan adherence)', value: 'Giữ số R0 (Vitamin C 84,3%…) cho tới M2/M3', why: 'Availability phụ thuộc NCC và safety stock NL — sẽ mô hình ở M2/M3.' },
  { id: 'demand', label: 'Nhu cầu, order lines, obsolete', value: 'Giữ số R0 cho tới M2/M3', why: 'Thuộc Sales/SC, chưa mô hình trong M1.' },
  { id: 'daily', label: 'Mô phỏng theo ngày', value: 'Lịch đều, không ngẫu nhiên: lô NL về đúng chu kỳ, các SKU sản xuất so le trong chu kỳ', why: 'Game có ngẫu nhiên (nhu cầu, NCC giao trễ) nên đỉnh giờ công thật cao hơn mô hình.' },
];
