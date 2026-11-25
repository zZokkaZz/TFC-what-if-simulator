// Supply Chain — tồn kho NL và TP theo safety stock / lot size / production interval.
// M1: quyết định SC giữ R0 (chưa sửa trên giao diện) nhưng mọi công thức đã nhận tham số,
// nên M2 chỉ cần mở ô nhập.
import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import type { Inputs, ComponentFlow, SkuProduction, OpsResults, ScResults, SheetCell } from './types';
import { baselineInputs as baselineInputsSc } from './baseline';
import type { Calibration } from './calibration';
import { activeSupplier, COMPONENTS } from './purchasing';
import type { Est } from './assumptions';
import { COEFFS } from './assumptions';
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
    // Reliability thực tế: NCC R0 = số sheet; NCC mới / đổi cam kết = ước lượng hoặc số đội nhập (purchasing.ts)
    const reliability = s.reliability;
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
    // Frozen period: CHƯA MÔ HÌNH (theo yêu cầu người dùng) → luôn dùng frozen R0, đổi ô này không đổi số nào
    const protectionWeeks = dec.productionIntervalDays / ROUND.daysPerWeek + data.supplyChain.frozenPeriodWeeks;
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

// ======================= C2: tuổi tồn → obsolete (ước lượng, hiệu chỉnh R0) =======================
/**
 * Tỷ lệ hàng quá tuổi cho phép khi xuất kho. Giả định: tuổi lúc xuất ~ Đều[S, S+P] + Chuẩn(0, σ)
 * (S = safety stock TP, P = chu kỳ sản xuất, đều tính bằng tuần; A = tuổi cho phép = hạn dùng × (1 − shelf life khách đòi)).
 * = σ/P × [L((A−S−P)/σ) − L((A−S)/σ)], L(z) = E[(Z − z)+] với Z ~ N(0,1).
 */
export function overAgeShare(S: number, P: number, A: number, sigma: number): number {
  const clip = (x: number) => Math.min(1, Math.max(0, x));
  if (sigma <= 1e-9) return P <= 1e-9 ? (S > A ? 1 : 0) : clip((S + P - A) / P);
  if (P <= 1e-9) return 1 - Phi((A - S) / sigma);
  return clip((sigma / P) * (expectedAbove(0, 1, (A - S - P) / sigma) - expectedAbove(0, 1, (A - S) / sigma)));
}

/** σ tuổi tồn (tuần) của từng SKU, hiệu chỉnh để overAgeShare(quyết định R0) = obsolete R0 (tab 7). */
const sigmaCache = new WeakMap<Round0Data, Record<string, number | null>>();
export function obsoleteAgeSigma(data: Round0Data): Record<string, number | null> {
  const hit = sigmaCache.get(data);
  if (hit) return hit;
  const out: Record<string, number | null> = {};
  const A = allowedAge(data);
  for (const st of data.supplyChain.productStock) {
    const dec = data.supplyChain.products.find((p) => p.sku === st.sku);
    if (A === null || !dec || st.obsolete === null || st.obsolete === undefined) { out[st.sku] = null; continue; }
    const S = dec.safetyStockWeeks, P = dec.productionIntervalDays / ROUND.daysPerWeek;
    const f = (sg: number) => overAgeShare(S, P, A, sg) - st.obsolete;
    if (f(1e-6) >= 0) { out[st.sku] = 0; continue; }
    let lo = 1e-6, hi = 50;
    if (f(hi) <= 0) { out[st.sku] = hi; continue; }
    for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
    out[st.sku] = (lo + hi) / 2;
  }
  sigmaCache.set(data, out);
  return out;
}

/** Tuổi cho phép (tuần) = hạn dùng SP (tab 3) × (1 − shelf life khách đòi cao nhất, tab 6). null = thiếu dữ liệu. */
function allowedAge(data: Round0Data): number | null {
  const shelf = data.productShelfLifeWeeks;
  const req = data.sales.contracts.length ? Math.max(...data.sales.contracts.map((c) => c.shelfLife)) : null;
  return shelf !== null && req !== null ? shelf * (1 - req) : null;
}

