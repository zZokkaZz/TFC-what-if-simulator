// M3 Sales mục 1 (25/11): ô hợp đồng trade unit + order deadline + CI game hiển thị.
// Hệ số ước lượng đọc từ COEFFS (không gõ lại số); lựa chọn dropdown đọc từ dữ liệu sheet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { COEFFS } from '../src/model/assumptions';
import { ciSteps, customerPicking, deadlineMinutes, salesOption, salesOptionChecks } from '../src/model/sales';
import { crossWarnings } from '../src/model/warnings';
import { causesFor, describePath } from '../src/ui/trace';
import { makeSanitizer } from '../src/sync/sanitize';
import { SALES_CUSTOMERS, SALES_LIMITS, SALES_TEXT, SALES_TEXT_MAX, validateDept } from '../src/sync/limits';
import { SyncController } from '../src/sync/controller';
import { MemoryHub, MockBackend } from '../src/sync/mockBackend';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => { const i: Inputs = structuredClone(base); f(i); return { i, r: simulate(i, d) }; };
const TU = salesOption(d, 'tradeUnit')!.choices!;
const DL = salesOption(d, 'orderDeadline')!.choices!;
const CUSTOMERS = d.sales.contracts.map((c) => c.customer);
const boxOf = () => TU.find((x) => /box/i.test(x))!;
const palletOf = () => TU.find((x) => /^pallet$/i.test(x))!;
const layerOf = () => TU.find((x) => /layer/i.test(x))!;

describe('Lựa chọn đọc từ sheet; đối chiếu R0 hai bảng cùng tab 6', () => {
  it('trade unit có 3 lựa chọn (thùng, layer, pallet), order deadline có ≥ 2 mốc giờ đọc được', () => {
    expect(TU.length).toBe(3);
    expect([boxOf(), layerOf(), palletOf()].every(Boolean)).toBe(true);
    expect(DL.length).toBeGreaterThanOrEqual(2);
    for (const x of DL) expect(deadlineMinutes(x)).not.toBeNull();
  });
  it('giá trị R0 của khối lựa chọn khớp bảng hợp đồng (deadline "20.00" = "20:00", % 95 = 0,95) và nằm trong lựa chọn / khoảng', () => {
    const checks = salesOptionChecks(d);
    expect(checks.length).toBeGreaterThan(20);
    for (const c of checks) {
      expect(c.same, `${c.customer} · ${c.field}: ${c.optionValue} ≠ ${c.contractValue}`).toBe(true);
      expect(c.inChoices, `${c.customer} · ${c.field}: ${c.optionValue}`).toBe(true);
    }
  });
  it('baseline dùng đúng chuỗi lựa chọn của sheet', () => {
    for (const c of CUSTOMERS) {
      expect(TU).toContain(base.sales.customers[c].tradeUnit);
      expect(DL).toContain(base.sales.customers[c].orderDeadline);
    }
  });
});

