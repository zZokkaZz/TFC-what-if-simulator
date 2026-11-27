// M2 — Supply Chain: baseline giữ đúng số game; đổi quyết định SC → Ops, Finance, cảnh báo đổi đúng chiều.
import { describe, expect, it } from 'vitest';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { crossWarnings } from '../src/model/warnings';
import { validateDept } from '../src/sync/limits';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => { const i: Inputs = structuredClone(base); f(i); return { i, r: simulate(i, d) }; };
const allComp = (i: Inputs, patch: object) => { for (const k of Object.keys(i.sc.components)) Object.assign((i.sc.components as Record<string, object>)[k], patch); };
const allProd = (i: Inputs, patch: object) => { for (const k of Object.keys(i.sc.products)) Object.assign((i.sc.products as Record<string, object>)[k], patch); };
const fin = (r: ReturnType<typeof simulate>, re: RegExp) => r.finance.rows.find((x) => re.test(x.label))!.value;

describe('Baseline SC = số game R0', () => {
  it('giá trị tồn kho = €321.425 (tab 7) và Investment: Stock = €321.424 (tab 2)', () => {
    expect(b.sc.stockValue.total).toBeCloseTo(321425, 0);
    expect(fin(b, /^Stock$/)).toBeCloseTo(321424, 0);
  });
  it('availability NL = số game (Vitamin C 84,3%)', () => {
    for (const c of b.sc.components) expect(c.availability).toBeCloseTo(d.supplyChain.componentStock.find((x) => x.component === c.key)!.availability, 9);
  });
  it('SL pieces dự kiến = số game; lãi tồn kho = số P&L', () => {
    for (const p of b.sc.products) expect(p.slPiecesEst).toBeCloseTo(p.slPiecesR0, 9);
    expect(fin(b, /^Interest on components/)).toBeCloseTo(11181, 0);
    expect(fin(b, /^Interest on products/)).toBeCloseTo(12926, 0);
  });
  it('hạn dùng 20 tuần (tab 3) × (1 − 75%) = 5 tuần cho phép', () => {
    expect(b.sc.products[0].allowedAgeWeeks).toBeCloseTo(5, 9);
  });
  it('baseline nhìn ra vấn đề R0: cảnh báo Vitamin C', () => {
    const w = crossWarnings(d, base, base, b, b);
    expect(w.some((x) => x.id === 'avail-low-Vitamin C' && x.severity === 'critical')).toBe(true);
  });
});

describe('SC → Ops / Finance / cảnh báo', () => {
  it('tăng safety stock Vitamin C → availability ↑ → plan adherence ↑; tồn & lãi NL ↑', () => {
    const { r } = run((i) => { i.sc.components['Vitamin C'].safetyStockWeeks = 6; });
    const vc = r.sc.components.find((x) => x.key === 'Vitamin C')!;
    expect(vc.availability).toBeGreaterThan(0.843);
    expect(r.ops.line.planAdherence).toBeGreaterThan(b.ops.line.planAdherence);
    expect(r.sc.stockValue.components).toBeGreaterThan(b.sc.stockValue.components);
    expect(fin(r, /^Interest on components/)).toBeGreaterThan(fin(b, /^Interest on components/));
  });
  it('giảm lot size NL → kho NL bớt tràn, nhưng nhiều chu kỳ hơn → availability Vitamin C ↓; có cảnh báo kèm dòng ROI', () => {
    const { i, r } = run((x) => allComp(x, { lotSizeWeeks: 2 }));
    expect(r.ops.rm.overflowCost).toBeLessThan(b.ops.rm.overflowCost);
    expect(r.sc.components.find((x) => x.key === 'Vitamin C')!.availability).toBeLessThan(0.843);
    const w = crossWarnings(d, base, i, r, b);
    const rm = w.find((x) => x.id === 'sc-rm')!;
    expect(rm.to).toContain('Ops');
    expect(rm.roi.find((x) => /Overflow raw/.test(x.label))!.delta).toBeLessThan(0);
    expect(w.some((x) => x.id === 'avail-Vitamin C')).toBe(true);
  });
  it('production interval 10 → 5 → changeover ×2, overtime ↑, cảnh báo dây chuyền; đỉnh kho TP ↓', () => {
    const { i, r } = run((x) => allProd(x, { productionIntervalDays: 5 }));
    expect(r.ops.line.changeover).toBeCloseTo(b.ops.line.changeover * 2, 6);
    expect(r.ops.line.overtime).toBeGreaterThan(b.ops.line.overtime);
    expect(r.ops.fg.peakPallets).toBeLessThan(b.ops.fg.peakPallets);
    const w = crossWarnings(d, base, i, r, b);
    expect(w.find((x) => x.id === 'sc-line')!.roi.find((x) => /bottling/.test(x.label))!.delta).toBeGreaterThan(0);
  });
  it('tăng safety stock TP 3 → 5 → tồn TP, Investment, lãi TP ↑; đỉnh kho TP ↑; cảnh báo quá hạn (7 > 5 tuần)', () => {
    const { i, r } = run((x) => allProd(x, { safetyStockWeeks: 5 }));
    expect(r.sc.stockValue.products).toBeGreaterThan(b.sc.stockValue.products);
    expect(r.finance.investment).toBeGreaterThan(b.finance.investment);
    expect(fin(r, /^Interest on products/)).toBeGreaterThan(fin(b, /^Interest on products/));
    expect(r.ops.fg.peakPallets).toBeGreaterThan(b.ops.fg.peakPallets);
    const w = crossWarnings(d, base, i, r, b);
    expect(w.some((x) => x.id === 'sc-age')).toBe(true);
    expect(w.some((x) => x.id === 'stock-fin')).toBe(true);
  });
  // Trước M3 Sales: cảnh báo ghi "ROI CHƯA trừ penalty". M3 Sales: penalty đã trừ vào doanh thu (ước lượng).
  it('giảm safety stock TP 3 → 1 → SL dự kiến ↓ và cảnh báo có số penalty tăng (M3 Sales)', () => {
    const { i, r } = run((x) => allProd(x, { safetyStockWeeks: 1 }));
    expect(r.sc.products.every((p, k) => p.slPiecesEst < b.sc.products[k].slPiecesEst)).toBe(true);
    const w = crossWarnings(d, base, i, r, b).find((x) => x.id === 'sc-sl')!;
    expect(w.severity).toBe('critical');
    expect(w.detail).not.toContain('CHƯA trừ penalty');
    expect(w.detail).toMatch(/ước lượng/);
    expect(w.roi.find((x) => /^Penalty service level/.test(x.label))!.delta).toBeLessThan(0);
  });
  it('intake time dài hơn → lead time hiệu dụng ↑ → availability NL ↓ (Ops → SC)', () => {
    const { r } = run((x) => { x.ops.intakeDays = 15; });
    expect(r.sc.components.find((x) => x.key === 'Vitamin C')!.availability).toBeLessThan(0.843);
  });
  it('frozen period đổi → cảnh báo "chưa mô hình" giờ dây chuyền', () => {
    const { i, r } = run((x) => { x.sc.frozenPeriodWeeks = 5; });
    expect(crossWarnings(d, base, i, r, b).find((x) => x.id === 'sc-frozen')!.detail).toContain('CHƯA mô hình');
  });
  it('kiểm tra giới hạn SC trước khi ghi bản chung', () => {
    const bad = structuredClone(base.sc); bad.products['Orange 1L'].productionIntervalDays = 0;
    expect(validateDept('sc', bad)[0].message).toContain('tối thiểu 1');
    expect(validateDept('sc', base.sc)).toHaveLength(0);
  });
});

