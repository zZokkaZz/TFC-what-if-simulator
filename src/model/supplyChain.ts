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
import { requiredServiceLevel, requiredShelfLife } from './sales';

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

/** Số đơn vị NL trong 1 trade unit (Pallet, Pallet layer, FTL = palletsPerFtl × pallet, Tank, IBC, Drum); null = không rõ. */
export function tradeUnitSize(data: Round0Data, c: ComponentKey, tradeUnit: string): number | null {
  const comp = data.components.find((x) => x.key === c);
  if (!comp) return null;
  const t = tradeUnit.toLowerCase();
  if (comp.liquidUnits) {
    if (t.includes('tank')) return comp.liquidUnits.tank;
    if (t.includes('ibc')) return comp.liquidUnits.ibc;
    if (t.includes('drum')) return comp.liquidUnits.drum;
    return null;
  }
  if (!comp.unitsPerPallet) return null;
  if (t.includes('ftl')) return data.palletsPerFtl ? data.palletsPerFtl * comp.unitsPerPallet : null;
  if (t.includes('layer')) return comp.unitsPerLayer ?? null;
  if (t.includes('pallet')) return comp.unitsPerPallet;
  return null;
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
    // Cỡ đơn theo lot size (hiệu chỉnh R0). Trade unit: mỗi lần nhận ≥ 1 đơn vị (FTL 30 pallet, Tank, IBC, Drum, Pallet, layer);
    // đổi trade unit khác R0 → làm tròn lên bội số. Giữ trade unit R0 → không làm tròn (cỡ đơn R0, vd Orange 172.581 L, không phải bội số tank).
    const lotOrder = lotSizeWeeks * purchased + cal.orderOffsetWeeks[c] * usage;
    const unit = tradeUnitSize(data, c, sup.tradeUnit);
    const tuR0 = data.purchasing.contracts.find((x) => x.component === c)?.tradeUnit ?? sup.tradeUnit;
    let order = unit ? Math.max(lotOrder, unit) : lotOrder;
    if (unit && sup.tradeUnit.trim().toLowerCase() !== tuR0.trim().toLowerCase()) order = Math.ceil(order / unit - 1e-9) * unit;
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
      // σ co giãn theo nhu cầu (CV giữ R0 — promotion làm nhu cầu biến động hơn: CHƯA mô hình)
      const dR0 = data.products.find((x) => x.key === p.sku)!.demandPerWeek;
      const sd = (data.weekly.std[p.sku] ?? 0) * cal.prodFactor * bom * (dR0 > 0 ? p.demandUnits / dR0 : 1);
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
    // σ co giãn theo nhu cầu (promotion): CV giữ R0 — biến động thêm do khuyến mãi CHƯA mô hình
    const dR0 = data.products.find((x) => x.key === p.sku)?.demandPerWeek ?? 0;
    const sigmaWeek = (data.weekly.std[p.sku] ?? 0) * (dR0 > 0 && Math.abs(p.demandUnits - dR0) > 1e-9 * dR0 ? p.demandUnits / dR0 : 1);
    // Frozen period: CHƯA MÔ HÌNH (theo yêu cầu người dùng) → luôn dùng frozen R0, đổi ô này không đổi số nào
    const protectionWeeks = dec.productionIntervalDays / ROUND.daysPerWeek + data.supplyChain.frozenPeriodWeeks;
    const sigmaProtection = sigmaWeek * Math.sqrt(protectionWeeks);
    const ssUnits = dec.safetyStockWeeks * p.demandUnits;
    const z = sigmaProtection > 0 ? ssUnits / sigmaProtection : 10;
    const cycles = ROUND.days / dec.productionIntervalDays;
    const shortRate = p.demandUnits > 0 ? (cycles * sigmaProtection * G(z)) / (p.demandUnits * ROUND.weeks) : 0;
    // SL hứa & shelf life: cao nhất trong các khách mua SKU, theo ô Sales (R0 = tab 6)
    const targetServiceLevel = requiredServiceLevel(data, inputs, p.sku) ?? 0.95;
    const reqShelf = requiredShelfLife(data, inputs, p.sku);
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
  const ageA = allowedAge(data); // tuổi cho phép R0 (dùng cho hiệu chỉnh σ)
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
    // SL order lines: mức THIẾU co giãn tỷ lệ với mức thiếu pieces (R0 → R1 game: 6 SKU, tỷ số 2 mức thiếu lệch ≤ 0,09 — ROUND1_BACKTEST.md)
    const slOlEst = st.slPieces < 1 - 1e-9 ? clip01(1 - (1 - st.slOrderLines) * ((1 - slEst) / (1 - st.slPieces))) : clip01(st.slOrderLines + (slEst - st.slPieces));
    // C2: obsolete theo tuổi tồn = obsolete R0 × (tỷ lệ quá tuổi kịch bản ÷ tỷ lệ quá tuổi R0), σ hiệu chỉnh R0 × hệ số COEFFS
    const sg0 = ageSigma[p.sku];
    const P = p.intervalDays / ROUND.daysPerWeek, Sss = inputs.sc.products[p.sku].safetyStockWeeks;
    const dec0 = data.supplyChain.products.find((x) => x.sku === p.sku);
    let obsEst: number | null = st.obsolete ?? null;
    // Tuổi cho phép kịch bản = hạn dùng × (1 − shelf life cao nhất của khách mua SKU, ô Sales)
    const ageNew = r.allowedAgeWeeks;
    if (obsEst !== null && sg0 !== null && sg0 !== undefined && ageA !== null && ageNew !== null && dec0) {
      const sg = sg0 * COEFFS.obsoleteAgeSpreadScale.value;
      const fNew = overAgeShare(Sss, P, ageNew, sg), fR0 = overAgeShare(dec0.safetyStockWeeks, dec0.productionIntervalDays / ROUND.daysPerWeek, ageA, sg);
      obsEst = fR0 > 1e-12 ? Math.min(1, st.obsolete * (fNew / fR0)) : st.obsolete + fNew;
      if (Math.abs(Sss - dec0.safetyStockWeeks) < 1e-12 && Math.abs(P - dec0.productionIntervalDays / ROUND.daysPerWeek) < 1e-12 && Math.abs(ageNew - ageA) < 1e-12) obsEst = st.obsolete;
      // Tồn thực tế ∝ plan adherence (R0 + R1) → hàng quá tuổi cũng vậy: R1 game SKU giữ SS 3 có obsolete tăng theo adherence
      // (Orange 1L 8,4 → 9,1%; C-power 1L 7,1 → 9,0%; C-power PET 5,5 → 8,1%)
      if (pb && pb.adherence > 1e-9 && Math.abs(p.adherence - pb.adherence) > 1e-12) obsEst = Math.min(1, obsEst * (p.adherence / pb.adherence));
    }
    // Giá trị obsolete/tuần ∝ tỷ lệ hủy × lượng (promotion đổi lượng; không đổi gì → đúng số tab 7)
    const kVol = ratio(p.demandUnits, pb?.demandUnits);
    const kObs = (st.obsolete ? (obsEst ?? st.obsolete) / st.obsolete : 1) * kVol;
    const batches = ROUND.days / p.intervalDays;
    return {
      sku: p.sku,
      sheet: {
        demandPerWeek: st.demandPerWeek === null || st.demandPerWeek === undefined ? keep(p.demandUnits) : cell(st.demandPerWeek, ratio(p.demandUnits, pb?.demandUnits)), // promotion (ô Sales)
        slPieces: { r0: st.slPieces, value: slEst, basis: Math.abs(slEst - st.slPieces) < 1e-9 ? 'sheet' : 'model' } as SheetCell,
        slOrderLines: { r0: st.slOrderLines, value: slOlEst, basis: Math.abs(slOlEst - st.slOrderLines) < 1e-9 ? 'sheet' : 'model' } as SheetCell,
        stockWeeks: cell(st.stockWeeks, kFg / kVol), // số tuần = tồn ÷ nhu cầu/tuần mới (promotion đổi nhu cầu)
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
      avgStockWeeks: st.stockWeeks * ops.scLink.fgStockRatio[p.sku] / kVol,
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
    components, products, stockValue: { components: rmValue, products: fgValue, total: rmValue + fgValue, componentsR0: rmR0, productsR0: fgR0, componentsAtR0Price: rmValue, productsAtR0Price: fgValue },
    obsoleteValuePerWeek: products.reduce((s, p) => s + p.obsoleteValuePerWeek, 0),
    obsoleteValuePerWeekR0: products.reduce((s, p) => s + p.obsoleteValuePerWeekR0, 0),
  };
}

/** Quyết định SC/Ops/Purchasing của R0 (để tính rủi ro baseline cùng cách). */
function baselineFromOps(data: Round0Data): Inputs {
  return baselineInputsSc(data);
}

/**
 * Định giá lại tồn theo GIÁ MUA MỚI (gồm vận chuyển) — game định giá tồn NL theo giá mua TB, tồn TP theo giá vốn (tab 7 popup).
 * R1 game: PET Philyp €0,0479 vs Trio €0,0547 → giá trị tồn NL R1 = 0,821 × R0 và Interest components cũng 0,821 × R0.
 * NL: giá trị × (giá mua mới ÷ giá mua baseline mô hình). TP: giá vốn/đv R0 + Σ BOM × Δ giá NL. Start-up loss (vật tư hao hụt): × tỷ lệ chi phí vật tư.
 * Không đổi NCC / điều kiện → tỷ lệ = 1 → đúng số sheet.
 */
export function repriceStock(sc: ScResults, data: Round0Data, priceNow: Record<ComponentKey, number>, priceBase: Record<ComponentKey, number>, unitCostR0: Record<SkuKey, number>): { sc: ScResults; materialRatio: Record<SkuKey, number> } {
  const k = Object.fromEntries(COMPONENTS.map((c) => [c, priceBase[c] > 0 ? priceNow[c] / priceBase[c] : 1])) as Record<ComponentKey, number>;
  const p0 = Object.fromEntries(COMPONENTS.map((c) => [c, data.purchasing.results.find((r) => r.component === c)?.pricePaid ?? 0])) as Record<ComponentKey, number>;
  const same = COMPONENTS.every((c) => Math.abs(k[c] - 1) < 1e-12);
  const materialRatio = {} as Record<SkuKey, number>;
  for (const p of data.products) {
    const m0 = COMPONENTS.reduce((s, c) => s + p.bom[c] * p0[c], 0);
    const m1 = COMPONENTS.reduce((s, c) => s + p.bom[c] * p0[c] * k[c], 0);
    materialRatio[p.key] = m0 > 0 ? m1 / m0 : 1;
  }
  if (same) return { sc, materialRatio };
  const components = sc.components.map((c) => {
    const f = k[c.key];
    return { ...c, stockValue: c.stockValue * f, sheet: { ...c.sheet, stockValue: { ...c.sheet.stockValue, value: c.sheet.stockValue.value === null ? null : c.sheet.stockValue.value * f, basis: 'model' as const } } };
  });
  const products = sc.products.map((p) => {
    const prod = data.products.find((x) => x.key === p.sku)!;
    const u0 = unitCostR0[p.sku];
    const du = COMPONENTS.reduce((s, c) => s + prod.bom[c] * p0[c] * (k[c] - 1), 0);
    const f = u0 > 0 ? (u0 + du) / u0 : 1;
    const sl = p.sheet.startupLoss;
    return {
      ...p, stockValue: p.stockValue * f,
      sheet: {
        ...p.sheet,
        stockValue: { ...p.sheet.stockValue, value: p.sheet.stockValue.value === null ? null : p.sheet.stockValue.value * f, basis: 'model' as const },
        startupLoss: { ...sl, value: sl.value === null ? null : sl.value * materialRatio[p.sku], basis: 'model' as const },
      },
    };
  });
  const rmValue = components.reduce((s, c) => s + c.stockValue, 0);
  const fgValue = products.reduce((s, p) => s + p.stockValue, 0);
  return { sc: { ...sc, components, products, stockValue: { ...sc.stockValue, components: rmValue, products: fgValue, total: rmValue + fgValue } }, materialRatio };
}
