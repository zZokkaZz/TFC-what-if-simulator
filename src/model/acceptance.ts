// Bảng hiệu chỉnh (CLAUDE.md mục 7): chỉ số Ops, số R0 thật (đọc từ Excel), sai số chấp nhận.
// Dùng chung cho test, script báo cáo và giao diện.
import type { Round0Data } from '../data/types';
import type { Results } from './types';
import { EST, type Est } from './assumptions';
import { getCalibration } from './simulate';
import { r0DailyStock } from './ops';

export interface Check {
  id: string;
  label: string;
  unit: '%' | 'giờ/tuần' | '€' | 'L' | 'pallet' | 'giờ/ngày' | 'ngày';
  r0: number;
  model: number;
  tol: { abs?: number; rel?: number }; // abs: theo điểm % hoặc đơn vị; rel: tỷ lệ
  calibrated: boolean; // true = chỉ số được dùng để tính hệ số hiệu chỉnh (khớp do cấu tạo)
  derived?: boolean; // số R0 dựng lại từ tab 11 (game không in trực tiếp)
  ok: boolean;
  diff: number; // model − r0
}

/** Sai số cho phép = max(abs, rel × |R0|). */
export const allowed = (c: { r0: number; tol: { abs?: number; rel?: number } }) => Math.max(c.tol.abs ?? 0, (c.tol.rel ?? 0) * Math.abs(c.r0));

