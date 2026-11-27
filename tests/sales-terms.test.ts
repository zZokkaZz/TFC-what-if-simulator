// M3 Sales — 4 mục cuối (25/11): shelf life, promotion (+ horizon), service level hứa + SL type, payment term khách.
// Hệ số đọc từ COEFFS, lựa chọn / khoảng đọc từ dữ liệu sheet — không gõ lại số.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { COEFFS } from '../src/model/assumptions';
import { CI_STEP_KEYS, ciSteps, demandBySku, promoFactor, promoMid, salesOption } from '../src/model/sales';
import { crossWarnings } from '../src/model/warnings';
import { causesFor } from '../src/ui/trace';
import { makeSanitizer } from '../src/sync/sanitize';
import { SALES_LIMITS, SALES_TEXT, SALES_TEXT_MAX, validateDept } from '../src/sync/limits';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => { const i: Inputs = structuredClone(base); f(i); return { i, r: simulate(i, d) }; };
const F = 'Food & Groceries';
const CUSTOMERS = d.sales.contracts.map((c) => c.customer);
const finRow = (r: ReturnType<typeof simulate>, label: string) => r.finance.rows.find((x) => x.label === label)!.value;
const cust = (r: ReturnType<typeof simulate>, c: string) => r.sales.customers.find((x) => x.customer === c)!;
const opt = (k: Parameters<typeof salesOption>[1]) => salesOption(d, k)!;

describe('Baseline (không đổi gì) = đúng sheet', () => {
  it('ROI vẫn = ô tab 2 (−7,68%); Payment terms = 365.589 (tab 2); Δ AR = 0', () => {
    expect(b.finance.roi).toBeCloseTo(d.finance.totals.roi, 9);
    expect(finRow(b, 'Payment terms')).toBe(d.finance.lines.find((l) => l.label === 'Payment terms')!.value);
    expect(b.sales.arDelta).toBe(0);
  });
  it('nhu cầu từng SKU = tab 3; promotion R0 → hệ số nhu cầu = 1', () => {
    const dem = demandBySku(d, base);
    for (const p of d.products) expect(dem[p.key]).toBe(p.demandPerWeek);
    for (const r of d.sales.customerProduct) expect(promoFactor(d, base, r.customer, r.sku)).toBe(1);
  });
  it('ô baseline = giá trị R0 của khối lựa chọn tab 6 (SL type, SL %, shelf life %, payment term, promotion, horizon)', () => {
    for (const c of CUSTOMERS) {
      const t = base.sales.customers[c];
      expect(t.serviceLevelType).toBe(opt('serviceLevelType').r0[c]);
      expect(t.serviceLevel * 100).toBeCloseTo(opt('serviceLevel').r0[c] as number, 9);
      expect(t.shelfLife * 100).toBeCloseTo(opt('shelfLife').r0[c] as number, 9);
      expect(t.paymentTermWeeks).toBe(opt('paymentTermWeeks').r0[c]);
      expect(t.promotionalPressure).toBe(opt('promotionalPressure').r0[c]);
      expect(t.promotionHorizon).toBe(opt('promotionHorizon').r0[c]);
      expect(Object.values(ciSteps(d, t, t)).every((x) => x === 0)).toBe(true);
    }
  });
  it('khoảng % nhu cầu thêm của promotion đọc đúng từ câu tác động tab 6; R0 = Middle', () => {
    const o = opt('promotionalPressure');
    expect(Object.keys(o.levels!)).toEqual(o.choices);
    for (const [k, lv] of Object.entries(o.levels!)) {
      const txt = lv.min === lv.max ? `${k} ${String(lv.min * 100).replace('.', ',')}%` : `${k} ${(lv.min * 100).toFixed(1).replace('.', ',')}–${(lv.max * 100).toFixed(1).replace('.', ',')}%`;
      expect(o.impact).toContain(txt);
    }
    for (const c of CUSTOMERS) expect(base.sales.customers[c].promotionalPressure).toBe('Middle');
  });
  it('giới hạn ô nhập = khoảng game cho phép ghi ở tab 6 (SL 75–100, shelf life 40–85, payment term 1–8)', () => {
    expect([SALES_LIMITS.serviceLevel.min * 100, SALES_LIMITS.serviceLevel.max * 100]).toEqual([opt('serviceLevel').range!.min, opt('serviceLevel').range!.max]);
    expect([SALES_LIMITS.shelfLife.min * 100, SALES_LIMITS.shelfLife.max * 100].map((x) => Math.round(x))).toEqual([opt('shelfLife').range!.min, opt('shelfLife').range!.max]);
    expect([SALES_LIMITS.paymentTermWeeks.min, SALES_LIMITS.paymentTermWeeks.max]).toEqual([opt('paymentTermWeeks').range!.min, opt('paymentTermWeeks').range!.max]);
  });
  it('mọi hệ số CI của ô hợp đồng Sales = 0 (người dùng chốt) → không đổi số nào ngoài ý muốn; baseline không có cảnh báo Sales', () => {
    for (const k of ['salesCiPerStepTradeUnit', 'salesCiPerStepOrderDeadline', 'salesCiPerPointServiceLevel', 'salesCiPerStepSlType', 'salesCiPerPointShelfLife', 'salesCiPerWeekPaymentTerm', 'salesCiPerStepPromotion', 'salesCiPerStepPromotionHorizon'] as const) expect(COEFFS[k].value).toBe(0);
    expect(crossWarnings(d, base, base, b, b).filter((x) => x.from === 'Sales')).toEqual([]);
  });
});

