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

export interface Est {
  /** Hệ số hỏng máy theo chất lượng bao bì (High = 1). */
  qualityBreakdownMult: Record<string, number>;
  /** RM inspection trên NCC bao bì giảm phần hỏng máy do chất lượng kém đi tỷ lệ này. */
  inspectionQualityRelief: number;
  /** Hệ số hỏng máy theo tolerance của dây chuyền (Middle = 1). */
  toleranceMult: Record<string, number>;
  drumsPerPallet: number;
  ibcPerPallet: number;
  /** Một pallet đi qua overflow tính bao nhiêu lần di chuyển (6 phút/lần). */
  overflowMovesPerPallet: number;
  /** Soạn hàng: phần lẻ TB mỗi dòng đơn (tính bằng pallet), soạn theo layer/thùng. */
  pickRemainderPallet: number;
  /** Độ dàn đỉnh giờ nhận hàng theo intake time: dao động × (intake R0 / intake)^mũ. */
  intakeSmoothingExp: number;
  /** Cảnh báo khi giờ thời vụ vượt tỷ lệ này của tổng giờ công kho. */
  flexWarnShare: number;
  /** Biên an toàn khi gợi ý giảm pallet location (trên đỉnh pallet mô hình). */
  capacityMargin: number;
}

export const EST: Est = {
  qualityBreakdownMult: { High: 1, Middle: 1.25, Poor: 1.6 },
  inspectionQualityRelief: 0.5,
  toleranceMult: { Narrow: 1.25, Middle: 1, Wide: 0.8 },
  drumsPerPallet: 4,
  ibcPerPallet: 1,
  overflowMovesPerPallet: 1,
  pickRemainderPallet: 0.5,
  intakeSmoothingExp: 0.5,
  flexWarnShare: 0.5,
  capacityMargin: 0.1,
};

/** Các giả định cho phép chỉnh trên giao diện (tab Giả định), lưu trên máy từng người. */
export const EDITABLE_EST: { path: string; label: string; min: number; max: number; step: number }[] = [
  { path: 'qualityBreakdownMult.Poor', label: 'Hỏng máy khi bao bì Poor (× so với High)', min: 1, max: 3, step: 0.05 },
  { path: 'qualityBreakdownMult.Middle', label: 'Hỏng máy khi bao bì Middle (× so với High)', min: 1, max: 3, step: 0.05 },
  { path: 'inspectionQualityRelief', label: 'RM inspection giảm phần hỏng do bao bì kém (0–1)', min: 0, max: 1, step: 0.05 },
  { path: 'toleranceMult.Narrow', label: 'Hỏng máy dây chuyền tolerance Narrow (× so với Middle)', min: 0.5, max: 2, step: 0.05 },
  { path: 'toleranceMult.Wide', label: 'Hỏng máy dây chuyền tolerance Wide (× so với Middle)', min: 0.5, max: 2, step: 0.05 },
  { path: 'intakeSmoothingExp', label: 'Mũ dàn đỉnh theo intake time', min: 0, max: 1, step: 0.1 },
  { path: 'capacityMargin', label: 'Biên an toàn khi gợi ý giảm pallet location (0–1)', min: 0, max: 0.5, step: 0.05 },
];

export function withEst(over: Record<string, number> | undefined): Est {
  const e: Est = structuredClone(EST);
  for (const [path, v] of Object.entries(over ?? {})) {
    if (!EDITABLE_EST.some((x) => x.path === path) || !Number.isFinite(v)) continue;
    const [a, b] = path.split('.');
    if (b) (e as unknown as Record<string, Record<string, number>>)[a][b] = v;
    else (e as unknown as Record<string, number>)[a] = v;
  }
  return e;
}

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
  { id: 'availability', label: 'Availability nguyên liệu (cho plan adherence)', value: 'R0 (Vitamin C 84,3%…) ± thay đổi theo safety stock/lot size (M2) và NCC: lead time, reliability (M3 Purchasing)', why: 'Dạng cộng thêm so với R0 nên baseline = đúng số game; độ lớn là ước lượng (ASSUMPTIONS.md mục 11, 15).' },
  { id: 'demand', label: 'Nhu cầu, order lines, obsolete', value: 'Giữ số R0 cho tới M2/M3', why: 'Thuộc Sales/SC, chưa mô hình trong M1.' },
  { id: 'daily', label: 'Dao động theo ngày', value: 'Replay 130 ngày tab 11 (tồn tuần × nhu cầu dự báo ≈ TB tuần này + tuần sau), co giãn biên độ theo cỡ lô mới', why: 'Nhịp dao động giữ theo lịch R0 khi đổi interval/lot size; proxy dự báo là ước lượng.' },
  { id: 'intake', label: 'Intake time', value: 'Chỉ dàn đỉnh giờ nhận hàng (dao động × (intake R0/intake)^0,5)', why: 'Tác động lên component availability CHƯA mô hình (M2).' },
  { id: 'flexLimit', label: 'Giới hạn thời vụ', value: 'Không giới hạn; cảnh báo khi giờ vượt > 50% tổng giờ công kho', why: 'Info Center không nêu giới hạn — 0 FTE có thể trông rẻ một cách không thực tế.' },
  { id: 'utilization', label: 'Utilization', value: 'Pallet TB theo ngày ÷ pallet location; overflow tính theo từng ngày', why: '"Cube utilization" không được định nghĩa; usage game in ra cao hơn TB dựng từ tab 11 ~5% (chưa rõ vì sao, không hiệu chỉnh).' },
  { id: 'capacity', label: 'Gợi ý số pallet location', value: 'Đỉnh + 10% biên; và số chỗ tối ưu chi phí (chỗ vs overflow)', why: 'Đỉnh thật phụ thuộc nhu cầu ngẫu nhiên — có thể quá lạc quan.' },
];
