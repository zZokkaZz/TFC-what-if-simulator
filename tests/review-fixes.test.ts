// Sửa theo review (26/11): 6 mục. Số lấy từ dữ liệu / hàm, không gõ lại.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs, Results } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { buildKpis } from '../src/model/kpi';
import { defaultTerms, effectivePayWeeks, specOf } from '../src/model/purchasing';
import { tradeUnitSize } from '../src/model/supplyChain';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => { const i: Inputs = structuredClone(base); f(i); return simulate(i, d); };
const V = 'Vitamin C';
const vc = (r: Results) => r.sc.components.find((c) => c.key === V)!;
const syi = (i: Inputs) => { i.purchasing.suppliers[V] = 'SYI'; i.purchasing.terms[V] = defaultTerms(d, V, 'SYI'); };

describe('1. Availability NL: neo tỷ lệ trên phần thiếu, không có trần cứng', () => {
  it('baseline = đúng availability tab 7 (Vitamin C 84,3%…)', () => {
    for (const c of b.sc.components) expect(c.availability).toBe(d.supplyChain.componentStock.find((x) => x.component === c.key)!.availability);
  });
  it('SYI + safety stock 6 tuần → Vitamin C ≥ 97%', () => {
    expect(vc(run((i) => { syi(i); i.sc.components[V].safetyStockWeeks = 6; })).availability).toBeGreaterThanOrEqual(0.97);
  });
  it('safety stock Vitamin C tăng → availability tăng dần; 26 tuần vượt xa mức kẹt cũ (89,0%)', () => {
    const av = [2, 3, 4, 6, 10, 26].map((ss) => vc(run((i) => { i.sc.components[V].safetyStockWeeks = ss; })).availability);
    for (let k = 1; k < av.length; k++) expect(av[k]).toBeGreaterThanOrEqual(av[k - 1]);
    expect(av[1]).toBeGreaterThan(av[0]);
    expect(av[av.length - 1]).toBeGreaterThan(0.95);
  });
  it('xấu đi neo cộng (không nổ): Orange Miami → NCC lead time dài hơn, reliability thấp hơn → giảm = Δ tỷ lệ thiếu mô hình; Mango (R0 100%) vẫn giảm được khi SS = 0', () => {
    const cab = d.purchasing.specs.find((s) => s.component === 'Orange' && /delivery/i.test(s.startPaymentTerm) && s.transportModes.length === 1)!.supplier;
    const r = run((i) => { i.purchasing.suppliers.Orange = cab; i.purchasing.terms.Orange = defaultTerms(d, 'Orange', cab); });
    const o = (x: Results) => x.sc.components.find((c) => c.key === 'Orange')!;
    expect(o(r).availability).toBeLessThan(o(b).availability);
    expect(o(r).availability).toBeGreaterThan(0.9);
    const m = run((i) => { i.sc.components.Mango.safetyStockWeeks = 0; i.sc.components.Mango.lotSizeWeeks = 0.5; }).sc.components.find((c) => c.key === 'Mango')!;
    expect(m.availability).toBeLessThan(1);
  });
  it('safety stock giảm → availability giảm (vẫn trong 0–1)', () => {
    const a = vc(run((i) => { i.sc.components[V].safetyStockWeeks = 0.5; })).availability;
    expect(a).toBeLessThan(vc(b).availability);
    expect(a).toBeGreaterThanOrEqual(0);
  });
});

describe('2. Số tuần tồn thành phẩm = tồn ÷ nhu cầu/tuần mới (promotion không làm tăng giả)', () => {
  const r = run((i) => { i.sales.customers['Food & Groceries'].promotionalPressure = 'Heavy'; });
  // Từ 27/11 (hiệu chỉnh R1) tồn TP thực tế ∝ plan adherence: Heavy làm tải dây chuyền ↑ → adherence đổi → số tuần đổi ĐÚNG theo tỷ lệ adherence, không theo % nhu cầu
  it('Promotion Heavy, safety stock & interval giữ nguyên → số tuần tồn từng SKU = R0 × (adherence ÷ baseline); giá trị tồn vẫn tăng', () => {
    for (const p of r.sc.products) {
      const a = r.opsRaw.production.find((x) => x.sku === p.sku)!.adherence, a0 = b.opsRaw.production.find((x) => x.sku === p.sku)!.adherence;
      expect(p.sheet.stockWeeks.value!).toBeCloseTo(p.sheet.stockWeeks.r0! * (a / a0), 9);
    }
    expect(r.sc.stockValue.products).toBeGreaterThan(b.sc.stockValue.products);
  });
  it('KPI "Stock products (weeks)" / "Stock components (weeks)" không tăng theo % nhu cầu', () => {
    const k = buildKpis(d, r, b), k0 = buildKpis(d, b, b);
    const get = (ks: typeof k, id: string) => ks.find((x) => x.id === id)!.scenario!;
    // KPI gộp theo giá trị: chỉ còn hiệu ứng cơ cấu SKU và plan adherence (hiệu chỉnh R1); trước khi sửa tăng đúng theo % nhu cầu (3,18 → 3,27 = +2,8%)
    const adh = r.opsRaw.line.planAdherence / b.opsRaw.line.planAdherence;
    expect(Math.abs(get(k, 'sc-stp') / get(k0, 'sc-stp') / adh - 1)).toBeLessThan(0.005);
    expect(Math.abs(get(k, 'sc-stc') / get(k0, 'sc-stc') - 1)).toBeLessThan(0.01);
  });
  it('safety stock TP tăng thì số tuần vẫn tăng (sửa không làm mất tác động thật)', () => {
    const r2 = run((i) => { for (const s of Object.values(i.sc.products)) s.safetyStockWeeks = 4; });
    for (const p of r2.sc.products) expect(p.sheet.stockWeeks.value!).toBeGreaterThan(p.sheet.stockWeeks.r0!);
  });
});