// ======================= Kết quả Supply Chain (M2) =======================

/**
 * Độ dốc service level (pieces) theo plan adherence — hồi quy trên 6 SKU R0 (tab 7): ≈ 0,97, R² ≈ 0,95.
 * ƯỚC LƯỢNG: dùng quan hệ cắt ngang giữa các SKU của R0 cho thay đổi theo thời gian (game không công bố).
 */
export function adherenceSlSlope(data: Round0Data): { slope: number; r2: number } {
  const st = data.supplyChain.productStock.filter((p) => p.planAdherence !== null && p.slPieces !== null);
  const xs = st.map((p) => p.planAdherence as number), ys = st.map((p) => p.slPieces as number);
  const n = xs.length;
  if (n < 3) return { slope: 0, r2: 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (sxx <= 0) return { slope: 0, r2: 0 };
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
  const ssRes = ys.reduce((s, y, i) => s + (y - (my + slope * (xs[i] - mx))) ** 2, 0);
  const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  return { slope, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0 };
}

/**
 * Tổng hợp kết quả SC từ model Ops (dòng NL, tồn TB, availability) + rủi ro TP.
 * Giá trị tồn = giá trị tồn R0 từng NL/SKU (tab 7) × (tồn TB mô hình ÷ tồn TB baseline) → baseline = đúng €321.425.
 * Service level TP dự kiến: dạng cộng thêm so với SL pieces R0 (ước lượng); đưa vào penalty/doanh thu ở sales.ts (M3).
 */
export function simulateSupplyChain(inputs: Inputs, data: Round0Data, ops: OpsResults, baseOps: OpsResults | null): ScResults {
  const prisk = productRisk(inputs, data, ops.production);
  const pbase = baseOps ? productRisk(baselineFromOps(data), data, baseOps.production) : prisk;
  // Ô hiển thị: số sheet × (mô hình kịch bản ÷ mô hình baseline) → không đổi gì thì đúng số sheet
  const ratio = (x: number, xb: number | undefined) => (xb && Math.abs(xb) > 1e-12 ? x / xb : 1);
  const cell = (r0: number | null, k: number, basis: SheetCell['basis'] = 'scaled'): SheetCell => ({ r0, value: r0 === null ? null : r0 * k, basis: Math.abs(k - 1) < 1e-9 ? 'sheet' : basis });
  const keep = (r0: number | null): SheetCell => ({ r0, value: r0, basis: 'notModeled' });
  const components = COMPONENTS.map((c) => {
    const st = data.supplyChain.componentStock.find((x) => x.component === c)!;
    const flow = ops.components.find((f) => f.key === c)!;
    const fb = baseOps?.components.find((f) => f.key === c);
    const r = ops.scLink.risk[c];
    const kStock = ops.scLink.rmStockRatio[c];
    const kUse = ratio(flow.usagePerWeek, fb?.usagePerWeek);
    const avail = ops.scLink.componentAvailability[c];
    const anRow = data.analysis.components.find((x) => x.component === c);
    return {
      key: c,
      sheet: {
        reliability: { r0: st.supplierReliability, value: r.reliability, basis: Math.abs(r.reliability - st.supplierReliability) < 1e-9 ? 'sheet' : 'model' } as SheetCell,
        stockUnits: cell(st.stockUnits, kStock),
        stockWeeks: cell(st.stockWeeks, kStock / kUse),
        stockValue: cell(st.stockValue, kStock),
        economicWeeks: keep(st.economicWeeks),
        demandPerWeek: cell(st.demandPerWeek, kUse),
        obsoletes: keep(st.obsoletes),
        availability: { r0: st.availability, value: avail, basis: Math.abs(avail - st.availability) < 1e-9 ? 'sheet' : 'model' } as SheetCell,
        bias: keep(st.bias),
        amountPurchased: cell(st.purchasedInRound, ratio(flow.purchasedPerWeek, fb?.purchasedPerWeek)),
        orderSize: cell(st.orderSize, ratio(flow.orderUnits, fb?.orderUnits)),
      },
      deliveries: cell(anRow?.orderLinesPerRound ?? null, ratio(flow.deliveriesPerRound, fb?.deliveriesPerRound)),
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
  const slSlope = adherenceSlSlope(data).slope;
  // Tỷ lệ thiếu hàng TB R0 (1 − SL pieces, 6 SKU tab 7) — quy độ dốc capacity "tại R0" ra hệ số bão hòa
  const shortageR0 = data.supplyChain.productStock.reduce((s, p) => s + (1 - p.slPieces), 0) / Math.max(1, data.supplyChain.productStock.length);
  const ageSigma = obsoleteAgeSigma(data);
  const ageA = allowedAge(data);
  const products = ops.production.map((p) => {
    const st = data.supplyChain.productStock.find((x) => x.sku === p.sku)!;
    const r = prisk[p.sku], b = pbase[p.sku];
    const theoryWeeks = (inputs.sc.products[p.sku].safetyStockWeeks + p.intervalDays / ROUND.daysPerWeek / 2);
    const pb = baseOps?.production.find((x) => x.sku === p.sku);
    const kFg = ops.scLink.fgStockRatio[p.sku];
    // SL TP dự kiến (ước lượng) = SL R0 − Δ thiếu hàng (safety stock TP, interval) + độ dốc R0 × Δ plan adherence
    // (plan adherence đã gồm availability NL & capacity dây chuyền). Baseline = đúng số sheet.
    // V1: tách Δ plan adherence = phần do availability NL (dMat) + phần do capacity dây chuyền (dCap)
    //  - phần NL: tuyến tính, độ dốc hồi quy 6 SKU R0 (chênh lệch giữa SKU trong R0 chỉ do thiếu Vitamin C);
    //  - phần capacity: bão hòa mũ trên tỷ lệ thiếu hàng, độ dốc tại R0 = COEFFS.capacitySlopeB (số chính) /
    //    COEFFS.capacitySlopeC; "thận trọng" = SL thấp hơn của 2 phương án (luôn ≤ số chính).
    const capB = baseOps ? baseOps.line.capacityAdherence : ops.line.capacityAdherence;
    const dMat = pb ? capB * (p.availability - pb.availability) : 0;
    const dCap = pb ? p.availability * (ops.line.capacityAdherence - capB) : 0;
    const clip01 = (x: number) => Math.min(1, Math.max(0, x));
    const sl0 = st.slPieces - (r.shortRate - b.shortRate) + slSlope * dMat;
    const withCap = (slopeAtR0: number) => (Math.abs(dCap) < 1e-12 ? clip01(sl0) : clip01(1 - clip01(1 - sl0) * Math.exp(-(slopeAtR0 / shortageR0) * dCap)));
    const slEst = withCap(COEFFS.capacitySlopeB.value);
    const slCons = Math.min(slEst, withCap(COEFFS.capacitySlopeC.value));
    const slOlEst = Math.min(1, Math.max(0, st.slOrderLines + (slEst - st.slPieces)));
    // C2: obsolete theo tuổi tồn = obsolete R0 × (tỷ lệ quá tuổi kịch bản ÷ tỷ lệ quá tuổi R0), σ hiệu chỉnh R0 × hệ số COEFFS
    const sg0 = ageSigma[p.sku];
    const P = p.intervalDays / ROUND.daysPerWeek, Sss = inputs.sc.products[p.sku].safetyStockWeeks;
    const dec0 = data.supplyChain.products.find((x) => x.sku === p.sku);
    let obsEst: number | null = st.obsolete ?? null;
    if (obsEst !== null && sg0 !== null && sg0 !== undefined && ageA !== null && dec0) {
      const sg = sg0 * COEFFS.obsoleteAgeSpreadScale.value;
      const fNew = overAgeShare(Sss, P, ageA, sg), fR0 = overAgeShare(dec0.safetyStockWeeks, dec0.productionIntervalDays / ROUND.daysPerWeek, ageA, sg);
      obsEst = fR0 > 1e-12 ? Math.min(1, st.obsolete * (fNew / fR0)) : st.obsolete + fNew;
      if (Math.abs(Sss - dec0.safetyStockWeeks) < 1e-12 && Math.abs(P - dec0.productionIntervalDays / ROUND.daysPerWeek) < 1e-12) obsEst = st.obsolete;
    }
    const kObs = st.obsolete ? (obsEst ?? st.obsolete) / st.obsolete : 1;
    const batches = ROUND.days / p.intervalDays;
    return {
      sku: p.sku,
      sheet: {
        demandPerWeek: keep(st.demandPerWeek ?? p.demandUnits),
        slPieces: { r0: st.slPieces, value: slEst, basis: Math.abs(slEst - st.slPieces) < 1e-9 ? 'sheet' : 'model' } as SheetCell,
        slOrderLines: { r0: st.slOrderLines, value: slOlEst, basis: Math.abs(slOlEst - st.slOrderLines) < 1e-9 ? 'sheet' : 'model' } as SheetCell,
        stockWeeks: cell(st.stockWeeks, kFg),
        stockValue: cell(st.stockValue, kFg),
        economicWeeks: keep(st.economicWeeks),
        floatingStock: keep(st.floatingStockValue),
        obsoletes: obsEst === null ? keep(st.obsolete) : { r0: st.obsolete, value: obsEst, basis: Math.abs(obsEst - st.obsolete) < 1e-12 ? 'sheet' : 'model' } as SheetCell,
        obsoleteValuePerWeek: cell(st.obsoleteValuePerWeek, kObs, 'model'),
        mape: keep(st.mape),
        bias: keep(st.bias),
        batches: { r0: st.batches, value: batches, basis: Math.abs(batches - st.batches) < 1e-9 ? 'sheet' : 'model' } as SheetCell,
        startupLoss: cell(st.startupLossEur, ratio(p.startupLossEur, pb?.startupLossEur)),
        rejects: keep(st.rejectsEur),
        planAdherence: cell(st.planAdherence, ratio(p.adherence, pb?.adherence)),
      },
      intervalDays: p.intervalDays,
      safetyStockWeeks: inputs.sc.products[p.sku].safetyStockWeeks,
      batchesPerRound: ROUND.days / p.intervalDays,
      avgStockWeeks: st.stockWeeks * ops.scLink.fgStockRatio[p.sku],
      theoryStockWeeks: theoryWeeks,
      stockValue: st.stockValue * ops.scLink.fgStockRatio[p.sku],
      stockValueR0: st.stockValue,
      slPiecesR0: st.slPieces,
      slPiecesEst: slEst,
      slPiecesEstCons: slCons,
      obsoleteEst: obsEst ?? st.obsolete,
      obsoleteValuePerWeek: (st.obsoleteValuePerWeek ?? 0) * kObs,
      obsoleteValuePerWeekR0: st.obsoleteValuePerWeek ?? 0,
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
  return {
    components, products, stockValue: { components: rmValue, products: fgValue, total: rmValue + fgValue, componentsR0: rmR0, productsR0: fgR0 },
    obsoleteValuePerWeek: products.reduce((s, p) => s + p.obsoleteValuePerWeek, 0),
    obsoleteValuePerWeekR0: products.reduce((s, p) => s + p.obsoleteValuePerWeekR0, 0),
  };
}

/** Quyết định SC/Ops/Purchasing của R0 (để tính rủi ro baseline cùng cách). */
function baselineFromOps(data: Round0Data): Inputs {
  return baselineInputsSc(data);
}
