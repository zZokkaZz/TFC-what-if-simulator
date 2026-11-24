// HỆ SỐ HIỆU CHỈNH — tính TỰ ĐỘNG từ số Round 0 trong file Excel (không gõ tay).
// Mỗi hệ số đều có mô tả để hiện trên giao diện và ghi trong ASSUMPTIONS.md.
// Chỉ số nào dùng để hiệu chỉnh thì "khớp R0 do cấu tạo" — bảng hiệu chỉnh ghi rõ điều này.
import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import { BOTTLING, ROUND, WAREHOUSE } from './rules';
import { bisect, expectedBelow } from './stats';
import { COMPONENTS } from './purchasing';
import { SKUS } from './sales';

export interface Calibration {
  /** Sản lượng sản xuất / nhu cầu (gồm obsolete, reject, bù tồn) */
  prodFactor: number;
  /** Cỡ đơn hàng thực tế R0 / (lot size × lượng mua mỗi tuần) */
  orderRatio: Record<ComponentKey, number>;
  /** Tồn TP thực tế R0 / tồn lý thuyết (SS + nửa chu kỳ sản xuất) */
  fgRealization: Record<SkuKey, number>;
  /** Tỷ lệ changeover tính như size changeover */
  sizeShare: number;
  /** Giờ hỏng máy trên mỗi giờ chạy, ở điều kiện R0 */
  breakdownPerRunHour: number;
  /** Hệ số biến thiên giờ tải dây chuyền theo tuần */
  loadCv: number;
  /** Độ nhạy plan adherence với (breakdown + overtime) / giờ dây chuyền */
  adherenceK: number;
  /** Chi phí thời vụ dây chuyền thực tế / (overtime × công nhân/ca × €42) */
  bottlingFlexFactor: number;
  /** Availability sản phẩm (tích availability NL) — số R0 */
  skuAvailability: Record<SkuKey, number>;
  notes: CalibrationNote[];
}

export interface CalibrationNote {
  id: keyof Omit<Calibration, 'notes' | 'skuAvailability' | 'orderRatio' | 'fgRealization'> | 'orderRatio' | 'fgRealization';
  label: string;
  value: string;
  derivation: string;
  matchesByConstruction: string[];
}

const fmt = (x: number, d = 3) => x.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: 0 });

