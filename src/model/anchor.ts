// NEO SỐ HIỂN THỊ VÀO SỐ ĐỀ BÀI (CLAUDE.md mục 0):
//   số hiển thị = số R0 trong sheet × (mô hình kịch bản ÷ mô hình baseline)  [plan adherence: R0 + chênh lệch]
// → không đổi quyết định nào thì mọi chỉ số = ĐÚNG số sheet (ROI −7,68%…);
//   mô hình chỉ quyết định PHẦN THAY ĐỔI. Số mô hình thô vẫn giữ trong `opsRaw` để đo độ chính xác.
import type { Round0Data } from '../data/types';
import type { OpsResults, WarehouseResult } from './types';
import { WAREHOUSE } from './rules';

const cl = (x: number, lo = 0, hi = Infinity) => Math.min(hi, Math.max(lo, x));
/** Neo theo TỶ LỆ: R0 × (mô hình mới ÷ mô hình baseline) — giữ đúng các luật dạng % (SMED −30%, PM −50%…).
 *  Baseline mô hình = 0 thì dùng cộng thêm. */
const a = (raw: number, base: number, r0: number, lo = 0, hi = Infinity) => cl(Math.abs(base) > 1e-9 ? r0 * (raw / base) : r0 + (raw - base), lo, hi);
/** Neo CỘNG THÊM cho chỉ số tỷ lệ có trần (plan adherence): R0 + (mới − baseline) */
const add = (raw: number, base: number, r0: number, lo = 0, hi = 1) => cl(r0 + (raw - base), lo, hi);

/** id chi phí Ops ↔ dòng P&L R0 (tab 2) để neo */
const COST_R0: Record<string, RegExp> = {
  lineFixed: /^Bottling line fixed/i,
  linePerm: /^Permanent employees \(bottling\)/i,
  lineFlex: /^Flexible manpower \(bottling\)/i,
  mixerFixed: /^Mixer fixed/i,
  mixerVar: /^Mixer variable/i,
  rmPallets: /^Pallet locations raw/i,
  rmOverflow: /^Overflow raw/i,
  tankYard: /tank yard/i,
  fgPallets: /^Pallet locations finished/i,
  fgOverflow: /^Overflow finished/i,
  inPerm: /^Inbound permanent/i,
  inFlex: /^Inbound flexible/i,
  outPerm: /^Outbound permanent/i,
  outFlex: /^Outbound flexible/i,
};

