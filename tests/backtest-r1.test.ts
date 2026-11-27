// Backtest Round 1: chạy lại đúng bộ quyết định R1 (đọc từ data/TFC_Round1.xlsx → src/data/round1.json) và so với số game.
// Nhập CI / reliability / rejection THẬT của NCC (như đội nhập ô "số game") để đo lỗi cấu trúc của model.
// Ngưỡng ghi trong ROUND1_BACKTEST.md mục 9. Các hệ số "đã xác minh" bằng R1 được kiểm lại từ file (không gõ số).
import { describe, expect, it } from 'vitest';
import data from '../src/data/round0.json';
import r1j from '../src/data/round1.json';
import type { Round0Data } from '../src/data/types';
import type { Round1Data } from '../src/data/round1Types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { buildKpis } from '../src/model/kpi';
import { round1Inputs } from '../src/model/round1';
import { COEFFS } from '../src/model/assumptions';

const d = data as unknown as Round0Data;
const r1 = r1j as unknown as Round1Data;
const b = simulate(baselineInputs(d), d);
const r = simulate(round1Inputs(d, r1), d);
const kpi = (label: string) => buildKpis(d, r, b).find((k) => k.label === label)!.scenario!;
const fin = (re: RegExp) => r.finance.rows.find((x) => !x.isTotal && re.test(x.label))!.value;
const g = (re: RegExp) => r1.finance.rows.find((x) => re.test(x.label))!.r1;

describe('Dữ liệu R1 đọc đúng file', () => {
  it('ROI 5,04%, OP 200.194, Investment 3.971.406; realized = Σ contracted + phạt/thưởng', () => {
    expect(r1.finance.roi).toBe(0.0504);
    expect(r1.finance.operatingProfit).toBe(200194);
    expect(r1.finance.investment).toBe(3971406);
    expect(r1.finance.realizedRevenue).toBe(2646940);
  });
  it('R0 vẫn đúng từng ô sheet (ROI −7,68%) sau hiệu chỉnh R1', () => {
    expect((b.finance.roi * 100).toFixed(2)).toBe('-7.68');
  });
});

describe('Backtest R1: model ≈ game', () => {
  it('ROI trong ±0,5 điểm; OP ±€20k; Investment ±1%; doanh thu ±0,5%', () => {
    expect(Math.abs(r.finance.roi - r1.finance.roi)).toBeLessThan(0.005);
    expect(Math.abs(r.finance.operatingProfit - r1.finance.operatingProfit)).toBeLessThan(20000);
    expect(Math.abs(r.finance.investment / r1.finance.investment - 1)).toBeLessThan(0.01);
    expect(Math.abs(r.finance.realizedRevenue / r1.finance.realizedRevenue - 1)).toBeLessThan(0.005);
  });
  it('Sales: SL order lines từng khách ±1 điểm; thưởng (dấu dương) từng khách ±€1.500', () => {
    for (const c of r.sales.customers) {
      expect(Math.abs(c.slOrderLines - r1.customers[c.customer].slOrderLines), c.customer).toBeLessThan(0.01);
      expect(c.penalty).toBeGreaterThan(0);
      expect(Math.abs(c.penalty - r1.finance.penaltyBonus[c.customer]), c.customer).toBeLessThan(1500);
    }
    expect(Math.abs(kpi('Service level outbound order lines') - r1.kpi['Service level outbound order lines'])).toBeLessThan(0.01);
  });
  it('Ops: plan adherence ±1,5 điểm; changeover (+ giờ PM) ±0,5 giờ; run/unused/overtime ±0,6 giờ; start-up loss ±3%', () => {
    expect(Math.abs(kpi('Production plan adherence') - r1.kpi['Production plan adherence'])).toBeLessThan(0.015);
    const L = r.ops.line;
    expect(Math.abs(L.changeover + L.maintenance - r1.line.changeover)).toBeLessThan(0.5);
    for (const [m, gm] of [[L.run, r1.line.run], [L.unused, r1.line.unused], [L.overtime, r1.line.overtime]]) expect(Math.abs(m - gm)).toBeLessThan(0.6);
    expect(Math.abs(L.startupLossEur / r1.line.startupLossEur - 1)).toBeLessThan(0.03);
  });
  it('Kho TP: cube ±2 điểm; kho NL: overflow ±1 điểm, cube ±5 điểm; tank yard ±3%', () => {
    expect(Math.abs(kpi('Cube utilization finished goods warehouse') - r1.kpi['Cube utilization finished goods warehouse'])).toBeLessThan(0.02);
    expect(Math.abs(r.ops.rm.overflowShare - r1.warehouse.rm.overflow)).toBeLessThan(0.01);
    expect(Math.abs(kpi('Cube utilization raw materials warehouse') - r1.kpi['Cube utilization raw materials warehouse'])).toBeLessThan(0.05);
    expect(Math.abs(fin(/tank yard/i) / g(/tank yard/i) - 1)).toBeLessThan(0.03);
  });
  it('SC: tuần tồn TP từng SKU ±0,2; obsolete từng SKU ±1,2 điểm và dashboard ±0,6; tuần tồn KPI ±0,25', () => {
    for (const p of r.sc.products) {
      expect(Math.abs(p.sheet.stockWeeks.value! - r1.products[p.sku].stockWeeks), p.sku).toBeLessThan(0.2);
      expect(Math.abs(p.obsoleteEst - r1.products[p.sku].obsoletes), p.sku).toBeLessThan(0.012);
    }
    expect(Math.abs(kpi('Obsolete products (%)') - r1.kpi['Obsolete products (%)'])).toBeLessThan(0.006);
    expect(Math.abs(kpi('Stock products (weeks)') - r1.kpi['Stock products (weeks)'])).toBeLessThan(0.25);
    expect(Math.abs(kpi('Stock components (weeks)') - r1.kpi['Stock components (weeks)'])).toBeLessThan(0.25);
  });
  it('Finance: Stock ±2%, Payment terms ±1%, Interest on components/products ±5%, Costs of scrap ±5%', () => {
    expect(Math.abs(fin(/^Stock$/) / r1.finance.stock - 1)).toBeLessThan(0.02);
    expect(Math.abs(fin(/^Payment terms$/) / r1.finance.paymentTerms.r1 - 1)).toBeLessThan(0.01);
    expect(Math.abs(fin(/^Interest on components$/) / g(/^Interest components$/) - 1)).toBeLessThan(0.05);
    expect(Math.abs(fin(/^Interest on products$/) / g(/^Interest products$/) - 1)).toBeLessThan(0.05);
    expect(Math.abs(fin(/^Costs of scrap$/) / g(/^Costs of scrap$/) - 1)).toBeLessThan(0.05);
  });
  it('Giới hạn đã biết (chưa sửa, ghi ROUND1_BACKTEST.md): breakdown model thấp hơn game; phí FTL PET thấp hơn game', () => {
    expect(r.ops.line.breakdown).toBeLessThan(r1.line.breakdown);
    expect(r.purchasing.components.find((c) => c.key === 'PET')!.transportCost).toBeLessThan(r1.suppliers.PET.transportCosts);
  });
});

