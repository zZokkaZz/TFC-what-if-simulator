// GIẢ ĐỊNH ƯỚC LƯỢNG — không có trong luật game, cũng không suy ra được từ số R0.
// Mỗi mục đều hiện trên giao diện (badge "ước lượng") và được ghi trong ASSUMPTIONS.md.
// Đổi số ở đây thì baseline R0 KHÔNG đổi (các hệ số đều tính tương đối so với điều kiện R0),
// chỉ đổi độ nhạy khi thử kịch bản.

// ======================= HỆ SỐ ƯỚC LƯỢNG CHƯA XÁC MINH — MỘT CHỖ DUY NHẤT =======================
// Mỗi hệ số: giá trị, nguồn (vì sao chọn số này), trạng thái, dùng ở đâu, kiểm chứng bằng dữ liệu gì.
// Khi có dữ liệu vòng trial: sửa `value` (và `status` → 'đã xác minh', ghi nguồn mới) TẠI ĐÂY rồi chạy `npm run verify`.
// Không gõ lại các số này ở file khác — code và test đều đọc từ COEFFS.

export type CoeffStatus = 'chưa xác minh' | 'đã xác minh';

export interface Coeff {
  value: number;
  label: string;
  unit?: string;
  /** Vì sao chọn số này (luật, dữ liệu, hay đề xuất) */
  source: string;
  status: CoeffStatus;
  /** Code nào dùng; "chưa dùng" = đã đăng ký nhưng chờ người dùng chọn phương án */
  usedIn: string;
  /** Dữ liệu cần có để xác minh / thay số */
  verifyWith: string;
}

export const COEFFS = {
  outOfRangeFactor: {
    value: 2,
    label: 'Mốc "ngoài vùng dữ liệu R0" (mức thiếu SL ÷ mức thiếu R0)',
    unit: 'lần',
    source: 'Quy ước hiển thị do Claude đề xuất khi rà soát 25/11 — không phải luật game. Penalty mỗi khách chỉ có 1 điểm R0, ngoại suy tuyến tính quá 2 lần mức thiếu R0 bị coi là kém tin cậy.',
    status: 'chưa xác minh',
    usedIn: 'src/model/sales.ts (cờ outOfRange)',
    verifyWith: 'Penalty và SL order lines từng khách ở các vòng trial: nếu quan hệ penalty–mức thiếu vẫn tuyến tính ở mức thiếu lớn hơn thì nới mốc.',
  },
  penaltyShortfallExponent: {
    value: 1,
    label: 'Số mũ penalty theo mức thiếu SL (1 = tuyến tính)',
    source: 'Giả định khi làm M3 Sales: penalty = penalty R0 × (mức thiếu mới ÷ mức thiếu R0)^mũ. R0 3 khách cho tỷ lệ penalty/điểm thiếu khác nhau (5,12% / 2,53% / 1,88%) nên không ước lượng được mũ chung.',
    status: 'chưa xác minh',
    usedIn: 'src/model/sales.ts (penalty)',
    verifyWith: 'Ít nhất 2 điểm (SL, penalty) cho cùng một khách từ các vòng trial → ước lượng mũ.',
  },
  capacitySlopeB: {
    value: 0.5,
    label: 'V1 phương án B — độ dốc SL theo plan adherence phần capacity, tại R0',
    unit: 'điểm SL / điểm adherence',
    source: 'Đề xuất (rà soát 25/11): R0 KHÔNG có điểm dữ liệu cho phần capacity (mọi SKU cùng capacity); chọn ≈ ½ độ dốc phần thiếu NL (0,974, hồi quy 6 SKU R0). Dạng bão hòa mũ: tỷ lệ thiếu × e^(−dốc/thiếu TB R0 × Δadherence).',
    status: 'chưa xác minh',
    usedIn: 'src/model/supplyChain.ts (SL dự kiến — SỐ CHÍNH, người dùng chọn 25/11)',
    verifyWith: 'Vòng trial có đổi số ca / SMED / PM: so plan adherence và SL pieces trước–sau.',
  },
  capacitySlopeC: {
    value: 0.25,
    label: 'V1 phương án C — độ dốc SL theo plan adherence phần capacity, tại R0 (thận trọng)',
    unit: 'điểm SL / điểm adherence',
    source: 'Như phương án B nhưng giảm một nửa (≈ ¼ độ dốc phần thiếu NL), cùng dạng bão hòa mũ.',
    status: 'chưa xác minh',
    usedIn: 'src/model/supplyChain.ts (SL thận trọng = min(B, C) — hiện kèm "thận trọng")',
    verifyWith: 'Như phương án B.',
  },
  scrapObsoleteElasticity: {
    value: 1,
    label: 'C2 — Costs of scrap theo giá trị obsolete (mũ co giãn)',
    source: 'Giả định (C2, 25/11): Costs of scrap = số R0 tab 2 (€40.203) × (giá trị obsolete/tuần mới ÷ R0)^mũ. R0: obsolete 4.421 €/tuần × 26 = 114.946 € ≠ scrap 40.203 € → quan hệ chính xác chưa rõ (có thể tính theo giá vốn hoặc gồm rejects).',
    status: 'chưa xác minh',
    usedIn: 'src/model/finance.ts (Costs of scrap)',
    verifyWith: 'Costs of scrap và obsolete value các vòng trial có đổi safety stock TP / production interval.',
  },
  obsoleteAgeSpreadScale: {
    value: 2,
    label: 'C2 — độ phân tán tuổi tồn kịch bản so với σ hiệu chỉnh R0',
    unit: 'lần',
    source: 'Giả định (C2, 25/11): tuổi lúc xuất ~ Đều[SS, SS + chu kỳ] + Chuẩn(0, σ); σ từng SKU hiệu chỉnh để khớp obsolete R0 tab 7 (8,4/7,1/8,8/8,2/5,5/8,0%). Người dùng chọn = 2 (25/11): R0 nằm sát mép 5 tuần (SS 3 + chu kỳ 2) nên hiệu chỉnh từ 1 điểm cho σ quá nhỏ (~0,4 tuần); MAPE dự báo 47–61% (tab 7) cho thấy tuổi hàng phải phân tán rộng hơn. Baseline không phụ thuộc hệ số này.',
    status: 'chưa xác minh',
    usedIn: 'src/model/supplyChain.ts (obsolete theo tuổi tồn)',
    verifyWith: 'Obsolete từng SKU ở vòng trial có production interval hoặc safety stock TP khác R0.',
  },
  maintenanceDisruptionWeight: {
    value: 0,
    label: 'Giờ bảo trì có kế hoạch (PM) tính vào "gián đoạn" của plan adherence, so với giờ hỏng đột xuất',
    unit: '× giờ hỏng',
    source: 'Giả định (kiểm tra PM, 25/11): plan adherence = 1 − k × (breakdown + overtime + thuê ngoài) ÷ (giờ ca + overtime), k hiệu chỉnh R0 (R0 không có PM). Giờ PM đã cộng vào tải dây chuyền (→ overtime, chi phí) nhưng mặc định KHÔNG tính như hỏng đột xuất vì là việc có kế hoạch. Hệ quả: Extensive (−50% hỏng, 3 giờ) hơn Minimal (−30% hỏng, 1 giờ) ~1,7 điểm adherence dù giờ tải ròng gần bằng nhau. Đặt = 1 nếu coi mọi giờ mất như nhau.',
    status: 'chưa xác minh',
    usedIn: 'src/model/ops.ts (plan adherence)',
    verifyWith: 'Plan adherence vòng trial có bật PM Minimal hoặc Extensive (so với R0 None).',
  },
} satisfies Record<string, Coeff>;

