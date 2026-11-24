// Supply Chain — tồn kho NL và TP theo safety stock / lot size / production interval.
// M1: quyết định SC giữ R0 (chưa sửa trên giao diện) nhưng mọi công thức đã nhận tham số,
// nên M2 chỉ cần mở ô nhập.
import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import type { Inputs, ComponentFlow, SkuProduction, OpsResults, ScResults } from './types';
import { baselineInputs as baselineInputsSc } from './baseline';
import type { Calibration } from './calibration';
import { activeSupplier, COMPONENTS } from './purchasing';
import type { Est } from './assumptions';
import { ROUND } from './rules';
import { expectedAbove, Phi } from './stats';
import type { ActiveSupplier } from './purchasing';

/** Số đơn vị lưu trữ (pallet location hoặc tank) cho một lượng NL. */
export function storageOf(data: Round0Data, c: ComponentKey, tradeUnit: string, units: number, est: Est): { kind: 'pallet' | 'tank'; locations: number; containers: number } {
  const comp = data.components.find((x) => x.key === c)!;
  if (comp.unitsPerPallet) return { kind: 'pallet', locations: units / comp.unitsPerPallet, containers: units / comp.unitsPerPallet };
  const lu = comp.liquidUnits!;
  const tu = tradeUnit.toLowerCase();
  if (tu.includes('tank')) {
    const tanks = units / lu.tank;
    return { kind: 'tank', locations: tanks, containers: tanks };
  }
  if (tu.includes('ibc')) {
    const ibc = units / lu.ibc;
    return { kind: 'pallet', locations: ibc / est.ibcPerPallet, containers: ibc };
  }
  const drums = units / lu.drum;
  return { kind: 'pallet', locations: drums / est.drumsPerPallet, containers: drums };
}

export function componentFlows(inputs: Inputs, data: Round0Data, cal: Calibration, production: SkuProduction[], est: Est): ComponentFlow[] {
  return COMPONENTS.map((c) => {
    const sup = activeSupplier(inputs, data, c);
    const usage = production.reduce((s, p) => {
      const prod = data.products.find((x) => x.key === p.sku)!;
      const extraUnits = (p.excessLitersPerBatch * p.batchesPerWeek) / prod.litersPerUnit;
      return s + prod.bom[c] * (p.prodUnits + extraUnits);
    }, 0);
    const purchased = usage / (1 - sup.rejection);
    const { safetyStockWeeks, lotSizeWeeks } = inputs.sc.components[c];
    // Không làm tròn theo trade unit: cỡ đơn R0 (vd PET 951.612 cái) không phải bội số pallet/drum.
    const order = lotSizeWeeks * purchased * cal.orderRatio[c];
    // Tồn TB lý thuyết = safety stock + ½ lô (phần dùng được). ops.ts quy về mức R0 thực tế (tab 11).
    const avgStock = safetyStockWeeks * usage + (order * (1 - sup.rejection)) / 2;
    const st = storageOf(data, c, sup.tradeUnit, avgStock, est);
    const perDelivery = storageOf(data, c, sup.tradeUnit, order, est);
    return {
      key: c,
      supplier: sup.supplier,
      tradeUnit: sup.tradeUnit,
      usagePerWeek: usage,
      purchasedPerWeek: purchased,
      orderUnits: order,
      deliveriesPerRound: purchased > 0 ? (purchased * ROUND.weeks) / order : 0,
      avgStockUnits: avgStock,
      avgStockWeeks: usage > 0 ? avgStock / usage : 0,
      storage: st.kind,
      avgLocations: st.locations,
      palletsPerDelivery: perDelivery.kind === 'pallet' ? perDelivery.locations : 0,
    };
  });
}

/** Tồn TP trung bình LÝ THUYẾT (đv) = (SS + ½ chu kỳ sản xuất) × nhu cầu/tuần.
 *  ops.ts nhân với tỷ lệ thực tế/lý thuyết của R0 (tab 11) để ra tồn mô hình. */
export function fgTheoryUnits(inputs: Inputs, sku: SkuKey, demandPerWeek: number): number {
  const d = inputs.sc.products[sku];
  return (d.safetyStockWeeks + d.productionIntervalDays / ROUND.daysPerWeek / 2) * demandPerWeek;
}

// ======================= Rủi ro hết hàng (M2) =======================
// Công thức chuẩn (CLAUDE.md mục 6): thiếu hàng kỳ vọng mỗi chu kỳ = σ_P × G(z), z = SS ÷ σ_P,
// G(z) = φ(z) − z·(1 − Φ(z)). Để KHÔNG phá hiệu chỉnh, kết quả dùng dạng CỘNG THÊM so với R0:
//   availability = availability R0 − (tỷ lệ thiếu mới − tỷ lệ thiếu baseline)  → baseline = đúng số game.


