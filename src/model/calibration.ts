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
  /** Chuỗi 130 ngày R0 (tab 11) quy ra đơn vị: tồn NL (cái/lít), tồn TP (đv), giờ công 2 kho */
  replay: {
    rmUnits: Record<ComponentKey, number[]>;
    fgUnits: Record<SkuKey, number[]>;
    rmHours: number[];
    fgHours: number[];
  };
  /** Tỷ lệ changeover tính như size changeover */
  sizeShare: number;
  /** Giờ hỏng máy trên mỗi giờ chạy, ở điều kiện R0 */
  breakdownPerRunHour: number;
  /** Hệ số biến thiên giờ tải dây chuyền theo tuần */
  loadCv: number;
  /** Độ nhạy plan adherence với (breakdown + overtime) / giờ dây chuyền */
  adherenceK: number;
  /** Hệ số năng suất thời vụ: giờ thời vụ trả tiền / giờ thiếu (từ dây chuyền R0; kho TP xác nhận độc lập) */
  flexProductivity: number;
  /** Availability sản phẩm (tích availability NL) — số R0 */
  skuAvailability: Record<SkuKey, number>;
  notes: CalibrationNote[];
}

export interface CalibrationNote {
  id: string;
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

  // 3. Chuỗi theo ngày (tab 11). "Tồn (tuần)" tính theo nhu cầu DỰ BÁO các tuần tới; proxy dự báo =
  //    TB nhu cầu thực tuần hiện tại và tuần sau (tab 12). Kiểm chứng: proxy này tái tạo phí overflow
  //    kho NL (≈ €37,7k vs €35,4k) và kho TP (≈ €555 vs €607) của P&L R0; dùng nhu cầu TB thì không.
  const wk = new Map(data.weekly.weeks.map((w) => [w.week, w.demand]));
  const days = data.daily.filter((r) => r.day >= 1).sort((a, b) => a.day - b.day);
  const fcst = (sku: SkuKey, day: number) => {
    const w = Math.min(26, Math.max(1, Math.ceil(day / ROUND.daysPerWeek)));
    return ((wk.get(w)?.[sku] ?? 0) + (wk.get(Math.min(26, w + 1))?.[sku] ?? 0)) / 2;
  };
  const rmUnits = {} as Record<ComponentKey, number[]>;
  for (const c of COMPONENTS) {
    rmUnits[c] = days.map((r) => r.rmWeeks[c] * data.products.reduce((s, p) => s + p.bom[c] * fcst(p.key, r.day), 0) * prodFactor);
  }
  const fgUnits = {} as Record<SkuKey, number[]>;
  for (const s of SKUS) fgUnits[s] = days.map((r) => r.fgWeeks[s] * fcst(s, r.day));
  const replay = { rmUnits, fgUnits, rmHours: days.map((r) => r.rmHours), fgHours: days.map((r) => r.fgHours) };

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
  const flexProductivity = flexLine / (r.line.overtime * ROUND.weeks * line.workersPerShift * WAREHOUSE.flexPerHour);
  // Kiểm chứng: kho TP R0 — giờ vượt giờ cố định theo tab 11 × €42 × hệ số ≈ Outbound flexible manpower
  const fgFixedDay = (data.ops.decisions.fgFte * WAREHOUSE.fteHoursPerWeek) / ROUND.daysPerWeek;
  const fgExcess = replay.fgHours.reduce((s, h) => s + Math.max(0, h - fgFixedDay), 0);
  const fgFlexR0 = data.finance.lines.find((l) => /^Outbound flexible/i.test(l.label))?.value ?? 0;
  const rmFixedDay = (data.ops.decisions.rmFte * WAREHOUSE.fteHoursPerWeek) / ROUND.daysPerWeek;
  const rmExcess = replay.rmHours.reduce((s, h) => s + Math.max(0, h - rmFixedDay), 0);
  const rmFlexR0 = data.finance.lines.find((l) => /^Inbound flexible/i.test(l.label))?.value ?? 0;