export type CoeffId = keyof typeof COEFFS;

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
  { id: 'demand', label: 'Nhu cầu, order lines', value: 'Giữ số R0', why: 'Chưa có ô quyết định hợp đồng Sales (nhu cầu, promotion).' },
  { id: 'obsolete', label: 'Obsolete & Costs of scrap (C2)', value: 'Theo tuổi tồn: tuổi lúc xuất ≈ Đều[SS, SS + chu kỳ] + phân tán σ (hiệu chỉnh R0 × 2); vượt hạn dùng × (1 − shelf life khách đòi) thì hủy; scrap = €40.203 × tỷ lệ giá trị obsolete', why: 'Game không công bố công thức (ASSUMPTIONS.md mục 18).' },
  { id: 'obsoleteRework', label: 'CHƯA MÔ HÌNH: sản xuất bù hàng hủy', value: 'Hàng obsolete bị hủy KHÔNG kéo theo sản xuất bù (không thêm giờ dây chuyền, máy trộn, nguyên liệu) và KHÔNG làm giảm hàng bán / service level; giờ hủy hàng kho TP vẫn theo obsolete R0', why: 'Luật: "hàng hết hạn → hủy + sản xuất lại" nhưng không có độ lớn. Hệ quả: khi obsolete tăng (interval dài, safety stock TP cao) ROI vẫn còn lạc quan hơn thực tế.' },
  { id: 'daily', label: 'Dao động theo ngày', value: 'Replay 130 ngày tab 11 (tồn tuần × nhu cầu dự báo ≈ TB tuần này + tuần sau), co giãn biên độ theo cỡ lô mới', why: 'Nhịp dao động giữ theo lịch R0 khi đổi interval/lot size; proxy dự báo là ước lượng.' },
  { id: 'intake', label: 'Intake time', value: 'Chỉ dàn đỉnh giờ nhận hàng (dao động × (intake R0/intake)^0,5)', why: 'Tác động lên component availability CHƯA mô hình (M2).' },
  { id: 'flexLimit', label: 'Giới hạn thời vụ', value: 'Không giới hạn; cảnh báo khi giờ vượt > 50% tổng giờ công kho', why: 'Info Center không nêu giới hạn — 0 FTE có thể trông rẻ một cách không thực tế.' },
  { id: 'utilization', label: 'Utilization', value: 'Pallet TB theo ngày ÷ pallet location; overflow tính theo từng ngày', why: '"Cube utilization" không được định nghĩa; usage game in ra cao hơn TB dựng từ tab 11 ~5% (chưa rõ vì sao, không hiệu chỉnh).' },
  { id: 'capacity', label: 'Gợi ý số pallet location', value: 'Đỉnh + 10% biên; và số chỗ tối ưu chi phí (chỗ vs overflow)', why: 'Đỉnh thật phụ thuộc nhu cầu ngẫu nhiên — có thể quá lạc quan.' },
];