describe('Trade unit → giờ soạn hàng kho TP (Ops) → thời vụ → ROI', () => {
  it.each(CUSTOMERS)('%s: Box > Pallet layer > Pallet về giờ soạn hàng; doanh thu không đổi khi CI chưa nhập và hệ số = COEFFS', (c) => {
    const pick = (tu: string) => run((i) => { i.sales.customers[c].tradeUnit = tu; }).r;
    const box = pick(boxOf()), layer = pick(layerOf()), pal = pick(palletOf());
    expect(box.ops.fg.hoursBreakdown.picking).toBeGreaterThan(layer.ops.fg.hoursBreakdown.picking);
    expect(layer.ops.fg.hoursBreakdown.picking).toBeGreaterThan(pal.ops.fg.hoursBreakdown.picking);
    expect(box.ops.fg.hoursPerWeek).toBeGreaterThan(pal.ops.fg.hoursPerWeek);
    expect(box.ops.fg.flexCost).toBeGreaterThanOrEqual(pal.ops.fg.flexCost);
    // CI ước lượng theo COEFFS: bậc từ R0 tới Box
    const cu = box.sales.customers.find((x) => x.customer === c)!;
    expect(cu.contractIndex).toBeCloseTo(cu.contractIndexR0 * (1 + COEFFS.salesCiPerStepTradeUnit.value * cu.ciSteps.tradeUnit), 12);
    expect(cu.ciBasis).toBe(cu.tradeUnit === cu.tradeUnitR0 ? 'sheet' : 'estimate');
  });
  it('mọi khách chuyển sang Box: giờ kho TP tăng, thời vụ tăng, Operating profit giảm (khi hệ số CI = 0)', () => {
    const { r } = run((i) => { for (const c of CUSTOMERS) i.sales.customers[c].tradeUnit = boxOf(); });
    expect(r.ops.fg.hoursPerWeek).toBeGreaterThan(b.ops.fg.hoursPerWeek);
    expect(r.ops.fg.flexCost).toBeGreaterThan(b.ops.fg.flexCost);
    if (COEFFS.salesCiPerStepTradeUnit.value === 0) expect(r.finance.operatingProfit).toBeLessThan(b.finance.operatingProfit);
  });
  it('trade unit lấy từ ô Sales, không từ hợp đồng R0', () => {
    const i = structuredClone(base);
    i.sales.customers[CUSTOMERS[0]].tradeUnit = boxOf();
    expect(customerPicking(d, i)[0].pickUnit).toBe('case');
    expect(customerPicking(d)[0].pickUnit).not.toBe('case');
  });
  it('số bậc: nhỏ hơn R0 → dương; lớn hơn → âm', () => {
    const t0 = base.sales.customers["Dominick's"];
    expect(ciSteps(d, { ...t0, tradeUnit: boxOf() }, t0).tradeUnit).toBe(2);
    expect(ciSteps(d, { ...t0, tradeUnit: layerOf() }, t0).tradeUnit).toBe(1);
    const f0 = base.sales.customers['Food & Groceries'];
    expect(ciSteps(d, { ...f0, tradeUnit: palletOf() }, f0).tradeUnit).toBe(-1);
  });
});

describe('Order deadline: chưa mô hình vào giờ công / service level; CI theo COEFFS', () => {
  const early = [...DL].sort((a, z) => deadlineMinutes(a)! - deadlineMinutes(z)!)[0];
  const { i, r } = run((x) => { x.sales.customers['Food & Groceries'].orderDeadline = early; });
  const cu = r.sales.customers.find((x) => x.customer === 'Food & Groceries')!;
  it('giờ kho TP, thời vụ, service level không đổi', () => {
    expect(r.ops.fg.hoursPerWeek).toBe(b.ops.fg.hoursPerWeek);
    expect(r.ops.fg.flexCost).toBe(b.ops.fg.flexCost);
    expect(cu.slOrderLines).toBe(cu.slOrderLinesR0);
  });
  it('sớm hơn R0 → bậc âm; CI = R0 × (1 + hệ số × bậc); cờ "chưa nhập CI game"', () => {
    expect(cu.ciSteps.orderDeadline).toBeLessThan(0);
    expect(cu.contractIndex).toBeCloseTo(cu.contractIndexR0 * (1 + COEFFS.salesCiPerStepOrderDeadline.value * cu.ciSteps.orderDeadline), 12);
    expect(cu.ciStale).toBe(true);
    expect(cu.ciBasis).toBe('estimate');
  });
  it('có cảnh báo Sales → Ops, ghi rõ "CHƯA MÔ HÌNH" và lấy câu Info Center từ sheet', () => {
    const w = crossWarnings(d, base, i, r, b).find((x) => x.id === 'sales-dl-Food & Groceries')!;
    expect(w.from).toBe('Sales');
    expect(w.to).toContain('Ops');
    expect(w.detail).toContain('CHƯA MÔ HÌNH');
    expect(w.detail).toContain(salesOption(d, 'orderDeadline')!.impact);
  });
});

