// M3 Sales (service level → penalty → realized revenue): test BẮT BUỘC + hướng tác động + frozen period chưa mô hình.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { adherenceSlSlope } from '../src/model/supplyChain';
import { crossWarnings } from '../src/model/warnings';

const XLSX: typeof import('xlsx') = createRequire(import.meta.url)('xlsx');
const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => { const i: Inputs = structuredClone(base); f(i); return { i, r: simulate(i, d) }; };
const allProd = (i: Inputs, patch: object) => { for (const k of Object.keys(i.sc.products)) Object.assign((i.sc.products as Record<string, object>)[k], patch); };

describe('BẮT BUỘC: giảm safety stock TP 3 → 1 tuần làm ROI XẤU đi', () => {
  const { i, r } = run((x) => allProd(x, { safetyStockWeeks: 1 }));
  it('ROI xấu đi (không được tốt lên)', () => {
    expect(r.finance.roi).toBeLessThan(b.finance.roi);
  });
  it('… và không chỉ vì Investment giảm khi đang lỗ: Operating profit cũng xấu đi vì penalty tăng nhiều hơn phần tiết kiệm tồn kho', () => {
    expect(r.finance.investment).toBeLessThan(b.finance.investment); // tồn ít hơn
    expect(r.finance.operatingProfit).toBeLessThan(b.finance.operatingProfit);
    expect(r.sales.penaltyTotal).toBeLessThan(b.sales.penaltyTotal); // penalty âm → lớn hơn về độ lớn
    expect(r.sales.realizedRevenue).toBeLessThan(b.sales.realizedRevenue);
    for (const c of r.sales.customers) expect(c.slOrderLines).toBeLessThan(c.slOrderLinesR0);
  });
  it('cảnh báo service level ghi số penalty tăng (không còn "chưa tính")', () => {
    const w = crossWarnings(d, base, i, r, b).find((x) => x.id === 'sc-sl')!;
    expect(w.title).toMatch(/penalty tăng €/);
    expect(w.roi[0].delta).toBeLessThan(0);
    expect(JSON.stringify(w)).not.toMatch(/chưa tính penalty|CHƯA trừ penalty/);
  });
  it('giảm từng bước 3 → 2 → 1: ROI giảm dần (đơn điệu)', () => {
    const r2 = run((x) => allProd(x, { safetyStockWeeks: 2 })).r;
    expect(r2.finance.roi).toBeLessThan(b.finance.roi);
    expect(r.finance.roi).toBeLessThan(r2.finance.roi);
  });
});

describe('Service level ← availability NL + plan adherence + safety stock TP', () => {
  it('độ dốc SL theo plan adherence = hồi quy 6 SKU tab 7 (đọc thẳng Excel)', () => {
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(XLSX.readFile('data/TFC_Round0.xlsx').Sheets['7_Supply Chain'], { header: 1, raw: true, defval: null });
    const h = rows.findIndex((x) => (x ?? []).some((c) => /^Service level \(pieces\)$/.test(String(c ?? '').trim())));
    const iS = rows[h].findIndex((c) => /^Service level \(pieces\)$/.test(String(c ?? '').trim()));
    const iA = rows[h].findIndex((c) => /plan adherence/i.test(String(c ?? '')));
    const body = rows.slice(h + 1, h + 7);
    const xs = body.map((x) => x[iA] as number), ys = body.map((x) => x[iS] as number);
    const mx = xs.reduce((a, c) => a + c) / 6, my = ys.reduce((a, c) => a + c) / 6;
    const slope = xs.reduce((s, x, k) => s + (x - mx) * (ys[k] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    expect(adherenceSlSlope(d).slope).toBeCloseTo(slope, 12);
    expect(adherenceSlSlope(d).r2).toBeGreaterThan(0.9);
  });
  it('tăng safety stock Vitamin C → availability NL ↑ → plan adherence C-power ↑ → SL ↑ → penalty ↓ → doanh thu ↑', () => {
    const { r } = run((x) => { x.sc.components['Vitamin C'].safetyStockWeeks = 6; });
    const cp = r.sc.products.find((p) => p.sku === 'C-power 1L')!, cb = b.sc.products.find((p) => p.sku === 'C-power 1L')!;
    expect(cp.componentAvailability).toBeGreaterThan(cb.componentAvailability);
    expect(cp.slPiecesEst).toBeGreaterThan(cb.slPiecesEst);
    expect(r.sales.penaltyTotal).toBeGreaterThan(b.sales.penaltyTotal);
    expect(r.sales.realizedRevenue).toBeGreaterThan(b.sales.realizedRevenue);
  });
  it('thêm ca (plan adherence ↑) → SL ↑ → penalty ↓; đạt SL hứa thì penalty = 0, không âm thành thưởng', () => {
    const { r } = run((x) => { x.ops.shifts = 3; });
    expect(r.ops.line.planAdherence).toBeGreaterThan(b.ops.line.planAdherence);
    expect(r.sales.penaltyTotal).toBeGreaterThan(b.sales.penaltyTotal);
    for (const c of r.sales.customers) {
      expect(c.penalty).toBeLessThanOrEqual(0);
      if (c.slOrderLines >= c.promised) expect(c.penalty).toBe(0);
      expect(c.revenue).toBeLessThanOrEqual(c.contracted);
    }
  });
  it('tăng safety stock TP 3 → 5 → SL ↑ → penalty ↓ (doanh thu ↑)', () => {
    const { r } = run((x) => allProd(x, { safetyStockWeeks: 5 }));
    expect(r.sales.realizedRevenue).toBeGreaterThan(b.sales.realizedRevenue);
  });
  it('penalty tỷ lệ với mức thiếu SL của từng khách (neo R0)', () => {
    const { r } = run((x) => allProd(x, { safetyStockWeeks: 2 }));
    for (const c of r.sales.customers) expect(c.penalty).toBeCloseTo(c.penaltyR0 * (c.shortfall / c.shortfallR0), 6);
  });
  it('Contracted sales giữ R0 (nhu cầu, giá chưa mô hình)', () => {
    const { r } = run((x) => allProd(x, { safetyStockWeeks: 1 }));
    for (const c of r.sales.customers) expect(c.contracted).toBe(b.sales.customers.find((x) => x.customer === c.customer)!.contracted);
  });
});

describe('Frozen period: CHƯA MÔ HÌNH — đổi không đổi số nào', () => {
  it('frozen 3 → 6 và 3 → 0: ROI, doanh thu, SL, gợi ý SS TP giữ nguyên', () => {
    for (const f of [0, 6]) {
      const { i, r } = run((x) => { x.sc.frozenPeriodWeeks = f; });
      expect(r.finance.roi).toBe(b.finance.roi);
      expect(r.sales.realizedRevenue).toBe(b.sales.realizedRevenue);
      r.sc.products.forEach((p, k) => {
        expect(p.slPiecesEst).toBe(b.sc.products[k].slPiecesEst);
        expect(p.recommendedSsWeeks).toBe(b.sc.products[k].recommendedSsWeeks);
      });
      expect(crossWarnings(d, base, i, r, b).find((w) => w.id === 'sc-frozen')!.detail).toMatch(/CHƯA mô hình/);
    }
  });
});
