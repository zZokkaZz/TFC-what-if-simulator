// V1: ROI "thận trọng" cho các quyết định ảnh hưởng capacity dây chuyền (số ca, SMED, speed, PM, training,
// inspection, interval…). Số chính dùng COEFFS.capacitySlopeB; thận trọng = SL thấp hơn giữa B và C (COEFFS.capacitySlopeC).
import type { Results } from '../model/types';
import { pct } from './format';

/** Có thay đổi phần capacity của plan adherence so với baseline không. */
export function capacityChanged(res: Results, baseRes: Results): boolean {
  return Math.abs(res.opsRaw.line.capacityAdherence - baseRes.opsRaw.line.capacityAdherence) > 1e-9;
}

/** "(thận trọng: −5,60%)" hoặc '' khi không có quyết định ảnh hưởng capacity. */
export function conservativeRoiText(res: Results, baseRes: Results): string {
  return capacityChanged(res, baseRes) ? `(thận trọng: ${pct(res.conservative.roi, 2)})` : '';
}

export const CONSERVATIVE_NOTE =
  'Quyết định ảnh hưởng capacity dây chuyền: số chính dùng độ dốc capacity 0,5 (phương án B); "thận trọng" lấy service level thấp hơn giữa B và độ dốc 0,25 (phương án C) — luôn ≤ số chính. Cả hai là ước lượng, chưa xác minh (tab Giả định & R0 → COEFFS).';