describe('CI game hiển thị → contracted sales, penalty, realized revenue, P&L', () => {
  const c = 'LAND Market';
  const k = d.sales.contracts.find((x) => x.customer === c)!;
  const ci = k.contractIndex * 1.03;
  const { r } = run((i) => { i.sales.customers[c].ciGame = ci; });
  const cu = r.sales.customers.find((x) => x.customer === c)!;
  it('contracted = R0 × CI game ÷ CI R0; penalty co giãn cùng tỷ lệ; nguồn = game', () => {
    expect(cu.ciBasis).toBe('game');
    expect(cu.ciStale).toBe(false);
    expect(cu.contracted).toBeCloseTo(cu.contractedR0 * ci / k.contractIndex, 6);
    expect(cu.penalty).toBeCloseTo(cu.penaltyR0 * ci / k.contractIndex, 6);
    expect(cu.revenue).toBeCloseTo(cu.contracted + cu.penalty, 6);
  });
  it('P&L: dòng Contracted sales khách = số mô hình; realized revenue = Σ khách; khách khác giữ đúng R0', () => {
    expect(r.finance.rows.find((x) => x.label === `Contracted sales – ${c}`)!.value).toBeCloseTo(cu.contracted, 6);
    expect(r.finance.realizedRevenue).toBeCloseTo(r.sales.realizedRevenue, 6);
    for (const o of r.sales.customers.filter((x) => x.customer !== c)) expect(o.contracted).toBe(o.contractedR0);
    expect(r.finance.roi).toBeGreaterThan(b.finance.roi);
  });
  it('nhập CI game bằng đúng CI R0 → mọi số = baseline', () => {
    const z = run((i) => { i.sales.customers[c].ciGame = k.contractIndex; }).r;
    expect(z.finance.realizedRevenue).toBe(b.finance.realizedRevenue);
    expect(z.finance.roi).toBe(b.finance.roi);
  });
});

describe('Truy vết & cảnh báo trade unit', () => {
  it('ô kho TP hiện "← do Sales đổi trade unit khách"', () => {
    expect(causesFor('fgHours', ['sales.customers.LAND Market.tradeUnit'])).toEqual([{ dept: 'Sales', label: 'trade unit khách' }]);
    expect(causesFor('sales', ['sales.customers.LAND Market.ciGame'])).toEqual([{ dept: 'Sales', label: 'CI game khách' }]);
    expect(describePath("sales.customers.Dominick's.orderDeadline")).toEqual({ dept: 'Sales', label: "order deadline (Dominick's)" });
  });
  it('cảnh báo Sales → Ops có Δ giờ soạn hàng và dòng Outbound flexible manpower', () => {
    const { i, r } = run((x) => { x.sales.customers["Dominick's"].tradeUnit = boxOf(); });
    const w = crossWarnings(d, base, i, r, b).find((x) => x.id === "sales-tu-Dominick's")!;
    expect(w.from).toBe('Sales');
    expect(w.to).toEqual(['Ops', 'Finance']);
    expect(w.detail).toMatch(/Giờ soạn hàng kho TP \+/);
    const flex = w.roi.find((x) => x.label === 'Outbound flexible manpower')!;
    expect(flex.delta).toBeGreaterThan(0);
  });
  it('baseline: không có cảnh báo Sales', () => {
    expect(crossWarnings(d, base, base, b, b).filter((x) => x.from === 'Sales')).toEqual([]);
  });
});