describe('3. Trade unit NL: cỡ đơn ≥ 1 trade unit, làm tròn bội số khi khác R0', () => {
  it('baseline: cỡ đơn giữ nguyên (mọi NL R0 đã ≥ 1 trade unit) → số tab 7 không đổi', () => {
    for (const c of b.sc.components) expect(c.sheet.orderSize.value).toBe(c.sheet.orderSize.r0);
  });
  it('Vitamin C Drum → Tank: cỡ đơn = bội số tank; tồn, tank yard (TB và đỉnh) tăng', () => {
    const r = run((i) => { i.purchasing.terms[V].tradeUnit = 'Tank'; });
    const f = r.opsRaw.components.find((c) => c.key === V)!;
    const tank = tradeUnitSize(d, V, 'Tank')!;
    expect(f.orderUnits).toBeGreaterThanOrEqual(tank);
    expect(f.orderUnits / tank).toBeCloseTo(Math.round(f.orderUnits / tank), 9);
    expect(vc(r).stockValue).toBeGreaterThan(vc(b).stockValue);
    expect(r.ops.tankYard.avgTanks).toBeGreaterThan(b.ops.tankYard.avgTanks);
    expect(r.ops.tankYard.peakTanks).toBeGreaterThan(b.ops.tankYard.peakTanks);
  });
  it('Mango IBC → Drum (đơn vị nhỏ hơn): cỡ đơn làm tròn lên bội số drum', () => {
    const r = run((i) => { i.purchasing.terms.Mango.tradeUnit = 'Drum'; });
    const f = r.opsRaw.components.find((c) => c.key === 'Mango')!, drum = tradeUnitSize(d, 'Mango', 'Drum')!;
    expect(f.orderUnits / drum).toBeCloseTo(Math.round(f.orderUnits / drum), 9);
  });
});

describe('4. Phải trả NCC theo start payment term (ước lượng)', () => {
  it('"When ordering": nợ thực = payment term − lead time (không âm); "At delivery": = payment term', () => {
    const miami = d.purchasing.contracts.find((c) => c.component === 'Orange')!.supplier;
    expect(specOf(d, 'Orange', miami)!.startPaymentTerm).toMatch(/order/i);
    expect(effectivePayWeeks(d, 'Orange', miami, 4, 30)).toBe(Math.max(0, 4 - 30 / 7));
    const atDel = d.purchasing.specs.find((s) => s.component === 'Orange' && /delivery/i.test(s.startPaymentTerm))!;
    expect(effectivePayWeeks(d, 'Orange', atDel.supplier, 4, 50)).toBe(4);
  });
  it('baseline: Payment terms = đúng 365.589 (tab 2)', () => {
    expect(b.finance.rows.find((r) => r.label === 'Payment terms')!.value).toBe(d.finance.lines.find((l) => l.label === 'Payment terms')!.value);
  });
  it('Orange: Miami (When ordering) → NCC At delivery → phải trả ↑ → Payment terms ↓ → Investment ↓', () => {
    const atDel = d.purchasing.specs.find((s) => s.component === 'Orange' && /delivery/i.test(s.startPaymentTerm))!.supplier;
    const r = run((i) => { i.purchasing.suppliers.Orange = atDel; i.purchasing.terms.Orange = defaultTerms(d, 'Orange', atDel); });
    const ap = (x: Results) => x.purchasing.components.find((c) => c.key === 'Orange')!.payables;
    expect(ap(r)).toBeGreaterThan(ap(b));
    expect(r.finance.rows.find((x) => x.label === 'Payment terms')!.value).toBeLessThan(b.finance.rows.find((x) => x.label === 'Payment terms')!.value);
    expect(r.finance.investment).toBeLessThan(b.finance.investment);
  });
});

describe('5–6. Chữ trên web & nhãn nguồn', () => {
  const ui = readdirSync('src/ui').filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(`src/ui/${f}`, 'utf8')).join('\n');
  it('không còn câu cũ/sai: intake "CHƯA được mô hình", "doanh thu giữ R0", "AR giữ R0", "đổi hợp đồng: M3", "cho tới M3"', () => {
    for (const bad of ['CHƯA được mô hình', 'giữ R0 tới khi', 'AR giữ R0', 'đổi hợp đồng: M3', 'cho tới M3', 'sẽ mô hình ở M3']) expect(ui, bad).not.toContain(bad);
  });
  it('Ops score không mang nhãn "số R0"', () => {
    expect(readFileSync('src/ui/OpsTab.tsx', 'utf8')).not.toMatch(/Ops score[^<]*<Badge basis="r0"/);
  });
  it('nhãn P&L khớp ops.ts: training, tank yard, Flexible manpower (bottling) = ước lượng', () => {
    for (const l of ['Solve breakdowns training (dòng mới)', 'Outsourcing tank yard', 'Flexible manpower (bottling)']) expect(b.finance.rows.find((r) => r.label === l)!.basis, l).toBe('estimate');
    const est = b.ops.costs.filter((c) => c.basis === 'estimate').map((c) => c.id);
    expect(est).toEqual(expect.arrayContaining(['training', 'tankYard', 'lineOutsource']));
  });
});
