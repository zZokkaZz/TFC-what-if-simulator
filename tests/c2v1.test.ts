// C2 (obsolete & Costs of scrap theo tuổi tồn) và V1 (tách plan adherence: thiếu NL / capacity; B chính, thận trọng ≤ B).
// Các hệ số đọc từ COEFFS (src/model/assumptions.ts) — không gõ lại số.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs, Results } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { obsoleteAgeSigma, overAgeShare } from '../src/model/supplyChain';
import { crossWarnings } from '../src/model/warnings';
import { buildKpis } from '../src/model/kpi';
import { COEFFS } from '../src/model/assumptions';

const XLSX: typeof import('xlsx') = createRequire(import.meta.url)('xlsx');
const wb = XLSX.readFile('data/TFC_Round0.xlsx');
const rowsOf = (sheet: string) => XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: null });
const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => { const i: Inputs = structuredClone(base); f(i); return { i, r: simulate(i, d) }; };
const allProd = (i: Inputs, patch: object) => { for (const k of Object.keys(i.sc.products)) Object.assign((i.sc.products as Record<string, object>)[k], patch); };
const scrap = (r: Results) => r.finance.rows.find((x) => /^Costs of scrap$/.test(x.label))!.value;
const v2 = (label: string) => rowsOf('2_Finance').find((x) => String(x?.[1] ?? '').trim() === label)![2] as number;

describe('R0 vẫn đúng sheet', () => {
  it('ROI = ô tab 2 (−7,68%); ROI thận trọng = ROI ở baseline', () => {
    expect(b.finance.roi).toBeCloseTo(v2('ROI'), 9);
    expect((b.finance.roi * 100).toFixed(2)).toBe('-7.68');
    expect(b.conservative.roi).toBe(b.finance.roi);
  });
  it('Costs of scrap = tab 2; obsolete & obsolete value từng SKU = tab 7', () => {
    expect(scrap(b)).toBe(v2('Costs of scrap'));
    for (const p of b.sc.products) {
      const st = d.supplyChain.productStock.find((x) => x.sku === p.sku)!;
      expect(p.obsoleteEst).toBe(st.obsolete);
      expect(p.sheet.obsoletes.value).toBe(st.obsolete);
      expect(p.sheet.obsoleteValuePerWeek.value).toBe(st.obsoleteValuePerWeek);
    }
  });
  it('KPI Obsolete products = 8,1% (tab 1) ở baseline', () => {
    const k = buildKpis(d, b, b).find((x) => x.id === 'sal-obs')!;
    expect(k.scenario).toBe(k.r0.value);
  });
});

describe('C2: tuổi tồn → obsolete → Costs of scrap (ước lượng, hiệu chỉnh R0)', () => {
  it('σ tuổi tồn hiệu chỉnh tái tạo đúng obsolete R0 từng SKU (tab 7)', () => {
    const sig = obsoleteAgeSigma(d);
    const A = d.productShelfLifeWeeks! * (1 - Math.max(...d.sales.contracts.map((c) => c.shelfLife)));
    for (const st of d.supplyChain.productStock) {
      const dec = d.supplyChain.products.find((p) => p.sku === st.sku)!;
      expect(overAgeShare(dec.safetyStockWeeks, dec.productionIntervalDays / 5, A, sig[st.sku]!)).toBeCloseTo(st.obsolete, 9);
    }
  });
  describe('BẮT BUỘC: interval 10 → 20 KHÔNG làm ROI tốt hơn chỉ vì bỏ qua hàng quá hạn', () => {
    const { i, r } = run((x) => allProd(x, { productionIntervalDays: 20 }));
    it('obsolete mọi SKU tăng, Costs of scrap tăng', () => {
      for (const p of r.sc.products) expect(p.obsoleteEst).toBeGreaterThan(p.obsoleteR0);
      expect(scrap(r)).toBeGreaterThan(scrap(b));
    });
    it('ROI có tính hàng quá hạn < ROI nếu bỏ qua hàng quá hạn (giữ Costs of scrap R0)', () => {
      const roiIgnore = (r.finance.operatingProfit + (scrap(r) - scrap(b))) / r.finance.investment;
      expect(r.finance.roi).toBeLessThan(roiIgnore);
    });
    it('cảnh báo ĐỎ: tuổi tồn vượt shelf life khách yêu cầu, có số Costs of scrap', () => {
      const w = crossWarnings(d, base, i, r, b).find((x) => x.id === 'sc-age')!;
      expect(w.severity).toBe('critical');
      expect(w.roi[0].delta).toBeGreaterThan(0);
    });
    it('với hệ số đã chọn (phân tán ≤ 2, co giãn scrap = 1): ROI interval 20 < R0 (trước C2 là −3,68% > R0)', () => {
      // Hệ số người dùng chọn 25/11: obsoleteAgeSpreadScale = 2 → ROI −9,37%. Nới hệ số ra ngoài vùng này thì xem lại kỳ vọng.
      if (COEFFS.obsoleteAgeSpreadScale.value <= 2 && COEFFS.scrapObsoleteElasticity.value === 1) expect(r.finance.roi).toBeLessThan(b.finance.roi);
    });
  });
  it('đổi SS / interval làm tuổi tồn ngắn hơn → obsolete giảm, scrap giảm (SS TP 3 → 1, interval 10 → 5)', () => {
    for (const f of [(x: Inputs) => allProd(x, { safetyStockWeeks: 1 }), (x: Inputs) => allProd(x, { productionIntervalDays: 5 })]) {
      const { r } = run(f);
      expect(scrap(r)).toBeLessThan(scrap(b));
      for (const p of r.sc.products) expect(p.obsoleteEst).toBeLessThanOrEqual(p.obsoleteR0);
    }
  });
  // Hiệu chỉnh R1 (27/11): tồn TP thực tế ∝ plan adherence → obsolete cũng vậy. Quyết định không đổi tuổi tồn (số ca, SMED)
  // chỉ đổi obsolete đúng theo tỷ lệ plan adherence (trước 27/11 test này đòi obsolete đứng yên — R1 game bác bỏ).
  it('quyết định không đổi tuổi tồn (số ca, SMED): obsolete từng SKU = R0 × (adherence mới ÷ baseline)', () => {
    for (const f of [(x: Inputs) => { x.ops.shifts = 3; }, (x: Inputs) => { x.ops.smed = true; }]) {
      const { r } = run(f);
      for (const p of r.sc.products) {
        const a = r.opsRaw.production.find((x) => x.sku === p.sku)!.adherence, a0 = b.opsRaw.production.find((x) => x.sku === p.sku)!.adherence;
        expect(p.obsoleteEst).toBeCloseTo(Math.min(1, p.obsoleteR0 * (a / a0)), 12);
      }
      expect(scrap(r)).toBeGreaterThan(scrap(b)); // adherence ↑ → tồn thực ↑ → hủy ↑
    }
  });
});