describe('1. Shelf life yêu cầu → tuổi tồn cho phép → obsolete / Costs of scrap (C2)', () => {
  it('cả 3 khách 75 → 80%: tuổi cho phép = 20 × (1 − 0,8); obsolete ↑, scrap ↑, ROI ↓', () => {
    const { r } = run((i) => { for (const c of CUSTOMERS) i.sales.customers[c].shelfLife = 0.8; });
    for (const p of r.sc.products) {
      expect(p.allowedAgeWeeks).toBeCloseTo(d.productShelfLifeWeeks! * (1 - 0.8), 12);
      expect(p.obsoleteEst).toBeGreaterThan(p.obsoleteR0!);
    }
    expect(finRow(r, 'Costs of scrap')).toBeGreaterThan(finRow(b, 'Costs of scrap'));
    expect(r.finance.roi).toBeLessThan(b.finance.roi);
  });
  it('cả 3 khách 75 → 70%: obsolete ↓, scrap ↓, ROI ↑', () => {
    const { r } = run((i) => { for (const c of CUSTOMERS) i.sales.customers[c].shelfLife = 0.7; });
    expect(finRow(r, 'Costs of scrap')).toBeLessThan(finRow(b, 'Costs of scrap'));
    expect(r.finance.roi).toBeGreaterThan(b.finance.roi);
  });
  it('hạ shelf life MỘT khách mà khách khác mua cùng SKU vẫn đòi 75% → không đổi (dùng mức cao nhất)', () => {
    const { r } = run((i) => { i.sales.customers[F].shelfLife = 0.7; });
    expect(finRow(r, 'Costs of scrap')).toBe(finRow(b, 'Costs of scrap'));
  });
  it('Dominick\'s (chỉ mua PET) 75 → 80% → chỉ SKU PET đổi tuổi cho phép', () => {
    const { r } = run((i) => { i.sales.customers["Dominick's"].shelfLife = 0.8; });
    for (const p of r.sc.products) expect(p.allowedAgeWeeks! < b.sc.products.find((x) => x.sku === p.sku)!.allowedAgeWeeks! - 1e-9).toBe(p.sku.endsWith('PET'));
  });
});

