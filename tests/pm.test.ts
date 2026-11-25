// Kiểm tra preventive maintenance (luật: Minimal 1 giờ/tuần, −30% hỏng; Extensive 3 giờ/tuần, −50% hỏng).
// Câu hỏi người dùng 25/11: giờ bảo trì đã bị trừ khỏi công suất dây chuyền chưa? Vì sao Extensive hơn Minimal ~1 điểm ROI?
import { afterEach, describe, expect, it } from 'vitest';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs, PM } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { BOTTLING } from '../src/model/rules';
import { COEFFS } from '../src/model/assumptions';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const sim = (pm: PM, f: (i: Inputs) => void = () => {}) => { const i: Inputs = structuredClone(base); i.ops.preventiveMaintenance = pm; f(i); return simulate(i, d); };
const w0 = COEFFS.maintenanceDisruptionWeight.value;
afterEach(() => { COEFFS.maintenanceDisruptionWeight.value = w0; });

describe('PM: giờ bảo trì có trừ vào công suất dây chuyền', () => {
  it('luật PM đúng định mức (Minimal 1 giờ −30%, Extensive 3 giờ −50%)', () => {
    expect(BOTTLING.pm.Minimal).toEqual({ hoursPerWeek: 1, breakdownReduction: 0.3 });
    expect(BOTTLING.pm.Extensive).toEqual({ hoursPerWeek: 3, breakdownReduction: 0.5 });
  });
  it.each(['Minimal', 'Extensive'] as PM[])('%s: giờ tải = run + changeover + breakdown + giờ bảo trì; breakdown giảm đúng tỷ lệ', (pm) => {
    const n = sim('None').opsRaw.line, r = sim(pm).opsRaw.line;
    expect(r.maintenance).toBe(BOTTLING.pm[pm].hoursPerWeek);
    expect(r.needHours).toBeCloseTo(r.run + r.changeover + r.breakdown + r.maintenance, 9);
    expect(r.breakdown).toBeCloseTo(n.breakdown * (1 - BOTTLING.pm[pm].breakdownReduction), 9);
    // giờ tải thay đổi = giờ bảo trì thêm − giờ hỏng bớt
    expect(r.needHours - n.needHours).toBeCloseTo(r.maintenance - (n.breakdown - r.breakdown), 9);
  });
  it('lời giờ ròng gần bằng nhau: Minimal ≈ 2,2 giờ/tuần, Extensive ≈ 2,4 giờ/tuần → overtime và chi phí thời vụ chênh rất ít', () => {
    const n = sim('None'), m = sim('Minimal'), e = sim('Extensive');
    const netM = n.opsRaw.line.needHours - m.opsRaw.line.needHours, netE = n.opsRaw.line.needHours - e.opsRaw.line.needHours;
    expect(netM).toBeGreaterThan(2); expect(netM).toBeLessThan(2.5);
    expect(netE).toBeGreaterThan(2); expect(netE).toBeLessThan(2.6);
    expect(Math.abs(m.opsRaw.line.overtime - e.opsRaw.line.overtime)).toBeLessThan(0.5);
    const flex = (r: ReturnType<typeof sim>) => r.finance.rows.find((x) => /^Flexible manpower \(bottling\)/.test(x.label))!.value;
    expect(Math.abs(flex(m) - flex(e))).toBeLessThan(0.03 * flex(n));
  });
});

describe('PM: chênh lệch Minimal / Extensive đến từ plan adherence (hệ số maintenanceDisruptionWeight)', () => {
  it('mặc định (hệ số 0): giờ PM không tính là gián đoạn → Extensive có plan adherence cao hơn Minimal (hỏng đột xuất ít hơn)', () => {
    expect(COEFFS.maintenanceDisruptionWeight.value).toBe(0);
    const m = sim('Minimal'), e = sim('Extensive');
    expect(e.opsRaw.line.capacityAdherence).toBeGreaterThan(m.opsRaw.line.capacityAdherence + 0.01);
    expect(e.finance.roi).toBeGreaterThan(m.finance.roi);
  });
  it('hệ số = 1 (coi giờ PM như giờ hỏng): Minimal và Extensive gần như bằng nhau về plan adherence', () => {
    COEFFS.maintenanceDisruptionWeight.value = 1;
    const m = sim('Minimal'), e = sim('Extensive');
    expect(Math.abs(e.opsRaw.line.capacityAdherence - m.opsRaw.line.capacityAdherence)).toBeLessThan(0.005);
  });
  it('baseline R0 (không PM) không phụ thuộc hệ số: ROI vẫn −7,68%', () => {
    COEFFS.maintenanceDisruptionWeight.value = 1;
    expect((sim('None').finance.roi * 100).toFixed(2)).toBe('-7.68');
  });
});
