// Kiểm tra dữ liệu Excel tự nhất quán (chạy lại mỗi khi thay file vòng mới).
import { describe, expect, it } from 'vitest';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import { dataChecks } from '../src/model/dataChecks';
import { baselineInputs, simulate } from '../src/model/simulate';

const d = data as unknown as Round0Data;

describe('Kiểm tra dữ liệu Excel', () => {
  it.each(dataChecks(d).map((c) => [c.label, c] as const))('%s', (_l, c) => {
    expect(Math.abs(c.a.value - c.b.value), `${c.a.name} ${c.a.value} vs ${c.b.name} ${c.b.value}`).toBeLessThanOrEqual(c.tol + 1e-9);
  });
});

describe('Phân rã ROI', () => {
  const f = simulate(baselineInputs(d), d).finance;
  it('ROI = Operating profit / Investment; các nút con cộng đúng', () => {
    const b = f.breakdown;
    expect(b.roi).toBeCloseTo(f.operatingProfit / f.investment, 12);
    expect(b.operatingProfit.value).toBeCloseTo(f.operatingProfit, 6);
    const [gm, opex] = b.operatingProfit.children!;
    expect((gm.value ?? 0) + (opex.value ?? 0)).toBeCloseTo(f.operatingProfit, 6);
    expect(b.investment.value).toBeCloseTo(f.investment, 6);
  });
  it('R0 của cây khớp P&L game; AR/AP tách riêng ghi "thiếu dữ liệu"', () => {
    const b = f.breakdown;
    expect(b.operatingProfit.r0).toBeCloseTo(d.finance.totals.operatingProfit, -1);
    expect(b.investment.r0).toBe(d.finance.totals.investment);
    const wc = b.investment.children!.find((c) => c.id === 'wc')!;
    const pt = wc.children!.find((c) => c.id === 'pt')!;
    expect(pt.children!.every((c) => c.status === 'missing' && c.value === null)).toBe(true);
  });
});