  const notes: CalibrationNote[] = [
    { id: 'prodFactor', label: 'Sản lượng sản xuất / nhu cầu', value: fmt(prodFactor, 4), derivation: `Bao bì tiêu thụ R0 (Pack + PET = ${fmt(packUse, 0)}/tuần) ÷ nhu cầu 6 SKU (${fmt(unitDemand, 0)} đv/tuần). Phần dư ≈ obsolete + reject + bù tồn.`, matchesByConstruction: [] },
    { id: 'orderRatio', label: 'Cỡ đơn hàng NL / (lot size × lượng mua/tuần)', value: COMPONENTS.map((c) => `${c} ${fmt(orderRatio[c], 2)}`).join(' · '), derivation: 'Cỡ đơn hàng thực tế R0 (tab 7) lớn hơn lot size × nhu cầu khoảng 10–20%; giữ tỷ lệ này khi đổi lot size.', matchesByConstruction: [] },
    { id: 'replay', label: 'Dao động theo ngày (tab 11)', value: 'Replay 130 ngày R0', derivation: 'Tồn NL/TP và giờ công 2 kho theo từng ngày lấy từ tab 11 (tồn tuần × nhu cầu dự báo ≈ TB tuần này + tuần sau). Mô hình = mức TB mô hình + dao động R0 × (cỡ lô mới / cỡ lô R0). Tồn TB mô hình = lý thuyết (SS + ½ lô) × (TB tab 11 / lý thuyết R0).', matchesByConstruction: ['Đỉnh pallet', 'Số ngày vượt sức chứa', 'Overflow (2 kho)', 'Đỉnh & số ngày vượt giờ cố định (gần đúng)'] },
    { id: 'sizeShare', label: 'Tỷ lệ changeover tính như size changeover', value: `${fmt(sizeShare * 100, 0)}% (thô ${fmt(sizeShareRaw * 100, 0)}%)`, derivation: `R0: ${r.line.changeover} giờ/tuần ÷ ${fmt(coPerWeek, 1)} changeover/tuần = ${fmt(avgCo, 2)} giờ/lần ≈ size changeover (${line.sizeChangeoverH} giờ) của ${line.name}.`, matchesByConstruction: ['Changeover (giờ/tuần)'] },
    { id: 'breakdownPerRunHour', label: 'Giờ hỏng máy / giờ chạy (điều kiện R0)', value: fmt(breakdownPerRunHour, 4), derivation: `R0: breakdown ${r.line.breakdown} ÷ run ${r.line.run}. Điều kiện R0: PET Poor, tolerance ${line.tolerance}, không PM, không training, không inspection.`, matchesByConstruction: ['Breakdown (giờ/tuần)'] },
    { id: 'loadCv', label: 'Biến động giờ tải dây chuyền theo tuần (CV)', value: `${fmt(loadCv * 100, 1)}%`, derivation: `Giờ tải tuần ~ chuẩn(TB, CV×TB). Chọn CV để giờ không dùng TB = ${r.line.unused} khi tải TB = ${fmt(need, 1)} và ${C} giờ ca. Overtime suy ra = ${fmt(r.line.unused + need - C, 1)}.`, matchesByConstruction: ['Unused (giờ/tuần)', 'Overtime (giờ/tuần)'] },
    { id: 'adherenceK', label: 'Độ nhạy plan adherence', value: fmt(adherenceK, 3), derivation: `Adherence = [1 − k × (breakdown + overtime)/(giờ ca + overtime)] × availability NL của SKU. R0: adherence ${r.line.planAdherence}, availability TB ${fmt(meanAvail, 3)} → phần năng lực ${fmt(capAdh, 3)}. Kiểm chứng: SKU C-power có adherence thấp ≈ 0,70 = 0,84 × availability Vitamin C 0,843.`, matchesByConstruction: ['Production plan adherence'] },
    { id: 'flexProductivity', label: 'Hệ số năng suất thời vụ', value: fmt(flexProductivity, 3), derivation: `Dây chuyền: Flexible manpower (bottling) R0 €${fmt(flexLine, 0)} ÷ (overtime ${r.line.overtime} giờ/tuần × 26 × ${line.workersPerShift} người × €42). Áp cho cả 2 kho. Kiểm chứng độc lập: kho TP R0 có ${fmt(fgExcess, 1)} giờ vượt (tab 11) × €42 × hệ số = €${fmt(fgExcess * 42 * flexProductivity, 0)} vs P&L €${fmt(fgFlexR0, 0)}; kho NL ${fmt(rmExcess, 1)} giờ → €${fmt(rmExcess * 42 * flexProductivity, 0)} vs €${fmt(rmFlexR0, 0)}. Khớp với ghi chú Info Center "thời vụ năng suất thấp hơn".`, matchesByConstruction: ['Flexible manpower (bottling) €'] },
  ];

  return { prodFactor, orderRatio, replay, sizeShare, breakdownPerRunHour, loadCv, adherenceK, flexProductivity, skuAvailability, notes };
}