export function calibrate(data: Round0Data): Calibration {
  const r = data.ops.results;
  const line = data.ops.lines.find((l) => l.name === data.ops.decisions.bottlingLine)!;

  // 1. Hệ số sản xuất: lượng bao bì tiêu thụ / số đơn vị sản phẩm bán (cả Pack và PET đều 1 cái/đv)
  const packUse = data.supplyChain.componentStock.filter((c) => c.component === 'Pack' || c.component === 'PET').reduce((s, c) => s + c.demandPerWeek, 0);
  const unitDemand = data.products.reduce((s, p) => s + p.demandPerWeek, 0);
  const prodFactor = packUse / unitDemand;

  // 2. Tỷ lệ cỡ đơn hàng
  const orderRatio = {} as Record<ComponentKey, number>;
  for (const c of COMPONENTS) {
    const st = data.supplyChain.componentStock.find((x) => x.component === c)!;
    const lot = data.supplyChain.components.find((x) => x.component === c)!.lotSizeWeeks;
    const purchasedPerWeek = st.purchasedInRound / ROUND.weeks;
    orderRatio[c] = st.orderSize / (lot * purchasedPerWeek);
  }

  // 3. Tồn TP thực tế / lý thuyết
  const fgRealization = {} as Record<SkuKey, number>;
  for (const s of SKUS) {
    const st = data.supplyChain.productStock.find((x) => x.sku === s)!;
    const dec = data.supplyChain.products.find((x) => x.sku === s)!;
    fgRealization[s] = st.stockWeeks / (dec.safetyStockWeeks + dec.productionIntervalDays / ROUND.daysPerWeek / 2);
  }

  // 4. Changeover: giờ changeover R0 / số changeover mỗi tuần
  const coPerWeek = data.supplyChain.products.reduce((s, p) => s + ROUND.daysPerWeek / p.productionIntervalDays, 0);
  const avgCo = r.line.changeover / coPerWeek;
  const sizeShareRaw = (avgCo - line.formulaChangeoverH) / (line.sizeChangeoverH - line.formulaChangeoverH);
  const sizeShare = Math.min(1, Math.max(0, sizeShareRaw));

  // 5. Hỏng máy
  const breakdownPerRunHour = r.line.breakdown / r.line.run;

  // 6. Biến động tải: chọn CV sao cho E[giờ không dùng] = unused R0 khi nhu cầu TB = run+changeover+breakdown R0
  const need = r.line.run + r.line.changeover + r.line.breakdown;
  const C = BOTTLING.shiftHours[data.ops.decisions.shifts];
  const loadCv = bisect((cv) => expectedBelow(need, cv * need, C) - r.line.unused, 0.001, 1.5);

  // 7. Plan adherence = adherence năng lực × availability NL
  const avail = (sku: SkuKey) => {
    const p = data.products.find((x) => x.key === sku)!;
    return COMPONENTS.filter((c) => p.bom[c] > 0).reduce((s, c) => s * data.supplyChain.componentStock.find((x) => x.component === c)!.availability, 1);
  };
  const skuAvailability = Object.fromEntries(SKUS.map((s) => [s, avail(s)])) as Record<SkuKey, number>;
  const batches = data.supplyChain.products.map((p) => ({ sku: p.sku, w: 1 / p.productionIntervalDays }));
  const wSum = batches.reduce((s, b) => s + b.w, 0);
  const meanAvail = batches.reduce((s, b) => s + (b.w / wSum) * skuAvailability[b.sku], 0);
  const capAdh = r.line.planAdherence / meanAvail;
  const disruption = (r.line.breakdown + r.line.overtime) / (C + r.line.overtime);
  const adherenceK = (1 - capAdh) / disruption;

  // 8. Thời vụ dây chuyền
  const flexLine = data.finance.lines.find((l) => /Flexible manpower \(bottling\)/i.test(l.label))?.value ?? 0;
  const bottlingFlexFactor = flexLine / (r.line.overtime * ROUND.weeks * line.workersPerShift * WAREHOUSE.flexPerHour);

  const notes: CalibrationNote[] = [
    { id: 'prodFactor', label: 'Sản lượng sản xuất / nhu cầu', value: fmt(prodFactor, 4), derivation: `Bao bì tiêu thụ R0 (Pack + PET = ${fmt(packUse, 0)}/tuần) ÷ nhu cầu 6 SKU (${fmt(unitDemand, 0)} đv/tuần). Phần dư ≈ obsolete + reject + bù tồn.`, matchesByConstruction: [] },
    { id: 'orderRatio', label: 'Cỡ đơn hàng NL / (lot size × lượng mua/tuần)', value: COMPONENTS.map((c) => `${c} ${fmt(orderRatio[c], 2)}`).join(' · '), derivation: 'Cỡ đơn hàng thực tế R0 (tab 7) lớn hơn lot size × nhu cầu khoảng 10–20%; giữ tỷ lệ này khi đổi lot size.', matchesByConstruction: [] },
    { id: 'fgRealization', label: 'Tồn TP thực tế / lý thuyết', value: SKUS.map((s) => `${s} ${fmt(fgRealization[s], 2)}`).join(' · '), derivation: 'Lý thuyết = safety stock + ½ chu kỳ sản xuất (3 + 1 = 4 tuần). R0 thực tế chỉ 2,3–3,4 tuần (hết hàng, plan adherence thấp). Tỷ lệ giữ nguyên khi đổi SS/interval.', matchesByConstruction: ['Kho TP utilization', 'Kho TP usage'] },
    { id: 'sizeShare', label: 'Tỷ lệ changeover tính như size changeover', value: `${fmt(sizeShare * 100, 0)}% (thô ${fmt(sizeShareRaw * 100, 0)}%)`, derivation: `R0: ${r.line.changeover} giờ/tuần ÷ ${fmt(coPerWeek, 1)} changeover/tuần = ${fmt(avgCo, 2)} giờ/lần ≈ size changeover (${line.sizeChangeoverH} giờ) của ${line.name}.`, matchesByConstruction: ['Changeover (giờ/tuần)'] },
    { id: 'breakdownPerRunHour', label: 'Giờ hỏng máy / giờ chạy (điều kiện R0)', value: fmt(breakdownPerRunHour, 4), derivation: `R0: breakdown ${r.line.breakdown} ÷ run ${r.line.run}. Điều kiện R0: PET Poor, tolerance ${line.tolerance}, không PM, không training, không inspection.`, matchesByConstruction: ['Breakdown (giờ/tuần)'] },
    { id: 'loadCv', label: 'Biến động giờ tải dây chuyền theo tuần (CV)', value: `${fmt(loadCv * 100, 1)}%`, derivation: `Giờ tải tuần ~ chuẩn(TB, CV×TB). Chọn CV để giờ không dùng TB = ${r.line.unused} khi tải TB = ${fmt(need, 1)} và ${C} giờ ca. Overtime suy ra = ${fmt(r.line.unused + need - C, 1)}.`, matchesByConstruction: ['Unused (giờ/tuần)', 'Overtime (giờ/tuần)'] },
    { id: 'adherenceK', label: 'Độ nhạy plan adherence', value: fmt(adherenceK, 3), derivation: `Adherence = [1 − k × (breakdown + overtime)/(giờ ca + overtime)] × availability NL của SKU. R0: adherence ${r.line.planAdherence}, availability TB ${fmt(meanAvail, 3)} → phần năng lực ${fmt(capAdh, 3)}. Kiểm chứng: SKU C-power có adherence thấp ≈ 0,70 = 0,84 × availability Vitamin C 0,843.`, matchesByConstruction: ['Production plan adherence'] },
    { id: 'bottlingFlexFactor', label: 'Hệ số chi phí thời vụ dây chuyền', value: fmt(bottlingFlexFactor, 3), derivation: `Flexible manpower (bottling) R0 €${fmt(flexLine, 0)} ÷ (overtime ${r.line.overtime} giờ/tuần × 26 × ${line.workersPerShift} người × €42). >1 có thể do thời vụ năng suất thấp hơn (Info Center).`, matchesByConstruction: ['Flexible manpower (bottling) €'] },
  ];

  return { prodFactor, orderRatio, fgRealization, sizeShare, breakdownPerRunHour, loadCv, adherenceK, bottlingFlexFactor, skuAvailability, notes };
}
