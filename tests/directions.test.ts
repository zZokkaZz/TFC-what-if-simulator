// Kiểm tra HƯỚNG tác động: đổi một quyết định → chỉ số liên quan phải đổi đúng chiều.
import { describe, expect, it } from 'vitest';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => {
  const i: Inputs = structuredClone(base);
  f(i);
  return simulate(i, d);
};

describe('Hướng tác động Ops', () => {
  it('thêm ca → ít overtime, adherence ↑, lương cố định ↑', () => {
    const r = run((i) => { i.ops.shifts = 3; });
    expect(r.ops.line.overtime).toBeLessThan(b.ops.line.overtime);
    expect(r.ops.line.unused).toBeGreaterThan(b.ops.line.unused);
    expect(r.ops.line.planAdherence).toBeGreaterThan(b.ops.line.planAdherence);
    expect(r.ops.costs.find((c) => c.id === 'linePerm')!.value).toBeGreaterThan(b.ops.costs.find((c) => c.id === 'linePerm')!.value);
  });
  it('1 ca → overtime rất lớn và có thể thuê ngoài', () => {
    const r = run((i) => { i.ops.shifts = 1; });
    expect(r.ops.line.overtime).toBeGreaterThan(30);
  });
  it('SMED → changeover giảm 30%', () => {
    const r = run((i) => { i.ops.smed = true; });
    expect(r.ops.line.changeover).toBeCloseTo(b.ops.line.changeover * 0.7, 6);
    expect(r.ops.line.planAdherence).toBeGreaterThan(b.ops.line.planAdherence);
  });
  it('Increase speed → run giảm, start-up loss € tăng (mất nhiều lít hơn/giờ)', () => {
    const r = run((i) => { i.ops.increaseSpeed = true; });
    expect(r.ops.line.run).toBeLessThan(b.ops.line.run);
    expect(r.ops.line.startupLossEur).toBeGreaterThan(b.ops.line.startupLossEur);
  });
  it('PM Extensive → breakdown −50% nhưng mất 3 giờ/tuần', () => {
    const r = run((i) => { i.ops.preventiveMaintenance = 'Extensive'; });
    expect(r.ops.line.breakdown).toBeCloseTo(b.ops.line.breakdown * 0.5, 6);
    expect(r.ops.line.maintenance).toBe(3);
  });
  it('Training → breakdown −40%', () => {
    const r = run((i) => { i.ops.breakdownTraining = true; });
    expect(r.ops.line.breakdown).toBeCloseTo(b.ops.line.breakdown * 0.6, 6);
  });
  it('RM inspection PET → thêm giờ kho NL, giảm hỏng máy', () => {
    const r = run((i) => { i.ops.rmInspection.PET = true; });
    expect(r.ops.rm.hoursPerWeek).toBeGreaterThan(b.ops.rm.hoursPerWeek);
    expect(r.ops.line.breakdown).toBeLessThan(b.ops.line.breakdown);
  });
  it('thêm pallet location kho NL → overflow giảm, phí chỗ tăng', () => {
    const r = run((i) => { i.ops.rmPalletLocations = 1200; });
    expect(r.ops.rm.overflowCost).toBeLessThan(b.ops.rm.overflowCost);
    expect(r.ops.costs.find((c) => c.id === 'rmPallets')!.value).toBe(120_000);
  });
  it('giảm pallet kho TP 1.500 → 1.100 → tiết kiệm chỗ, overflow nhỏ', () => {
    const r = run((i) => { i.ops.fgPalletLocations = 1100; });
    expect(r.ops.costs.find((c) => c.id === 'fgPallets')!.value).toBe(110_000);
    expect(r.ops.fg.overflowCost).toBeGreaterThan(0);
  });
  it('bớt FTE → thời vụ tăng', () => {
    const r = run((i) => { i.ops.rmFte = 2; i.ops.fgFte = 2; });
    expect(r.ops.rm.flexHours).toBeGreaterThan(b.ops.rm.flexHours);
    expect(r.ops.fg.flexHours).toBeGreaterThan(b.ops.fg.flexHours);
  });
  it('intake time dài hơn → đỉnh giờ công kho NL thấp hơn', () => {
    const r = run((i) => { i.ops.intakeDays = 10; });
    expect(r.ops.rm.peakDayHours).toBeLessThan(b.ops.rm.peakDayHours);
  });
  it('máy trộn FMM 4000 (mẻ 3.000–6.000 L) → nhiều mẻ hơn, giờ trộn tăng', () => {
    const r = run((i) => { i.ops.mixer = 'FMM 4000'; });
    expect(r.ops.mixer.lotsPerWeek).toBeGreaterThan(b.ops.mixer.lotsPerWeek);
    expect(r.ops.machinesInvestment).toBe(250_000 + 490_000);
  });
  it('MegaChurn 20 + interval 1 ngày → mẻ bị làm tròn lên 15.000 L (dư)', () => {
    const r = run((i) => { i.ops.mixer = 'MegaChurn 20'; for (const k of Object.keys(i.sc.products)) i.sc.products[k as keyof typeof i.sc.products].productionIntervalDays = 1; });
    expect(r.ops.mixer.excessLitersPerWeek).toBeGreaterThan(0);
  });
  it('SC lot size NL nhỏ hơn → kho NL bớt pallet, nhiều lần nhận hơn', () => {
    const r = run((i) => { for (const k of Object.keys(i.sc.components)) i.sc.components[k as keyof typeof i.sc.components].lotSizeWeeks = 2; });
    expect(r.ops.rm.avgPallets).toBeLessThan(b.ops.rm.avgPallets);
    expect(r.ops.rm.orderLinesPerWeek).toBeGreaterThan(b.ops.rm.orderLinesPerWeek);
  });
  it('SC production interval ngắn hơn → nhiều changeover hơn', () => {
    const r = run((i) => { for (const k of Object.keys(i.sc.products)) i.sc.products[k as keyof typeof i.sc.products].productionIntervalDays = 5; });
    expect(r.ops.line.changeover).toBeCloseTo(b.ops.line.changeover * 2, 6);
  });
  it('0 FTE kho NL → bật cảnh báo thời vụ > 50%', () => {
    const r = run((i) => { i.ops.rmFte = 0; });
    expect(r.ops.rm.flexWarn).toBe(true);
    expect(b.ops.rm.flexWarn).toBe(false);
  });
  it('lot size NL lớn hơn → đỉnh giờ công kho NL cao hơn', () => {
    const r = run((i) => { for (const k of Object.keys(i.sc.components)) i.sc.components[k as keyof typeof i.sc.components].lotSizeWeeks = 8; });
    expect(r.ops.rm.peakDayHours).toBeGreaterThan(b.ops.rm.peakDayHours);
    expect(r.ops.rm.peakPallets).toBeGreaterThan(b.ops.rm.peakPallets);
  });
  it('production interval dài hơn → đỉnh pallet kho TP cao hơn', () => {
    const r = run((i) => { for (const k of Object.keys(i.sc.products)) i.sc.products[k as keyof typeof i.sc.products].productionIntervalDays = 15; });
    expect(r.ops.fg.peakPallets).toBeGreaterThan(b.ops.fg.peakPallets);
  });
  it('đổi dây chuyền MultiFlex 1 → đầu tư máy giảm', () => {
    const r = run((i) => { i.ops.bottlingLine = 'MultiFlex 1'; });
    expect(r.ops.machinesInvestment - b.ops.machinesInvestment).toBe(425_000 - 490_000);
  });
  it('số chỗ tối ưu chi phí không đắt hơn số chỗ hiện tại', () => {
    for (const w of [b.ops.rm, b.ops.fg]) expect(w.costAtOptimal).toBeLessThanOrEqual(w.capacity * 100 + w.overflowCost + 1e-6);
  });
  it('baseline lặp lại đúng (hàm thuần)', () => {
    expect(simulate(base, d).finance.roi).toBe(b.finance.roi);
  });
});