describe('V1: số chính theo B, thận trọng (min B, C) luôn ≤ số chính', () => {
  const scenarios: [string, (i: Inputs) => void][] = [
    ['R0', () => {}], ['2 → 1 ca', (i) => { i.ops.shifts = 1; }], ['2 → 3 ca', (i) => { i.ops.shifts = 3; }],
    ['SMED', (i) => { i.ops.smed = true; }], ['Increase speed', (i) => { i.ops.increaseSpeed = true; }],
    ['PM Minimal', (i) => { i.ops.preventiveMaintenance = 'Minimal'; }], ['PM Extensive', (i) => { i.ops.preventiveMaintenance = 'Extensive'; }],
    ['Training', (i) => { i.ops.breakdownTraining = true; }], ['Inspection PET', (i) => { i.ops.rmInspection.PET = true; }],
    ['Interval 5', (i) => allProd(i, { productionIntervalDays: 5 })], ['Interval 15', (i) => allProd(i, { productionIntervalDays: 15 })],
    ['Interval 20', (i) => allProd(i, { productionIntervalDays: 20 })], ['SS TP 1', (i) => allProd(i, { safetyStockWeeks: 1 })],
    ['SS Vitamin C 6', (i) => { i.sc.components['Vitamin C'].safetyStockWeeks = 6; }],
  ];
  it.each(scenarios)('%s: ROI thận trọng ≤ ROI chính; SL thận trọng ≤ SL chính từng SKU', (_n, f) => {
    const { r } = run(f);
    expect(r.conservative.roi).toBeLessThanOrEqual(r.finance.roi + 1e-12);
    for (const p of r.sc.products) expect(p.slPiecesEstCons).toBeLessThanOrEqual(p.slPiecesEst + 1e-12);
  });
  // Từ 27/11 có thưởng khi đạt SL hứa: cả 2 phương án cùng vượt mức hứa thì ROI bằng nhau → kiểm ở mức SL SKU (phần capacity ≠ 0)
  it('tăng capacity (3 ca, PM Extensive): SL thận trọng thấp hơn hẳn số chính; ROI thận trọng ≤ số chính', () => {
    for (const f of [(x: Inputs) => { x.ops.shifts = 3; }, (x: Inputs) => { x.ops.preventiveMaintenance = 'Extensive'; }]) {
      const { r } = run(f);
      expect(r.sc.products.some((p) => p.slPiecesEstCons < p.slPiecesEst - 1e-4)).toBe(true);
      expect(r.conservative.roi).toBeLessThanOrEqual(r.finance.roi + 1e-12);
    }
  });
  it('chỉ đổi phần thiếu nguyên liệu (SS Vitamin C 6): phần capacity = 0 → thận trọng = số chính', () => {
    const { r } = run((x) => { x.sc.components['Vitamin C'].safetyStockWeeks = 6; });
    expect(r.conservative.roi).toBeCloseTo(r.finance.roi, 12);
  });
  it('bão hòa: 2 → 3 ca, SL tăng ít hơn tuyến tính 0,974 × Δadherence và không vượt 100%', () => {
    const { r } = run((x) => { x.ops.shifts = 3; });
    r.sc.products.forEach((p, k) => {
      const dAdh = r.opsRaw.production[k].adherence - b.opsRaw.production[k].adherence;
      expect(p.slPiecesEst).toBeLessThan(p.slPiecesR0 + 0.974 * dAdh);
      expect(p.slPiecesEst).toBeLessThan(1);
    });
  });
  it('giảm capacity (2 → 1 ca) vẫn bị phạt: ROI xấu đi rõ', () => {
    const { r } = run((x) => { x.ops.shifts = 1; });
    expect(r.finance.roi).toBeLessThan(b.finance.roi - 0.1);
  });
});