export function anchorOps(raw: OpsResults, base: OpsResults, data: Round0Data): OpsResults {
  const r0 = data.ops.results;
  const fin = (re: RegExp) => data.finance.lines.find((l) => re.test(l.label))?.value;
  const days = data.daily.filter((x) => x.day >= 1);

  const wh = (w: WarehouseResult, wb: WarehouseResult, o: { util: number; usage: number; overflow: number; ovfEur: number; hours: number; flexEur: number; peak: number; daysAbove: number }): WarehouseResult => {
    const flexCost = a(w.flexCost, wb.flexCost, o.flexEur);
    return {
      ...w,
      utilization: a(w.utilization, wb.utilization, o.util),
      avgPallets: a(w.avgPallets, wb.avgPallets, o.usage),
      overflowShare: a(w.overflowShare, wb.overflowShare, o.overflow, 0, 1),
      overflowCost: a(w.overflowCost, wb.overflowCost, o.ovfEur),
      avgOverflowPallets: a(w.avgOverflowPallets, wb.avgOverflowPallets, (o.ovfEur / WAREHOUSE.overflowPerPalletDay) / 130),
      hoursPerWeek: a(w.hoursPerWeek, wb.hoursPerWeek, o.hours),
      flexCost,
      flexHours: flexCost / WAREHOUSE.flexPerHour,
      peakDayHours: a(w.peakDayHours, wb.peakDayHours, o.peak),
      daysAboveFixed: Math.round(a(w.daysAboveFixed, wb.daysAboveFixed, o.daysAbove, 0, 130)),
    };
  };

  const rm = wh(raw.rm, base.rm, {
    util: r0.rm.utilization, usage: r0.rm.usage, overflow: r0.rm.overflow, ovfEur: fin(COST_R0.rmOverflow) ?? 0,
    hours: r0.rm.hoursPerWeek, flexEur: fin(COST_R0.inFlex) ?? 0, peak: Math.max(...days.map((x) => x.rmHours)), daysAbove: data.dailyStats.rmDaysAboveFixed,
  });
  const fg = wh(raw.fg, base.fg, {
    util: r0.fg.utilization, usage: r0.fg.usage, overflow: r0.fg.overflow, ovfEur: fin(COST_R0.fgOverflow) ?? 0,
    hours: r0.fg.hoursPerWeek, flexEur: fin(COST_R0.outFlex) ?? 0, peak: Math.max(...days.map((x) => x.fgHours)), daysAbove: data.dailyStats.fgDaysAboveFixed,
  });

  const L = raw.line, LB = base.line;
  const run = a(L.run, LB.run, r0.line.run);
  const changeover = a(L.changeover, LB.changeover, r0.line.changeover);
  const breakdown = a(L.breakdown, LB.breakdown, r0.line.breakdown);
  const unused = a(L.unused, LB.unused, r0.line.unused);
  const overtime = a(L.overtime, LB.overtime, r0.line.overtime);
  const needHours = run + changeover + breakdown + L.maintenance;
  const line = {
    ...L, run, changeover, breakdown, unused, overtime, needHours,
    planAdherence: add(L.planAdherence, LB.planAdherence, r0.line.planAdherence),
    startupLossEur: a(L.startupLossEur, LB.startupLossEur, r0.line.startupLossEur),
    freeHours: 168 - needHours,
    bottleneck: L.outsourced > 0.05 || overtime > 0.1 * L.regularHours,
  };
  const mixer = {
    ...raw.mixer,
    cleaningShare: a(raw.mixer.cleaningShare, base.mixer.cleaningShare, r0.mixer.cleaningShare, 0, 1),
    avgLotL: a(raw.mixer.avgLotL, base.mixer.avgLotL, r0.mixer.avgLotL),
  };
  const production = raw.production.map((p) => {
    const pb = base.production.find((x) => x.sku === p.sku)!;
    const st = data.supplyChain.productStock.find((x) => x.sku === p.sku)!;
    return { ...p, adherence: add(p.adherence, pb.adherence, st.planAdherence), startupLossEur: a(p.startupLossEur, pb.startupLossEur, st.startupLossEur) };
  });
  const tankYard = {
    ...raw.tankYard,
    cost: a(raw.tankYard.cost, base.tankYard.cost, fin(COST_R0.tankYard) ?? raw.tankYard.cost),
    avgTanks: a(raw.tankYard.avgTanks, base.tankYard.avgTanks, r0.tankYard.usage ?? base.tankYard.avgTanks),
  };
  const anchored: Record<string, number> = { rmOverflow: rm.overflowCost, fgOverflow: fg.overflowCost, inFlex: rm.flexCost, outFlex: fg.flexCost, tankYard: tankYard.cost };
  const costs = raw.costs.map((c) => {
    if (anchored[c.id] !== undefined) return { ...c, value: anchored[c.id] };
    // Thuê ngoài: R0 = 0 giờ → chỉ tính phần tăng thêm so với baseline mô hình
    if (c.id === 'lineOutsource') return { ...c, value: cl(c.value - base.costs.find((x) => x.id === c.id)!.value) };
    const re = COST_R0[c.id];
    const r0v = re ? fin(re) : undefined;
    if (r0v === undefined) return c; // dòng không có trong P&L R0 (SMED, speed, training, thuê ngoài) = đúng số mô hình (R0 = 0)
    const b = base.costs.find((x) => x.id === c.id)!.value;
    // Dòng tính theo luật đã khớp đúng R0 (phí chỗ, lương cố định, phí máy) → giữ nguyên số luật
    if (Math.abs(b - r0v) < 0.5) return c;
    return { ...c, value: a(c.value, b, r0v) };
  });
  return {
    ...raw, line, mixer, rm, fg, production, tankYard, costs,
    productionCost: costs.filter((c) => c.group === 'production').reduce((s, c) => s + c.value, 0),
    warehouseCost: costs.filter((c) => c.group === 'warehouse').reduce((s, c) => s + c.value, 0),
  };
}