describe('2. Promotional pressure → nhu cầu → sản xuất, tồn kho, service level; horizon chỉ cảnh báo', () => {
  const heavy = run((i) => { i.sales.customers[F].promotionalPressure = 'Heavy'; });
  const none = run((i) => { i.sales.customers[F].promotionalPressure = 'None'; });
  it('Heavy: bán thêm = % R0 × (điểm giữa Heavy ÷ điểm giữa Middle) — điểm giữa đọc từ sheet', () => {
    const k = promoMid(d, 'Heavy')! / promoMid(d, 'Middle')!;
    for (const row of d.sales.customerProduct.filter((x) => x.customer === F)) expect(promoFactor(d, heavy.i, F, row.sku)).toBeCloseTo((1 + row.promoUplift * k) / (1 + row.promoUplift), 12);
  });
  it('Heavy: nhu cầu khách ↑, sản xuất ↑, tồn TP ↑, mua NL ↑, contracted ↑, plan adherence không tăng', () => {
    const r = heavy.r, c = cust(r, F);
    expect(c.demand).toBeGreaterThan(c.demandR0);
    expect(r.ops.production.reduce((s, p) => s + p.prodUnits, 0)).toBeGreaterThan(b.ops.production.reduce((s, p) => s + p.prodUnits, 0));
    expect(r.sc.stockValue.products).toBeGreaterThan(b.sc.stockValue.products);
    expect(r.purchasing.purchaseValue).toBeGreaterThan(b.purchasing.purchaseValue);
    expect(c.contracted).toBeGreaterThan(c.contractedR0);
    expect(r.ops.line.planAdherence).toBeLessThanOrEqual(b.ops.line.planAdherence);
    expect(cust(r, 'LAND Market').demand).toBe(cust(r, 'LAND Market').demandR0);
  });
  it('Heavy: giá trị obsolete/tuần và Costs of scrap tăng theo lượng (tỷ lệ hủy giữ nguyên)', () => {
    expect(finRow(heavy.r, 'Costs of scrap')).toBeGreaterThan(finRow(b, 'Costs of scrap'));
    expect(finRow(none.r, 'Costs of scrap')).toBeLessThan(finRow(b, 'Costs of scrap'));
  });
  it('None: nhu cầu ↓, contracted ↓, sản xuất ↓', () => {
    const c = cust(none.r, F);
    expect(c.demand).toBeLessThan(c.demandR0);
    expect(c.contracted).toBeLessThan(c.contractedR0);
    expect(none.r.ops.production.reduce((s, p) => s + p.prodUnits, 0)).toBeLessThan(b.ops.production.reduce((s, p) => s + p.prodUnits, 0));
  });
  it('promotion tăng → bậc CI âm (CI giảm theo Info Center) → web ghi "giá giảm"', () => {
    expect(cust(heavy.r, F).ciSteps.promotionalPressure).toBeLessThan(0);
    expect(cust(none.r, F).ciSteps.promotionalPressure).toBeGreaterThan(0);
  });
  it('promotion horizon: không đổi số nào; có cảnh báo "CHƯA MÔ HÌNH"', () => {
    const { i, r } = run((x) => { x.sales.customers[F].promotionHorizon = 'Long'; });
    expect(r.finance.roi).toBe(b.finance.roi);
    expect(r.finance.investment).toBe(b.finance.investment);
    const w = crossWarnings(d, base, i, r, b).find((x) => x.id === `sales-horizon-${F}`)!;
    expect(w.detail).toContain('CHƯA MÔ HÌNH');
    expect(cust(r, F).ciSteps.promotionHorizon).toBeLessThan(0);
  });
  it('truy vết: dây chuyền, kho TP hiện "← do Sales đổi promotion"', () => {
    expect(causesFor('lineLoad', [`sales.customers.${F}.promotionalPressure`])).toEqual([{ dept: 'Sales', label: 'promotion' }]);
    expect(causesFor('fgStock', [`sales.customers.${F}.promotionalPressure`])).toEqual([{ dept: 'Sales', label: 'promotion' }]);
  });
});

