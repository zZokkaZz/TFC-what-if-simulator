// M4 — Finance đầy đủ: mọi dòng P&L có nguồn; dòng giữ R0 không bao giờ đổi; đẳng thức P&L / ROI đúng ở mọi kịch bản;
// Distribution costs theo pallet giao (neo tab 2, không dùng luật €31).
import { describe, expect, it } from 'vitest';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs, Results } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { LINE_BASIS, lineBasis } from '../src/model/finance';
import { customerPicking } from '../src/model/sales';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => { const i: Inputs = structuredClone(base); f(i); return simulate(i, d); };
const row = (r: Results, label: string) => r.finance.rows.find((x) => x.label === label)!;
const F = 'Food & Groceries';

// Kịch bản đổi đồng thời mọi phòng — dùng để kiểm dòng giữ R0 và đẳng thức
const SCENARIOS: [string, (i: Inputs) => void][] = [
  ['R0', () => {}],
  ['Ops: 3 ca, SMED, PM Extensive, training, kho TP 1.200', (i) => { Object.assign(i.ops, { shifts: 3, smed: true, preventiveMaintenance: 'Extensive', breakdownTraining: true, fgPalletLocations: 1200 }); }],
  ['SC: SS TP 2, interval 5, lot NL 2', (i) => { for (const s of Object.values(i.sc.products)) Object.assign(s, { safetyStockWeeks: 2, productionIntervalDays: 5 }); for (const c of Object.values(i.sc.components)) c.lotSizeWeeks = 2; }],
  ['Purchasing: Vitamin C → SYI, payment term PET 8', (i) => { i.purchasing.suppliers['Vitamin C'] = d.purchasing.market.find((m) => m.component === 'Vitamin C' && m.supplier !== base.purchasing.suppliers['Vitamin C'])!.supplier; i.purchasing.terms.PET.paymentTermWeeks = 8; }],
  ['Sales: F&G Heavy, SL 97, shelf 80, payment 6, Box, CI game', (i) => { Object.assign(i.sales.customers[F], { promotionalPressure: 'Heavy', serviceLevel: 0.97, shelfLife: 0.8, paymentTermWeeks: 6, tradeUnit: 'Box (outer box)', ciGame: 1.02 }); }],
  ['Tất cả cùng lúc', (i) => { Object.assign(i.ops, { shifts: 3, smed: true }); for (const s of Object.values(i.sc.products)) s.safetyStockWeeks = 4; Object.assign(i.sales.customers["Dominick's"], { promotionalPressure: 'None', paymentTermWeeks: 2 }); }],
];

describe('M4: mọi dòng P&L (tab 2) có nguồn và lý do', () => {
  it('không dòng nào thiếu nhãn nguồn; mỗi mẫu trong LINE_BASIS khớp ít nhất 1 dòng (không có mẫu chết)', () => {
    for (const r of b.finance.rows.filter((x) => !x.isTotal)) {
      expect(r.basis, r.label).toBeDefined();
      expect((r.why ?? '').length, r.label).toBeGreaterThan(10);
    }
    for (const m of LINE_BASIS) expect(d.finance.lines.some((l) => m.re.test(l.label)) || b.finance.rows.some((r) => r.isNew && m.re.test(r.label.replace(/ \(dòng mới\)$/, ''))), String(m.re)).toBe(true);
  });
  it('dòng giữ R0 đúng như người dùng chốt: Energy, Water, Other, Interest, Contracted suppliers, Outbound order lines/orders, Fixed', () => {
    const kept = b.finance.rows.filter((r) => r.basis === 'r0').map((r) => r.label).sort();
    expect(kept).toEqual(['Contracted suppliers', 'Energy', 'Fixed', 'Interest', 'Other', 'Outbound order lines', 'Outbound orders', 'Water'].sort());
    for (const l of d.finance.lines) expect(lineBasis(l.group, l.label), l.label).not.toBeNull();
  });
  it.each(SCENARIOS)('%s: dòng giữ R0 luôn = đúng số tab 2', (_n, f) => {
    const r = run(f);
    for (const x of r.finance.rows.filter((y) => y.basis === 'r0')) expect(x.value, x.label).toBe(d.finance.lines.find((l) => l.label === x.label)!.value);
  });
});

describe('M4: đẳng thức P&L / ROI đúng ở mọi kịch bản', () => {
  it.each(SCENARIOS)('%s', (_n, f) => {
    const r = run(f), F_ = r.finance;
    const sum = (re: RegExp) => F_.rows.filter((x) => !x.isTotal && re.test(x.group)).reduce((s, x) => s + x.value, 0);
    expect(F_.realizedRevenue).toBeCloseTo(sum(/^Doanh thu/), 6);
    expect(F_.realizedRevenue).toBeCloseTo(r.sales.realizedRevenue, 6);
    expect(F_.cogs).toBeCloseTo(sum(/mua NL/) + sum(/sản xuất/), 6);
    expect(F_.grossMargin).toBeCloseTo(F_.realizedRevenue - F_.cogs, 6);
    expect(F_.indirectCost).toBeCloseTo(sum(/^Indirect/), 6);
    expect(F_.operatingProfit).toBeCloseTo(F_.grossMargin - F_.indirectCost, 6);
    expect(F_.investment).toBeCloseTo(sum(/^Investment/), 6);
    expect(F_.roi).toBeCloseTo(F_.operatingProfit / F_.investment, 12);
    expect(Number.isFinite(F_.roi)).toBe(true);
  });
});

describe('M4: Distribution costs theo pallet giao (neo tab 2, KHÔNG luật €31)', () => {
  it('baseline = đúng tab 2 (192.114), không phải Σ tab 6 (192.114,41) hay €31 × pallet', () => {
    expect(row(b, 'Distribution costs').value).toBe(d.finance.lines.find((l) => l.label === 'Distribution costs')!.value);
    expect(b.sales.distribution).toBe(b.sales.distributionR0);
  });
  it('F&G promotion Heavy: phí phân phối khách tăng đúng tỷ lệ pallet giao; dòng P&L tăng; khách khác không đổi', () => {
    const i: Inputs = structuredClone(base); i.sales.customers[F].promotionalPressure = 'Heavy';
    const r = simulate(i, d);
    const p1 = customerPicking(d, i).find((x) => x.customer === F)!.palletsPerWeek, p0 = customerPicking(d).find((x) => x.customer === F)!.palletsPerWeek;
    const cu = r.sales.customers.find((x) => x.customer === F)!;
    expect(cu.distribution).toBeCloseTo(cu.distributionR0 * (p1 / p0), 6);
    expect(row(r, 'Distribution costs').value).toBeGreaterThan(row(b, 'Distribution costs').value);
    for (const o of r.sales.customers.filter((x) => x.customer !== F)) expect(o.distribution).toBe(o.distributionR0);
  });
  it('promotion None → phí phân phối giảm; đổi trade unit (không đổi lượng) → không đổi', () => {
    expect(row(run((i) => { i.sales.customers[F].promotionalPressure = 'None'; }), 'Distribution costs').value).toBeLessThan(row(b, 'Distribution costs').value);
    expect(row(run((i) => { i.sales.customers[F].tradeUnit = 'Box (outer box)'; }), 'Distribution costs').value).toBe(row(b, 'Distribution costs').value);
  });
});