describe('Hệ số "đã xác minh" bằng R1 suy ra đúng từ file', () => {
  it('salesBonusRate = TB (thưởng ÷ contracted) của 3 khách R1', () => {
    const rates = Object.keys(r1.finance.penaltyBonus).map((c) => r1.finance.penaltyBonus[c] / r1.finance.contracted[c]);
    expect(Math.abs(COEFFS.salesBonusRate.value - rates.reduce((s, x) => s + x, 0) / rates.length)).toBeLessThan(5e-5);
  });
  it('obsoleteAgeSpreadScale: giá trị hiện tại cho sai số obsolete 6 SKU nhỏ hơn hai giá trị kề (±1)', () => {
    const rmse = (v: number) => {
      const old = COEFFS.obsoleteAgeSpreadScale.value;
      COEFFS.obsoleteAgeSpreadScale.value = v;
      const x = simulate(round1Inputs(d, r1), d);
      COEFFS.obsoleteAgeSpreadScale.value = old;
      return Math.sqrt(x.sc.products.reduce((s, p) => s + (p.obsoleteEst - r1.products[p.sku].obsoletes) ** 2, 0) / 6);
    };
    const v = COEFFS.obsoleteAgeSpreadScale.value;
    expect(rmse(v)).toBeLessThan(rmse(v - 1));
    expect(rmse(v)).toBeLessThan(rmse(v + 1));
  });
  it('rmLotDispersionExp: giá trị hiện tại cho overflow kho NL sát game hơn mũ 1 (cũ) và mũ 0', () => {
    const ovf = (v: number) => {
      const old = COEFFS.rmLotDispersionExp.value;
      COEFFS.rmLotDispersionExp.value = v;
      const x = simulate(round1Inputs(d, r1), d);
      COEFFS.rmLotDispersionExp.value = old;
      return Math.abs(x.ops.rm.overflowShare - r1.warehouse.rm.overflow);
    };
    const v = COEFFS.rmLotDispersionExp.value;
    expect(ovf(v)).toBeLessThan(ovf(1));
    expect(ovf(v)).toBeLessThan(ovf(0));
  });
});