describe('3. Service level hứa + SL type → mốc penalty (neo từng khách đã chốt)', () => {
  it('SL hứa F&G 95 → 98%: mức thiếu ↑, penalty = penalty R0 × (thiếu mới ÷ thiếu R0)^mũ, ROI ↓', () => {
    const { r } = run((i) => { i.sales.customers[F].serviceLevel = 0.98; });
    const c = cust(r, F);
    expect(c.shortfall).toBeCloseTo(0.98 - c.slOrderLines, 12);
    expect(c.penalty).toBeCloseTo(c.penaltyR0 * Math.pow(c.shortfall / c.shortfallR0, COEFFS.penaltyShortfallExponent.value), 6);
    expect(c.penalty).toBeLessThan(c.penaltyR0);
    expect(r.finance.roi).toBeLessThan(b.finance.roi);
  });
  it('SL hứa F&G 95 → 90% (≤ SL đạt được): hết phạt, được THƯỞNG = contracted × COEFFS.salesBonusRate (hiệu chỉnh R1), ROI ↑', () => {
    const { r } = run((i) => { i.sales.customers[F].serviceLevel = 0.9; });
    expect(cust(r, F).penalty).toBeCloseTo(cust(r, F).contracted * COEFFS.salesBonusRate.value, 9);
    expect(r.finance.roi).toBeGreaterThan(b.finance.roi);
  });
  it('SL type Orders (khó đạt hơn) → penalty nặng hơn; Units → nhẹ hơn; cả hai gắn "ngoài vùng dữ liệu R0" khi còn thiếu', () => {
    const orders = cust(run((i) => { i.sales.customers[F].serviceLevelType = 'Orders'; }).r, F);
    const units = cust(run((i) => { i.sales.customers[F].serviceLevelType = 'Units'; }).r, F);
    expect(orders.slMeasured).toBe(orders.slOrdersR0);
    expect(units.slMeasured).toBe(units.slPiecesR0);
    expect(orders.penalty).toBeLessThan(orders.penaltyR0);
    expect(units.penalty).toBeGreaterThan(units.penaltyR0);
    expect(orders.outOfRange).toBe(true);
    expect(units.outOfRange).toBe(units.shortfall > 0);
  });
  it('SL hứa cao hơn → gợi ý safety stock TP (SC) tăng; app KHÔNG tự đổi safety stock', () => {
    const { i, r } = run((x) => { for (const c of CUSTOMERS) x.sales.customers[c].serviceLevel = 0.99; });
    for (const p of r.sc.products) expect(p.recommendedSsWeeks).toBeGreaterThan(b.sc.products.find((x) => x.sku === p.sku)!.recommendedSsWeeks);
    expect(i.sc).toEqual(base.sc);
  });
});

describe('4. Payment term khách → phải thu (AR) → Investment "Payment terms" (neo 365.589)', () => {
  // Hiệu chỉnh R1 (27/11): phải thu theo CONTRACTED sales (trước phạt/thưởng) — R1 game Payment terms chỉ đổi phần NCC
  it('F&G 4 → 8 tuần: AR = contracted ÷ 26 × 8; Payment terms ↑ đúng Δ AR; Investment ↑; doanh thu, OP không đổi', () => {
    const { r } = run((i) => { i.sales.customers[F].paymentTermWeeks = 8; });
    const c = cust(r, F);
    expect(c.ar).toBeCloseTo((c.contracted / 26) * 8, 6);
    expect(finRow(r, 'Payment terms') - finRow(b, 'Payment terms')).toBeCloseTo(c.ar - c.arR0, 6);
    expect(r.finance.investment).toBeGreaterThan(b.finance.investment);
    expect(r.finance.operatingProfit).toBe(b.finance.operatingProfit);
  });
  it('F&G 4 → 1 tuần: Investment ↓', () => {
    const { r } = run((i) => { i.sales.customers[F].paymentTermWeeks = 1; });
    expect(r.finance.investment).toBeLessThan(b.finance.investment);
    expect(cust(r, F).ciSteps.paymentTerm).toBe(-3);
  });
  it('penalty/thưởng đổi KHÔNG đổi AR (game tính phải thu theo contracted — R1: doanh thu +340.685 mà Payment terms chỉ +16.523 ≈ phần NCC)', () => {
    const { r } = run((i) => { i.sales.customers[F].serviceLevel = 0.98; });
    const c = cust(r, F);
    expect(c.penalty).not.toBe(c.penaltyR0);
    expect(c.ar).toBeCloseTo((c.contracted / 26) * c.terms.paymentTermWeeks, 6);
    expect(r.sales.arDelta).toBeCloseTo(0, 6);
  });
});