describe('Bảng SC hiển thị đúng số tab 7 ở baseline', () => {
  it('mọi ô nguyên liệu = đúng số sheet', () => {
    for (const x of b.sc.components) {
      const st = d.supplyChain.componentStock.find((y) => y.component === x.key)!;
      expect(x.sheet.orderSize.value).toBe(st.orderSize);
      expect(x.sheet.stockWeeks.value).toBe(st.stockWeeks);
      expect(x.sheet.stockUnits.value).toBe(st.stockUnits);
      expect(x.sheet.stockValue.value).toBe(st.stockValue);
      expect(x.sheet.amountPurchased.value).toBe(st.purchasedInRound);
      expect(x.sheet.demandPerWeek.value).toBe(st.demandPerWeek);
      expect(x.sheet.availability.value).toBe(st.availability);
      expect(x.sheet.reliability.value).toBe(st.supplierReliability);
      expect(['sheet', 'notModeled']).toContain(x.sheet.orderSize.basis);
    }
  });
  it('mọi ô thành phẩm = đúng số sheet', () => {
    for (const x of b.sc.products) {
      const st = d.supplyChain.productStock.find((y) => y.sku === x.sku)!;
      expect(x.sheet.stockWeeks.value).toBe(st.stockWeeks);
      expect(x.sheet.stockValue.value).toBe(st.stockValue);
      expect(x.sheet.slPieces.value).toBe(st.slPieces);
      expect(x.sheet.planAdherence.value).toBe(st.planAdherence);
      expect(x.sheet.startupLoss.value).toBe(st.startupLossEur);
      expect(x.sheet.batches.value).toBe(st.batches);
      expect(x.sheet.economicWeeks.value).toBe(st.economicWeeks);
    }
  });
  it('đổi lot size → order size, lần nhận đổi theo tỷ lệ và ghi rõ là số kịch bản', () => {
    const { r } = run((i) => allComp(i, { lotSizeWeeks: 2 }));
    const pet = r.sc.components.find((x) => x.key === 'PET')!;
    expect(pet.sheet.orderSize.basis).toBe('scaled');
    // Hiệu chỉnh R1 (27/11): cỡ đơn = lot × lượng mua + phần cộng thêm cố định (tuần nhu cầu) → lot 4 → 2 KHÔNG giảm đúng ½
    const k = r.opsRaw.components.find((x) => x.key === 'PET')!.orderUnits / b.opsRaw.components.find((x) => x.key === 'PET')!.orderUnits;
    expect(k).toBeGreaterThan(0.5);
    expect(k).toBeLessThan(0.65);
    expect(pet.sheet.orderSize.value!).toBeCloseTo(951612 * k, -1);
    expect(pet.deliveries.value!).toBeCloseTo(5.9 / k, 1);
  });
});