export interface ComponentRisk {
  key: ComponentKey;
  leadTimeWeeks: number; // lead time NCC (ngày ÷ 7) + intake time (ngày làm việc ÷ 5)
  reliability: number;
  sigmaWeek: number; // σ nhu cầu NL/tuần (từ σ nhu cầu SKU tab 12 qua BOM)
  sigmaProtection: number;
  ssUnits: number;
  z: number;
  shortRate: number; // thiếu hàng kỳ vọng / lượng dùng
  recommendedSsWeeks: number; // để cycle service 99%
}

export interface ProductRisk {
  sku: SkuKey;
  sigmaWeek: number;
  protectionWeeks: number; // production interval + frozen period (ước lượng)
  sigmaProtection: number;
  ssUnits: number;
  z: number;
  shortRate: number;
  targetServiceLevel: number; // SL hứa thấp nhất trong các hợp đồng mua SKU (tab 6)
  recommendedSsWeeks: number; // z(SL hứa) × σ_P ÷ nhu cầu
  maxAgeWeeks: number; // tuổi tồn lớn nhất ≈ SS + chu kỳ sản xuất
  allowedAgeWeeks: number | null; // hạn dùng × (1 − shelf life khách đòi); null = thiếu dữ liệu
}

const G = (z: number) => expectedAbove(0, 1, z);
/** z để Φ(z) = p (tìm nhị phân). */
export function zOf(p: number): number {
  let lo = -5, hi = 5;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (Phi(m) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export function componentRisk(inputs: Inputs, data: Round0Data, cal: Calibration, production: SkuProduction[], flows: ComponentFlow[], sup: Record<ComponentKey, ActiveSupplier>): Record<ComponentKey, ComponentRisk> {
  const out = {} as Record<ComponentKey, ComponentRisk>;
  for (const f of flows) {
    const c = f.key;
    const s = sup[c];
    const r0 = data.purchasing.results.find((r) => r.supplier === s.supplier && r.component === c);
    const reliability = r0?.reliability ?? s.agreedReliability;
    const sigmaWeek = Math.sqrt(production.reduce((acc, p) => {
      const bom = data.products.find((x) => x.key === p.sku)!.bom[c];
      const sd = (data.weekly.std[p.sku] ?? 0) * cal.prodFactor * bom;
      return acc + sd * sd;
    }, 0));
    const leadTimeWeeks = s.leadTimeDays / 7 + inputs.ops.intakeDays / ROUND.daysPerWeek;
    const d = f.usagePerWeek;
    const sigmaLT = (1 - reliability) * leadTimeWeeks; // độ lệch giao hàng (tuần) — ước lượng
    const sigmaProtection = Math.sqrt(leadTimeWeeks * sigmaWeek * sigmaWeek + d * d * sigmaLT * sigmaLT);
    const ssUnits = inputs.sc.components[c].safetyStockWeeks * d;
    const z = sigmaProtection > 0 ? ssUnits / sigmaProtection : 10;
    const shortRate = d > 0 ? (f.deliveriesPerRound * sigmaProtection * G(z)) / (d * ROUND.weeks) : 0;
    out[c] = { key: c, leadTimeWeeks, reliability, sigmaWeek, sigmaProtection, ssUnits, z, shortRate, recommendedSsWeeks: d > 0 ? (zOf(0.99) * sigmaProtection) / d : 0 };
  }
  return out;
}

export function productRisk(inputs: Inputs, data: Round0Data, production: SkuProduction[]): Record<SkuKey, ProductRisk> {
  const out = {} as Record<SkuKey, ProductRisk>;
  const shelf = data.productShelfLifeWeeks;
  for (const p of production) {
    const dec = inputs.sc.products[p.sku];
    const sigmaWeek = data.weekly.std[p.sku] ?? 0;
    const protectionWeeks = dec.productionIntervalDays / ROUND.daysPerWeek + inputs.sc.frozenPeriodWeeks;
    const sigmaProtection = sigmaWeek * Math.sqrt(protectionWeeks);
    const ssUnits = dec.safetyStockWeeks * p.demandUnits;
    const z = sigmaProtection > 0 ? ssUnits / sigmaProtection : 10;
    const cycles = ROUND.days / dec.productionIntervalDays;
    const shortRate = p.demandUnits > 0 ? (cycles * sigmaProtection * G(z)) / (p.demandUnits * ROUND.weeks) : 0;
    const buyers = data.sales.customerProduct.filter((r) => r.sku === p.sku).map((r) => r.customer);
    const contracts = data.sales.contracts.filter((c) => buyers.includes(c.customer));
    const targetServiceLevel = contracts.length ? Math.max(...contracts.map((c) => c.serviceLevel)) : 0.95;
    const reqShelf = contracts.length ? Math.max(...contracts.map((c) => c.shelfLife)) : null;
    out[p.sku] = {
      sku: p.sku, sigmaWeek, protectionWeeks, sigmaProtection, ssUnits, z, shortRate, targetServiceLevel,
      recommendedSsWeeks: p.demandUnits > 0 ? (zOf(targetServiceLevel) * sigmaProtection) / p.demandUnits : 0,
      maxAgeWeeks: dec.safetyStockWeeks + dec.productionIntervalDays / ROUND.daysPerWeek,
      allowedAgeWeeks: shelf !== null && reqShelf !== null ? shelf * (1 - reqShelf) : null,
    };
  }
  return out;
}

// ======================= Kết quả Supply Chain (M2) =======================

/**
 * Tổng hợp kết quả SC từ model Ops (dòng NL, tồn TB, availability) + rủi ro TP.
 * Giá trị tồn = giá trị tồn R0 từng NL/SKU (tab 7) × (tồn TB mô hình ÷ tồn TB baseline) → baseline = đúng €321.425.
 * Service level TP dự kiến: dạng cộng thêm so với SL pieces R0 (ước lượng); CHƯA đưa vào doanh thu (M3).
 */
export function simulateSupplyChain(inputs: Inputs, data: Round0Data, ops: OpsResults, baseOps: OpsResults | null): ScResults {
  const prisk = productRisk(inputs, data, ops.production);
  const pbase = baseOps ? productRisk(baselineFromOps(data), data, baseOps.production) : prisk;
  const components = COMPONENTS.map((c) => {
    const st = data.supplyChain.componentStock.find((x) => x.component === c)!;
    const flow = ops.components.find((f) => f.key === c)!;
    const r = ops.scLink.risk[c];
    return {
      key: c,
      supplier: flow.supplier,
      safetyStockWeeks: inputs.sc.components[c].safetyStockWeeks,
      lotSizeWeeks: inputs.sc.components[c].lotSizeWeeks,
      orderUnits: flow.orderUnits,
      deliveriesPerRound: flow.deliveriesPerRound,
      avgStockWeeks: flow.avgStockWeeks,
      avgLocations: flow.avgLocations,
      storage: flow.storage,
      stockValue: st.stockValue * ops.scLink.rmStockRatio[c],
      stockValueR0: st.stockValue,
      availability: ops.scLink.componentAvailability[c],
      availabilityR0: st.availability,
      leadTimeWeeks: r.leadTimeWeeks,
      reliability: r.reliability,
      recommendedSsWeeks: r.recommendedSsWeeks,
      stockoutDaysR0: data.dailyStats.stockoutDays[c] ?? null,
    };
  });
  const products = ops.production.map((p) => {
    const st = data.supplyChain.productStock.find((x) => x.sku === p.sku)!;
    const r = prisk[p.sku], b = pbase[p.sku];
    const theoryWeeks = (inputs.sc.products[p.sku].safetyStockWeeks + p.intervalDays / ROUND.daysPerWeek / 2);
    return {
      sku: p.sku,
      intervalDays: p.intervalDays,
      safetyStockWeeks: inputs.sc.products[p.sku].safetyStockWeeks,
      batchesPerRound: ROUND.days / p.intervalDays,
      avgStockWeeks: st.stockWeeks * ops.scLink.fgStockRatio[p.sku],
      theoryStockWeeks: theoryWeeks,
      stockValue: st.stockValue * ops.scLink.fgStockRatio[p.sku],
      stockValueR0: st.stockValue,
      slPiecesR0: st.slPieces,
      slPiecesEst: Math.min(1, Math.max(0, st.slPieces - (r.shortRate - b.shortRate))),
      targetServiceLevel: r.targetServiceLevel,
      recommendedSsWeeks: r.recommendedSsWeeks,
      maxAgeWeeks: r.maxAgeWeeks,
      allowedAgeWeeks: r.allowedAgeWeeks,
      obsoleteR0: st.obsolete,
      stockoutDaysR0: data.dailyStats.stockoutDays[p.sku] ?? null,
      componentAvailability: p.availability,
    };
  });
  const rmValue = components.reduce((s, c) => s + c.stockValue, 0);
  const fgValue = products.reduce((s, p) => s + p.stockValue, 0);
  const rmR0 = components.reduce((s, c) => s + c.stockValueR0, 0);
  const fgR0 = products.reduce((s, p) => s + p.stockValueR0, 0);
  return { components, products, stockValue: { components: rmValue, products: fgValue, total: rmValue + fgValue, componentsR0: rmR0, productsR0: fgR0 } };
}

/** Quyết định SC/Ops/Purchasing của R0 (để tính rủi ro baseline cùng cách). */
function baselineFromOps(data: Round0Data): Inputs {
  return baselineInputsSc(data);
}