describe('CI khi đổi điều khoản (hệ số COEFFS = 0) và đồng bộ', () => {
  it('đổi bất kỳ ô nào mà CI game trống → CI = R0 × (1 + Σ hệ số × bậc) = R0, cờ "chưa nhập CI game"', () => {
    const { r } = run((i) => { Object.assign(i.sales.customers[F], { serviceLevel: 0.97, shelfLife: 0.8, paymentTermWeeks: 6, promotionalPressure: 'Light', promotionHorizon: 'Long', serviceLevelType: 'Units' }); });
    const c = cust(r, F);
    expect(c.ciStale).toBe(true);
    expect(c.ciBasis).toBe('estimate');
    const coef: Record<string, number> = { tradeUnit: COEFFS.salesCiPerStepTradeUnit.value, orderDeadline: COEFFS.salesCiPerStepOrderDeadline.value, serviceLevel: COEFFS.salesCiPerPointServiceLevel.value, serviceLevelType: COEFFS.salesCiPerStepSlType.value, shelfLife: COEFFS.salesCiPerPointShelfLife.value, paymentTerm: COEFFS.salesCiPerWeekPaymentTerm.value, promotionalPressure: COEFFS.salesCiPerStepPromotion.value, promotionHorizon: COEFFS.salesCiPerStepPromotionHorizon.value };
    expect(c.contractIndex).toBeCloseTo(c.contractIndexR0 * (1 + CI_STEP_KEYS.reduce((s, k) => s + coef[k] * c.ciSteps[k], 0)), 12);
  });
  it('sanitize & validateDept: nhận ô mới hợp lệ; chặn SL 70%, shelf life 90%, payment term 9 hoặc lẻ', () => {
    const sanitize = makeSanitizer(base);
    const t = { ...base.sales.customers[F], serviceLevel: 0.97, shelfLife: 0.8, paymentTermWeeks: 6, promotionalPressure: 'Heavy' };
    expect((sanitize('sales', { customers: { [F]: t } }) as Inputs['sales']).customers[F]).toEqual(t);
    expect(validateDept('sales', { customers: { [F]: t } })).toEqual([]);
    expect(validateDept('sales', { customers: { [F]: { ...t, serviceLevel: 0.7 } } })[0].path).toBe(`sales.customers.${F}.serviceLevel`);
    expect(validateDept('sales', { customers: { [F]: { ...t, shelfLife: 0.9 } } })[0].path).toBe(`sales.customers.${F}.shelfLife`);
    expect(validateDept('sales', { customers: { [F]: { ...t, paymentTermWeeks: 9 } } })[0].path).toBe(`sales.customers.${F}.paymentTermWeeks`);
    expect(validateDept('sales', { customers: { [F]: { ...t, paymentTermWeeks: 4.5 } } })[0].message).toMatch(/số nguyên/);
  });
  it('mọi lựa chọn chữ trong sheet vừa giới hạn độ dài của rules', () => {
    for (const k of ['serviceLevelType', 'promotionalPressure', 'promotionHorizon'] as const) for (const x of opt(k).choices!) expect(x.length).toBeLessThanOrEqual(SALES_TEXT_MAX);
  });
  it('giới hạn Sales trong app khớp firestore.rules', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    for (const k of ['serviceLevel', 'shelfLife'] as const) expect(rules, k).toContain(`c.${k} >= ${SALES_LIMITS[k].min} && c.${k} <= ${SALES_LIMITS[k].max}`);
    expect(rules).toContain(`c.paymentTermWeeks is int && c.paymentTermWeeks >= ${SALES_LIMITS.paymentTermWeeks.min} && c.paymentTermWeeks <= ${SALES_LIMITS.paymentTermWeeks.max}`);
    for (const k of SALES_TEXT.filter((x) => x !== 'tradeUnit' && x !== 'orderDeadline')) expect(rules, k).toContain(`c.${k}.size() <= ${SALES_TEXT_MAX}`);
  });
});