describe('Đồng bộ: sanitize, giới hạn, firestore.rules', () => {
  const sanitize = makeSanitizer(base);
  it('SALES_CUSTOMERS = đúng 3 khách trong sheet', () => {
    expect([...SALES_CUSTOMERS].sort()).toEqual([...CUSTOMERS].sort());
  });
  it('sanitize: nhận điều khoản hợp lệ; bỏ khách lạ, trường lạ, sai kiểu; bản lưu cũ ({} phẳng) → baseline', () => {
    const ok = { customers: { 'LAND Market': { tradeUnit: boxOf(), orderDeadline: DL[0], ciGame: 1.01 } } };
    const out = sanitize('sales', ok) as Inputs['sales'];
    expect(out.customers['LAND Market']).toEqual(ok.customers['LAND Market']);
    expect(out.customers['Food & Groceries']).toEqual(base.sales.customers['Food & Groceries']);
    const bad = sanitize('sales', { customers: { Hacker: { tradeUnit: 'x' }, 'LAND Market': { tradeUnit: 5, hack: 1, ciGame: 'cao' } }, junk: 1 }) as Record<string, unknown>;
    expect(bad).toEqual(base.sales);
    expect(sanitize('sales', {})).toEqual(base.sales);
    expect(sanitize('sales', { shelfLife: 0.7 })).toEqual(base.sales);
  });
  it('validateDept sales: chặn CI ngoài giới hạn, khách lạ, chuỗi quá dài; nhận ô bỏ trống', () => {
    expect(validateDept('sales', base.sales)).toEqual([]);
    const t = base.sales.customers['LAND Market'];
    expect(validateDept('sales', { customers: { 'LAND Market': { ...t, ciGame: 1.02 } } })).toEqual([]);
    expect(validateDept('sales', { customers: { 'LAND Market': { ...t, ciGame: 5 } } })[0].path).toBe('sales.customers.LAND Market.ciGame');
    expect(validateDept('sales', { customers: { Hacker: t } })[0].message).toMatch(/khách hàng/);
    expect(validateDept('sales', { customers: { 'LAND Market': { ...t, tradeUnit: 'x'.repeat(SALES_TEXT_MAX + 1) } } })[0].path).toBe('sales.customers.LAND Market.tradeUnit');
  });
  it('mọi lựa chọn trong sheet vừa giới hạn độ dài chuỗi của rules', () => {
    for (const x of [...TU, ...DL]) expect(x.length).toBeLessThanOrEqual(SALES_TEXT_MAX);
  });
  it('giới hạn Sales trong app khớp firestore.rules', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    expect(rules).toContain(`c.ciGame >= ${SALES_LIMITS.ciGame.min} && c.ciGame <= ${SALES_LIMITS.ciGame.max}`);
    for (const k of SALES_TEXT) expect(rules, k).toContain(`c.${k}.size() <= ${SALES_TEXT_MAX}`);
    for (const c of SALES_CUSTOMERS) expect(rules, c).toMatch(new RegExp(`validCust\\(m\\[['"]${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\]\\)`));
  });
});

describe('Đồng bộ nhóm: Sales sửa trade unit → máy Ops thấy và giờ kho TP đổi', () => {
  let hub: MemoryHub;
  beforeEach(() => { hub = new MemoryHub(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('ghi qua bản chung, có nhật ký "Sales đổi trade unit khách (…)"', async () => {
    const sanitize = makeSanitizer(base);
    const mk = async (role: 'sales' | 'ops', id: string) => { const c = new SyncController(new MockBackend(hub, `uid-${id}`), base, { team: 'test-team-001', role, clientId: id, sanitize, validate: validateDept, debounceMs: 500 }); await c.start(); return c; };
    const sales = await mk('sales', 'S'), ops = await mk('ops', 'O');
    const cur = sales.current().sales;
    sales.editShared('sales', { customers: { ...cur.customers, 'LAND Market': { ...cur.customers['LAND Market'], tradeUnit: boxOf() } } });
    await vi.advanceTimersByTimeAsync(600);
    expect(ops.current().sales.customers['LAND Market'].tradeUnit).toBe(boxOf());
    expect(simulate(ops.current(), d).ops.fg.hoursPerWeek).toBeGreaterThan(b.ops.fg.hoursPerWeek);
    expect(ops.getState().log[0].summary).toMatch(/Sales đổi trade unit khách \(LAND Market\)/);
  });
});