export function opsChecks(data: Round0Data, res: Results, est: Est = EST): Check[] {
  const r = data.ops.results;
  const o = res.opsRaw; // đo độ chính xác của MÔ HÌNH THÔ (số hiển thị đã neo vào R0)
  const ovfR0 = data.finance.lines.find((l) => /^Overflow raw/i.test(l.label))?.value ?? 0;
  const ovfFgR0 = data.finance.lines.find((l) => /^Overflow finished/i.test(l.label))?.value ?? 0;
  const st = r0DailyStock(data, getCalibration(data), est);
  const dd = data.daily.filter((x) => x.day >= 1);
  const d = data.ops.decisions;
  const over = (a: number[], lim: number) => a.filter((x) => x > lim + 1e-9).length;
  const DAYS = { rel: 0.3, abs: 3 };
  const rows: Omit<Check, 'ok' | 'diff'>[] = [
    { id: 'rmUtil', label: 'Kho NL utilization', unit: '%', r0: r.rm.utilization, model: o.rm.utilization, tol: { abs: 0.05 }, calibrated: false },
    { id: 'rmOverflow', label: 'Kho NL overflow', unit: '%', r0: r.rm.overflow, model: o.rm.overflowShare, tol: { abs: 0.05 }, calibrated: false },
    { id: 'rmOverflowCost', label: 'Phí overflow kho NL', unit: '€', r0: ovfR0, model: o.rm.overflowCost, tol: { rel: 0.2 }, calibrated: false },
    { id: 'rmPeakHours', label: 'Kho NL đỉnh giờ công', unit: 'giờ/ngày', r0: Math.max(...dd.map((x) => x.rmHours)), model: o.rm.peakDayHours, tol: { rel: 0.15 }, calibrated: true },
    { id: 'rmDaysAbove', label: 'Kho NL số ngày vượt giờ cố định', unit: 'ngày', r0: data.dailyStats.rmDaysAboveFixed, model: o.rm.daysAboveFixed, tol: DAYS, calibrated: true },
    { id: 'rmPeakPallets', label: 'Kho NL đỉnh pallet', unit: 'pallet', r0: Math.max(...st.rmPallets), model: o.rm.peakPallets, tol: { rel: 0.15 }, calibrated: true, derived: true },
    { id: 'rmDaysOver', label: 'Kho NL số ngày vượt sức chứa', unit: 'ngày', r0: over(st.rmPallets, d.rmPalletLocations), model: o.rm.daysOverCapacity, tol: DAYS, calibrated: true, derived: true },
    { id: 'rmFlex', label: 'Thời vụ kho NL', unit: '€', r0: data.finance.lines.find((l) => /^Inbound flexible/i.test(l.label))?.value ?? 0, model: o.rm.flexCost, tol: { rel: 0.25 }, calibrated: false },
    { id: 'fgUtil', label: 'Kho TP utilization', unit: '%', r0: r.fg.utilization, model: o.fg.utilization, tol: { abs: 0.05 }, calibrated: false },
    { id: 'fgOverflow', label: 'Kho TP overflow', unit: '%', r0: r.fg.overflow, model: o.fg.overflowShare, tol: { abs: 0.05 }, calibrated: false },
    { id: 'fgOverflowCost', label: 'Phí overflow kho TP', unit: '€', r0: ovfFgR0, model: o.fg.overflowCost, tol: { rel: 0.5 }, calibrated: false },
    { id: 'fgPeakHours', label: 'Kho TP đỉnh giờ công', unit: 'giờ/ngày', r0: Math.max(...dd.map((x) => x.fgHours)), model: o.fg.peakDayHours, tol: { rel: 0.15 }, calibrated: true },
    { id: 'fgDaysAbove', label: 'Kho TP số ngày vượt giờ cố định', unit: 'ngày', r0: data.dailyStats.fgDaysAboveFixed, model: o.fg.daysAboveFixed, tol: DAYS, calibrated: true },
    { id: 'fgPeakPallets', label: 'Kho TP đỉnh pallet', unit: 'pallet', r0: Math.max(...st.fgPallets), model: o.fg.peakPallets, tol: { rel: 0.15 }, calibrated: true, derived: true },
    { id: 'fgDaysOver', label: 'Kho TP số ngày vượt sức chứa', unit: 'ngày', r0: over(st.fgPallets, d.fgPalletLocations), model: o.fg.daysOverCapacity, tol: DAYS, calibrated: true, derived: true },
    { id: 'fgFlex', label: 'Thời vụ kho TP', unit: '€', r0: data.finance.lines.find((l) => /^Outbound flexible/i.test(l.label))?.value ?? 0, model: o.fg.flexCost, tol: { rel: 0.25 }, calibrated: false },
    { id: 'rmHours', label: 'Giờ công kho NL', unit: 'giờ/tuần', r0: r.rm.hoursPerWeek, model: o.rm.hoursPerWeek, tol: { rel: 0.15 }, calibrated: false },
    { id: 'fgHours', label: 'Giờ công kho TP', unit: 'giờ/tuần', r0: r.fg.hoursPerWeek, model: o.fg.hoursPerWeek, tol: { rel: 0.15 }, calibrated: false },
    { id: 'run', label: `${r.line.name} run time`, unit: 'giờ/tuần', r0: r.line.run, model: o.line.run, tol: { rel: 0.15 }, calibrated: false },
    { id: 'changeover', label: `${r.line.name} changeover`, unit: 'giờ/tuần', r0: r.line.changeover, model: o.line.changeover, tol: { rel: 0.15 }, calibrated: true },
    { id: 'breakdown', label: `${r.line.name} breakdown`, unit: 'giờ/tuần', r0: r.line.breakdown, model: o.line.breakdown, tol: { rel: 0.15 }, calibrated: true },
    { id: 'unused', label: `${r.line.name} unused`, unit: 'giờ/tuần', r0: r.line.unused, model: o.line.unused, tol: { rel: 0.15 }, calibrated: true },
    { id: 'overtime', label: `${r.line.name} overtime`, unit: 'giờ/tuần', r0: r.line.overtime, model: o.line.overtime, tol: { rel: 0.15 }, calibrated: true },
    { id: 'adherence', label: 'Production plan adherence', unit: '%', r0: r.line.planAdherence, model: o.line.planAdherence, tol: { abs: 0.05 }, calibrated: true },
    { id: 'startup', label: 'Start-up productivity loss', unit: '€', r0: r.line.startupLossEur, model: o.line.startupLossEur, tol: { rel: 0.2 }, calibrated: false },
    { id: 'cleaning', label: `${r.mixer.name} cleaning time`, unit: '%', r0: r.mixer.cleaningShare, model: o.mixer.cleaningShare, tol: { rel: 0.1 }, calibrated: false },
    { id: 'avgLot', label: `${r.mixer.name} lô trung bình`, unit: 'L', r0: r.mixer.avgLotL, model: o.mixer.avgLotL, tol: { rel: 0.1 }, calibrated: false },
  ];
  return rows.map((c) => {
    const diff = c.model - c.r0;
    const ok = Math.abs(diff) <= allowed(c) + 1e-9;
    return { ...c, diff, ok };
  });
}

/** Các dòng chi phí Ops so với P&L R0 (để báo cáo, không phải tiêu chí mục 7). */
export function opsCostChecks(data: Round0Data, res: Results) {
  return res.finance.rows
    .filter((r) => r.modeled && !r.isTotal && !r.isNew && r.r0 !== null)
    .map((r) => ({ label: r.label, r0: r.r0 as number, model: r.value, diff: r.value - (r.r0 as number), rel: r.r0 ? (r.value - (r.r0 as number)) / (r.r0 as number) : 0 }))
    .concat([{ label: '— Indirect cost (tổng)', r0: data.finance.totals.indirectCost, model: res.finance.indirectCost, diff: res.finance.indirectCost - data.finance.totals.indirectCost, rel: res.finance.indirectCost / data.finance.totals.indirectCost - 1 }])
    .concat([{ label: '— ROI', r0: data.finance.totals.roi, model: res.finance.roi, diff: res.finance.roi - data.finance.totals.roi, rel: 0 }]);
}
