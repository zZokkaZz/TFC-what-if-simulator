// Operations — hàm thuần: kho NL, tank yard, máy trộn, dây chuyền đóng chai, kho TP, chi phí Ops.
// Không đụng DOM. Định mức từ rules.ts (luật game), giả định từ assumptions.ts,
// hệ số hiệu chỉnh từ calibration.ts (tự tính từ R0).
//
// Hai lớp:
//  1. opsCore: số trung bình tuần (dây chuyền, máy trộn, dòng NL, giờ công TB theo định mức).
//  2. replay theo ngày: dao động 130 ngày lấy từ tab 11 của R0, co giãn theo cỡ lô mới,
//     cộng quanh mức trung bình của mô hình → đỉnh, số ngày vượt, overflow, thời vụ.
import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import type { CostLine, Inputs, OpsResults, SkuProduction, WarehouseResult, ComponentFlow } from './types';
import type { Calibration } from './calibration';
import type { Est } from './assumptions';
import { BOTTLING, FG_NORMS, RM_NORMS, ROUND, TANK_YARD, WAREHOUSE } from './rules';
import { expectedAbove, expectedBelow } from './stats';
import { activeSupplier, COMPONENTS, type ActiveSupplier } from './purchasing';
import { COEFFS } from './assumptions';
import { componentFlows, componentRisk, fgTheoryUnits, type ComponentRisk } from './supplyChain';
import { customerPicking, demandBySku, obsoleteBySku, SKUS, unitCostBySku } from './sales';
import { baselineInputs } from './baseline';

const D = ROUND.days;
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

/** Hệ số hỏng máy theo chất lượng bao bì (trung bình theo lít đóng trên từng loại bao bì). */
function qualityFactor(data: Round0Data, production: SkuProduction[], quality: Record<'Pack' | 'PET', string>, inspection: Record<'Pack' | 'PET', boolean>, est: Est): number {
  const liters = { Pack: 0, PET: 0 };
  for (const p of production) liters[data.products.find((x) => x.key === p.sku)!.packaging] += p.prodLiters;
  const total = liters.Pack + liters.PET || 1;
  let f = 0;
  for (const k of ['Pack', 'PET'] as const) {
    const m = est.qualityBreakdownMult[quality[k]] ?? 1;
    const eff = inspection[k] ? 1 + (m - 1) * (1 - est.inspectionQualityRelief) : m;
    f += (liters[k] / total) * eff;
  }
  return f;
}

/** Trung bình có trọng số theo chính nó (cỡ lô "điển hình" theo pallet). */
const selfWeighted = (items: { size: number; perWeek: number }[]) => {
  const w = items.reduce((s, x) => s + x.size * x.perWeek, 0);
  return w > 0 ? items.reduce((s, x) => s + x.size * x.size * x.perWeek, 0) / w : 0;
};

interface Core {
  risk: Record<ComponentKey, ComponentRisk>;
  componentAvailability: Record<ComponentKey, number>;
  production: SkuProduction[];
  line: OpsResults['line'];
  mixer: OpsResults['mixer'];
  flows: ComponentFlow[];
  sup: Record<ComponentKey, ActiveSupplier>;
  rmMeanHours: { receiving: number; inspection: number; issuing: number }; // giờ/tuần
  fgMeanHours: { inbound: number; picking: number; scrap: number };
  rmTheory: Record<ComponentKey, number>; // tồn TB lý thuyết (đv)
  fgTheory: Record<SkuKey, number>;
  rmLot: Record<ComponentKey, number>; // cỡ đơn (đv)
  fgBatch: Record<SkuKey, number>; // cỡ mẻ (đv)
  rmLotPallets: number; // cỡ lô nhận hàng điển hình (pallet)
  fgBatchPallets: number; // cỡ mẻ nhập kho TP điển hình (pallet)
  tankIssuesPerRound: number;
  rmLinesPerWeek: number;
  rmPalletsInPerWeek: number;
  fgPalletsInPerWeek: number;
  fgLinesPerWeek: number;
}

/** `baseShort`: tỷ lệ thiếu NL của baseline (bỏ trống khi đang tính chính baseline → availability = số R0). */
function opsCore(inputs: Inputs, data: Round0Data, cal: Calibration, est: Est, baseShort?: Record<ComponentKey, number>): Core {
  const o = inputs.ops;
  const line = data.ops.lines.find((l) => l.name === o.bottlingLine) ?? data.ops.lines[0];
  const lineR0 = data.ops.lines.find((l) => l.name === data.ops.decisions.bottlingLine)!;
  const mixer = data.ops.mixers.find((m) => m.name === o.mixer) ?? data.ops.mixers[0];
  const demand = demandBySku(data);
  const unitCost = unitCostBySku(data);
  const obsolete = obsoleteBySku(data);
  const prodOf = (s: SkuKey) => data.products.find((p) => p.key === s)!;
  const speed = line.speedLph * (o.increaseSpeed ? 1 + BOTTLING.speedIncrease : 1);

  // ---------- Kế hoạch sản xuất & máy trộn ----------
  const production: SkuProduction[] = SKUS.map((sku) => {
    const p = prodOf(sku);
    const P = Math.max(1, Math.round(inputs.sc.products[sku].productionIntervalDays));
    const prodUnits = demand[sku] * cal.prodFactor;
    const prodLiters = prodUnits * p.litersPerUnit;
    const batchesPerWeek = ROUND.daysPerWeek / P;
    const batchLiters = prodLiters / batchesPerWeek;
    const lots = Math.max(1, Math.ceil(batchLiters / mixer.maxBatchL - 1e-9));
    const lotL = Math.max(mixer.minBatchL, batchLiters / lots);
    const excess = lots * lotL - batchLiters;
    const lostUnitsPerChangeover = (line.startupLoss * speed * BOTTLING.startupLossHours) / p.litersPerUnit;
    return {
      sku, demandUnits: demand[sku], prodUnits, prodLiters, intervalDays: P, batchesPerWeek, batchLiters,
      mixerLotsPerBatch: lots, mixerLotL: lotL, excessLitersPerBatch: excess,
      availability: cal.skuAvailability[sku], adherence: 0,
      startupLossEur: (ROUND.days / P) * lostUnitsPerChangeover * unitCost[sku],
    };
  });

  // ---------- Dây chuyền ----------
  const changeoversPerWeek = production.reduce((s, p) => s + p.batchesPerWeek, 0);
  const avgChangeoverH = (cal.sizeShare * line.sizeChangeoverH + (1 - cal.sizeShare) * line.formulaChangeoverH) * (o.smed ? 1 - BOTTLING.smedChangeoverReduction : 1);
  const litersPerWeek = production.reduce((s, p) => s + p.prodLiters + p.excessLitersPerBatch * p.batchesPerWeek, 0);
  const run = litersPerWeek / speed + changeoversPerWeek * line.startupLoss * BOTTLING.startupLossHours;
  const changeover = changeoversPerWeek * avgChangeoverH;

  const sup = Object.fromEntries(COMPONENTS.map((c) => [c, activeSupplier(inputs, data, c)])) as Record<ComponentKey, ActiveSupplier>;
  const r0Quality = (c: ComponentKey) => data.purchasing.contracts.find((s) => s.component === c)!.quality;
  const qNow = qualityFactor(data, production, { Pack: sup.Pack.quality, PET: sup.PET.quality }, { Pack: o.rmInspection.Pack, PET: o.rmInspection.PET }, est);
  const qR0 = qualityFactor(data, production, { Pack: r0Quality('Pack'), PET: r0Quality('PET') }, { Pack: data.ops.decisions.rmInspection.Pack, PET: data.ops.decisions.rmInspection.PET }, est);
  const tolRel = (est.toleranceMult[line.tolerance] ?? 1) / (est.toleranceMult[lineR0.tolerance] ?? 1);
  const pm = BOTTLING.pm[o.preventiveMaintenance];
  const breakdown = run * cal.breakdownPerRunHour * (qNow / qR0) * tolRel * (1 - pm.breakdownReduction) * (o.breakdownTraining ? 1 - BOTTLING.trainingRepairReduction : 1);
  const maintenance = pm.hoursPerWeek;

  const needHours = run + changeover + breakdown + maintenance;
  const C = BOTTLING.shiftHours[o.shifts] ?? BOTTLING.shiftHours[2];
  const sigmaHours = cal.loadCv * needHours;
  const unused = expectedBelow(needHours, sigmaHours, C);
  const outsourced = expectedAbove(needHours, sigmaHours, BOTTLING.maxHoursPerWeek);
  const overtime = Math.max(0, expectedAbove(needHours, sigmaHours, C) - outsourced);
  // Availability NL theo quyết định SC (safety stock, lot size), NCC (lead time, reliability), intake time:
  // dạng cộng thêm so với R0 nên baseline = đúng availability game in ra (Vitamin C 84,3%…)
  const flows = componentFlows(inputs, data, cal, production, est);
  const risk = componentRisk(inputs, data, cal, production, flows, sup);
  const componentAvailability = {} as Record<ComponentKey, number>;
  for (const c of COMPONENTS) {
    const r0 = data.supplyChain.componentStock.find((x) => x.component === c)!.availability;
    const delta = baseShort ? risk[c].shortRate - baseShort[c] : 0;
    componentAvailability[c] = Math.min(1, Math.max(0, r0 - delta));
  }
  for (const p of production) {
    const prod = data.products.find((x) => x.key === p.sku)!;
    p.availability = COMPONENTS.filter((c) => prod.bom[c] > 0).reduce((acc, c) => acc * componentAvailability[c], 1);
  }
  // Giờ PM đã nằm trong needHours (→ overtime). Có tính PM như "gián đoạn" giống hỏng đột xuất không: COEFFS (mặc định 0)
  const pmDisruption = COEFFS.maintenanceDisruptionWeight.value * maintenance;
  const capacityAdherence = Math.min(1, Math.max(0, 1 - cal.adherenceK * (breakdown + pmDisruption + overtime + outsourced) / (C + overtime)));
  for (const p of production) p.adherence = capacityAdherence * p.availability;
  const wSum = production.reduce((s, p) => s + p.batchesPerWeek, 0);
  const planAdherence = production.reduce((s, p) => s + p.adherence * p.batchesPerWeek, 0) / wSum;

  // ---------- Máy trộn ----------
  const lotsPerWeek = production.reduce((s, p) => s + p.mixerLotsPerBatch * p.batchesPerWeek, 0);
  const avgLotL = production.reduce((s, p) => s + p.mixerLotsPerBatch * p.batchesPerWeek * p.mixerLotL, 0) / lotsPerWeek;
  const mixHours = lotsPerWeek * mixer.mixHoursPerBatch;
  const cleanHours = changeoversPerWeek * mixer.cleanHours;
  const mixerUtil = (mixHours + cleanHours) / (C + overtime);

  // ---------- Dòng NL & giờ công TB theo định mức ----------
  const rmMeanHours = { receiving: 0, inspection: 0, issuing: 0 };
  const rmTheory = {} as Record<ComponentKey, number>;
  const rmLot = {} as Record<ComponentKey, number>;
  for (const f of flows) {
    const perWeek = f.deliveriesPerRound / ROUND.weeks;
    rmMeanHours.receiving += perWeek * (RM_NORMS.receiveHoursPerLine + f.palletsPerDelivery * RM_NORMS.receiveHoursPerPallet);
    rmMeanHours.inspection += o.rmInspection[f.key] ? perWeek * RM_NORMS.inspectionHoursPerLine : 0;
    rmTheory[f.key] = f.avgStockUnits;
    rmLot[f.key] = f.orderUnits;
  }
  let tankIssuesPerRound = 0;
  const fgMeanHours = { inbound: 0, picking: 0, scrap: 0 };
  const fgTheory = {} as Record<SkuKey, number>;
  const fgBatch = {} as Record<SkuKey, number>;
  const batchItems: { size: number; perWeek: number }[] = [];
  for (const p of production) {
    const prod = prodOf(p.sku);
    const batchUnits = p.prodUnits / p.batchesPerWeek + p.excessLitersPerBatch / prod.litersPerUnit;
    for (const c of COMPONENTS) {
      if (prod.bom[c] <= 0) continue;
      const comp = data.components.find((x) => x.key === c)!;
      const units = prod.bom[c] * batchUnits * p.batchesPerWeek; // /tuần
      const tu = sup[c].tradeUnit.toLowerCase();
      if (comp.unitsPerPallet) rmMeanHours.issuing += (units / comp.unitsPerPallet) * RM_NORMS.issueHoursPerPallet;
      else if (tu.includes('tank')) { const t = units / comp.liquidUnits!.tank; rmMeanHours.issuing += t * RM_NORMS.issueHoursPerTank; tankIssuesPerRound += t * ROUND.weeks; }
      else if (tu.includes('ibc')) rmMeanHours.issuing += (units / comp.liquidUnits!.ibc / est.ibcPerPallet) * RM_NORMS.issueHoursPerPallet;
      else rmMeanHours.issuing += (units / comp.liquidUnits!.drum / est.drumsPerPallet) * RM_NORMS.issueHoursPerPallet;
    }
    const batchPallets = batchUnits / prod.unitsPerPallet;
    batchItems.push({ size: batchPallets, perWeek: p.batchesPerWeek });
    fgMeanHours.inbound += batchPallets * FG_NORMS.inboundHoursPerPallet * p.batchesPerWeek;
    fgMeanHours.scrap += ((obsolete[p.sku] * p.prodUnits) / prod.unitsPerPallet) * FG_NORMS.overflowOrScrapHoursPerPallet;
    fgTheory[p.sku] = fgTheoryUnits(inputs, p.sku, p.demandUnits);
    fgBatch[p.sku] = batchUnits;
  }
  const picking = customerPicking(data);
  for (const cu of picking) {
    const L = cu.orderLinesPerWeek;
    let h = L * FG_NORMS.pickHoursPerLine;
    if (cu.pickUnit === 'pallet') h += cu.palletsPerWeek * FG_NORMS.pickHoursPerPalletOrLayer;
    else {
      h += Math.max(0, cu.palletsPerWeek - est.pickRemainderPallet * L) * FG_NORMS.pickHoursPerPalletOrLayer;
      h += cu.pickUnit === 'layer'
        ? L * est.pickRemainderPallet * cu.layersPerPallet * FG_NORMS.pickHoursPerPalletOrLayer
        : L * est.pickRemainderPallet * cu.casesPerPallet * FG_NORMS.pickHoursPerCase;
    }
    fgMeanHours.picking += h;
  }

  return {
    risk,
    componentAvailability,
    production,
    line: {
      name: line.name, speedLph: speed, regularHours: C, run, changeover, breakdown, maintenance, unused, overtime, outsourced,
      needHours, sigmaHours, changeoversPerWeek, avgChangeoverH, capacityAdherence, planAdherence,
      startupLossEur: production.reduce((s, p) => s + p.startupLossEur, 0),
      freeHours: BOTTLING.maxHoursPerWeek - needHours,
      bottleneck: outsourced > 0.05 || overtime > 0.1 * C,
    },
    mixer: {
      name: mixer.name, lotsPerWeek, avgLotL, mixHours, cleanHours,
      cleaningShare: cleanHours / (mixHours + cleanHours),
      utilization: mixerUtil,
      excessLitersPerWeek: production.reduce((s, p) => s + p.excessLitersPerBatch * p.batchesPerWeek, 0),
      bottleneck: mixerUtil > 1,
    },
    flows,
    sup,
    rmMeanHours,
    fgMeanHours,
    rmTheory,
    fgTheory,
    rmLot,
    fgBatch,
    rmLotPallets: selfWeighted(flows.filter((f) => f.palletsPerDelivery > 0).map((f) => ({ size: f.palletsPerDelivery, perWeek: f.deliveriesPerRound / ROUND.weeks }))),
    fgBatchPallets: selfWeighted(batchItems),
    tankIssuesPerRound,
    rmLinesPerWeek: flows.reduce((s, f) => s + f.deliveriesPerRound / ROUND.weeks, 0),
    rmPalletsInPerWeek: flows.reduce((s, f) => s + (f.palletsPerDelivery * f.deliveriesPerRound) / ROUND.weeks, 0),
    fgPalletsInPerWeek: production.reduce((s, p) => s + p.prodUnits / prodOf(p.sku).unitsPerPallet, 0),
    fgLinesPerWeek: picking.reduce((s, c) => s + c.orderLinesPerWeek, 0),
  };
}

// ======================= Lớp theo ngày (replay tab 11) =======================

interface Daily {
  rmPallets: number[];
  tanks: number[];
  fgPallets: number[];
  rmOverflowMoves: number; // giờ/tuần
  fgOverflowMoves: number;
}

/** Tồn theo ngày: mức TB mô hình + dao động R0 × (cỡ lô mới / cỡ lô baseline). */
function stockDaily(inputs: Inputs, data: Round0Data, cal: Calibration, est: Est, core: Core, base: Core | null): Daily {
  const rmPallets = new Array<number>(D).fill(0);
  const tanks = new Array<number>(D).fill(0);
  const fgPallets = new Array<number>(D).fill(0);
  for (const c of COMPONENTS) {
    const series = cal.replay.rmUnits[c];
    const m0 = mean(series);
    const M = base ? (base.rmTheory[c] > 0 ? core.rmTheory[c] * (m0 / base.rmTheory[c]) : 0) : m0;
    const s = base && base.rmLot[c] > 0 ? core.rmLot[c] / base.rmLot[c] : 1;
    const comp = data.components.find((x) => x.key === c)!;
    const tu = core.sup[c].tradeUnit.toLowerCase();
    for (let d = 0; d < D; d++) {
      const level = Math.max(0, M + (series[d] - m0) * s);
      if (comp.unitsPerPallet) rmPallets[d] += level / comp.unitsPerPallet;
      else if (tu.includes('tank')) tanks[d] += Math.ceil(level / comp.liquidUnits!.tank - 1e-9);
      else if (tu.includes('ibc')) rmPallets[d] += Math.ceil(level / comp.liquidUnits!.ibc - 1e-9) / est.ibcPerPallet;
      else rmPallets[d] += Math.ceil(level / comp.liquidUnits!.drum - 1e-9) / est.drumsPerPallet;
    }
  }
  for (const sku of SKUS) {
    const series = cal.replay.fgUnits[sku];
    const m0 = mean(series);
    const M = base ? core.fgTheory[sku] * (m0 / base.fgTheory[sku]) : m0;
    const s = base ? core.fgBatch[sku] / base.fgBatch[sku] : 1;
    const upp = data.products.find((p) => p.key === sku)!.unitsPerPallet;
    for (let d = 0; d < D; d++) fgPallets[d] += Math.max(0, M + (series[d] - m0) * s) / upp;
  }
  const moves = (pallets: number[], cap: number) => {
    let h = 0;
    for (let d = 1; d < D; d++) h += Math.max(0, Math.max(0, pallets[d] - cap) - Math.max(0, pallets[d - 1] - cap));
    return (h * est.overflowMovesPerPallet * RM_NORMS.overflowMoveHoursPerPallet / D) * ROUND.daysPerWeek;
  };
  return {
    rmPallets, tanks, fgPallets,
    rmOverflowMoves: moves(rmPallets, inputs.ops.rmPalletLocations),
    fgOverflowMoves: moves(fgPallets, inputs.ops.fgPalletLocations),
  };
}

/**
 * Giờ công theo ngày: 4 giờ cố định + [giờ biến đổi TB mô hình + dao động R0 × a].
 * a = Σ phần giờ (mô hình) × hệ số hình dạng / Σ phần giờ (baseline). Hệ số hình dạng:
 * nhận hàng ∝ cỡ lô NL × (intake R0 / intake)^mũ; nhập/cấp theo mẻ ∝ cỡ mẻ; còn lại = 1.
 */
function hoursDaily(r0Hours: number[], fixedPerDay: number, parts: { now: number; base: number; shape: number }[]): number[] {
  const v0 = r0Hours.map((h) => h - fixedPerDay);
  const m0 = mean(v0);
  const vNow = parts.reduce((s, p) => s + p.now, 0) / ROUND.daysPerWeek;
  const baseSum = parts.reduce((s, p) => s + p.base, 0);
  const a = baseSum > 0 ? parts.reduce((s, p) => s + p.now * p.shape, 0) / baseSum : 1;
  return v0.map((v) => fixedPerDay + Math.max(0, vNow + (v - m0) * a));
}

function warehouse(capacity: number, fte: number, pallets: number[], hours: number[], breakdown: Record<string, number>, palletsInPerWeek: number, orderLinesPerWeek: number, cal: Calibration, est: Est): WarehouseResult {
  const overflow = pallets.map((p) => Math.max(0, p - capacity));
  const avgPallets = mean(pallets);
  const avgOverflow = mean(overflow);
  const fixedPerDay = (fte * WAREHOUSE.fteHoursPerWeek) / ROUND.daysPerWeek;
  const excessHours = hours.reduce((s, h) => s + Math.max(0, h - fixedPerDay), 0);
  const flexHours = excessHours * cal.flexProductivity;
  const totalHours = hours.reduce((s, h) => s + h, 0);
  const peakPallets = Math.max(...pallets);
  // Số chỗ tối ưu theo chi phí: €100/chỗ/round so với €3/pallet/ngày overflow (bước 10 chỗ)
  const locCost = (cap: number) => cap * WAREHOUSE.palletLocationPerYear * ROUND.annualToRound + pallets.reduce((s, p) => s + Math.max(0, p - cap), 0) * WAREHOUSE.overflowPerPalletDay;
  const top = Math.ceil(peakPallets / 10) * 10;
  let best = top, bestCost = locCost(top);
  for (let cap = 0; cap <= top; cap += 10) { const c = locCost(cap); if (c < bestCost - 1e-9) { best = cap; bestCost = c; } }
  return {
    capacity,
    avgPallets,
    peakPallets,
    utilization: capacity > 0 ? avgPallets / capacity : Infinity,
    avgOverflowPallets: avgOverflow,
    overflowShare: avgPallets > 0 ? avgOverflow / avgPallets : 0,
    overflowCost: overflow.reduce((s, x) => s + x, 0) * WAREHOUSE.overflowPerPalletDay,
    hoursPerWeek: (totalHours / D) * ROUND.daysPerWeek,
    hoursBreakdown: breakdown,
    fixedHoursPerWeek: fte * WAREHOUSE.fteHoursPerWeek,
    excessHours,
    flexHours,
    flexCost: flexHours * WAREHOUSE.flexPerHour,
    flexShare: totalHours > 0 ? excessHours / totalHours : 0,
    flexWarn: totalHours > 0 && excessHours / totalHours > est.flexWarnShare,
    peakDayHours: Math.max(...hours),
    daysAboveFixed: hours.filter((h) => h > fixedPerDay + 1e-9).length,
    daysOverCapacity: pallets.filter((p) => p > capacity + 1e-9).length,
    recommendedCapacity: Math.ceil(peakPallets * (1 + est.capacityMargin) / 10) * 10,
    costOptimalCapacity: best,
    costAtOptimal: bestCost,
    palletsInPerWeek,
    orderLinesPerWeek,
    daily: { pallets, overflow, hours },
  };
}

// Baseline core được cache theo (data, cal, est) để co giãn dao động theo ngày
const baseCache = new WeakMap<Calibration, Map<Est, { core: Core; daily: Daily }>>();
function baselineCore(data: Round0Data, cal: Calibration, est: Est) {
  let m = baseCache.get(cal);
  if (!m) { m = new Map(); baseCache.set(cal, m); }
  let b = m.get(est);
  if (!b) {
    const bi = baselineInputs(data);
    const core = opsCore(bi, data, cal, est);
    b = { core, daily: stockDaily(bi, data, cal, est, core, null) };
    m.set(est, b);
  }
  return b;
}

export function simulateOps(inputs: Inputs, data: Round0Data, cal: Calibration, est: Est): OpsResults {
  const o = inputs.ops;
  const base = baselineCore(data, cal, est);
  const baseShort = Object.fromEntries(COMPONENTS.map((c) => [c, base.core.risk[c].shortRate])) as Record<ComponentKey, number>;
  const core = opsCore(inputs, data, cal, est, baseShort);
  const daily = stockDaily(inputs, data, cal, est, core, base.core);

  const intakeShape = Math.pow(data.ops.decisions.intakeDays / Math.max(1, o.intakeDays), est.intakeSmoothingExp);
  const lotShape = base.core.rmLotPallets > 0 ? core.rmLotPallets / base.core.rmLotPallets : 1;
  const batchShape = base.core.fgBatchPallets > 0 ? core.fgBatchPallets / base.core.fgBatchPallets : 1;
  const rmH = core.rmMeanHours, rmB = base.core.rmMeanHours;
  const rmHours = hoursDaily(cal.replay.rmHours, RM_NORMS.fixedHoursPerDay, [
    { now: rmH.receiving + rmH.inspection, base: rmB.receiving + rmB.inspection, shape: lotShape * intakeShape },
    { now: rmH.issuing, base: rmB.issuing, shape: batchShape },
    { now: daily.rmOverflowMoves, base: base.daily.rmOverflowMoves, shape: 1 },
  ]);
  const fgH = core.fgMeanHours, fgB = base.core.fgMeanHours;
  const fgHours = hoursDaily(cal.replay.fgHours, FG_NORMS.fixedHoursPerDay, [
    { now: fgH.inbound, base: fgB.inbound, shape: batchShape },
    { now: fgH.picking, base: fgB.picking, shape: 1 },
    { now: fgH.scrap, base: fgB.scrap, shape: 1 },
    { now: daily.fgOverflowMoves, base: base.daily.fgOverflowMoves, shape: 1 },
  ]);

  const rm = warehouse(o.rmPalletLocations, o.rmFte, daily.rmPallets, rmHours,
    { fixed: RM_NORMS.fixedHoursPerDay * ROUND.daysPerWeek, receiving: rmH.receiving, inspection: rmH.inspection, issuing: rmH.issuing, overflowMoves: daily.rmOverflowMoves },
    core.rmPalletsInPerWeek, core.rmLinesPerWeek, cal, est);
  const fg = warehouse(o.fgPalletLocations, o.fgFte, daily.fgPallets, fgHours,
    { fixed: FG_NORMS.fixedHoursPerDay * ROUND.daysPerWeek, inbound: fgH.inbound, picking: fgH.picking, scrap: fgH.scrap, overflowMoves: daily.fgOverflowMoves },
    core.fgPalletsInPerWeek, core.fgLinesPerWeek, cal, est);

  const tankDays = daily.tanks.reduce((s, x) => s + x, 0);
  const tankReceipts = core.flows.filter((f) => f.storage === 'tank').reduce((s, f) => {
    const comp = data.components.find((x) => x.key === f.key)!;
    return s + f.deliveriesPerRound * Math.ceil(f.orderUnits / comp.liquidUnits!.tank - 1e-9);
  }, 0);
  const tankYard = {
    avgTanks: tankDays / D,
    peakTanks: Math.max(...daily.tanks),
    tankDays,
    receipts: tankReceipts,
    deliveries: core.tankIssuesPerRound,
    cost: tankDays * TANK_YARD.perTankDay + tankReceipts * TANK_YARD.perReceipt + core.tankIssuesPerRound * TANK_YARD.perDelivery,
  };

  // ---------- Chi phí (cả round) ----------
  const line = data.ops.lines.find((l) => l.name === o.bottlingLine) ?? data.ops.lines[0];
  const mixer = data.ops.mixers.find((m) => m.name === o.mixer) ?? data.ops.mixers[0];
  const half = ROUND.annualToRound;
  const crew = line.workersPerShift;
  const L = core.line, Mx = core.mixer;
  const costs: CostLine[] = [
    { id: 'lineFixed', label: 'Bottling line fixed costs', group: 'production', value: line.annualFee * half, basis: 'rule' },
    { id: 'linePerm', label: 'Permanent employees (bottling)', group: 'production', value: crew * o.shifts * WAREHOUSE.ftePerYear * half, basis: 'rule' },
    { id: 'lineFlex', label: 'Flexible manpower (bottling)', group: 'production', value: L.overtime * ROUND.weeks * crew * WAREHOUSE.flexPerHour * cal.flexProductivity, basis: 'calibrated' },
    { id: 'lineOutsource', label: 'Thuê ngoài (> 168 giờ/tuần)', group: 'production', value: L.outsourced * ROUND.weeks * crew * WAREHOUSE.flexPerHour * BOTTLING.outsourcingCostMultiplier, basis: 'estimate' },
    { id: 'mixerFixed', label: 'Mixer fixed costs', group: 'production', value: mixer.annualFee * half, basis: 'rule' },
    { id: 'mixerVar', label: 'Mixer variable costs', group: 'production', value: (Mx.mixHours + Mx.cleanHours) * ROUND.weeks * mixer.costPerRunHour, basis: 'rule' },
    { id: 'smed', label: 'SMED action', group: 'production', value: o.smed ? BOTTLING.smedAnnual * half : 0, basis: 'rule' },
    { id: 'speed', label: 'Increase speed', group: 'production', value: o.increaseSpeed ? BOTTLING.speedAnnual * half : 0, basis: 'rule' },
    { id: 'training', label: 'Solve breakdowns training', group: 'production', value: o.breakdownTraining ? BOTTLING.trainingPerPerson * crew * o.shifts : 0, basis: 'estimate' },
    { id: 'rmPallets', label: 'Pallet locations raw materials warehouse', group: 'warehouse', value: o.rmPalletLocations * WAREHOUSE.palletLocationPerYear * half, basis: 'rule' },
    { id: 'rmOverflow', label: 'Overflow raw materials warehouse', group: 'warehouse', value: rm.overflowCost, basis: 'calibrated' },
    { id: 'tankYard', label: 'Outsourcing tank yard', group: 'warehouse', value: tankYard.cost, basis: 'estimate' },
    { id: 'fgPallets', label: 'Pallet locations finished goods warehouse', group: 'warehouse', value: o.fgPalletLocations * WAREHOUSE.palletLocationPerYear * half, basis: 'rule' },
    { id: 'fgOverflow', label: 'Overflow finished goods warehouse', group: 'warehouse', value: fg.overflowCost, basis: 'calibrated' },
    { id: 'inPerm', label: 'Inbound permanent employees', group: 'warehouse', value: o.rmFte * WAREHOUSE.ftePerYear * half, basis: 'rule' },
    { id: 'inFlex', label: 'Inbound flexible manpower', group: 'warehouse', value: rm.flexCost, basis: 'calibrated' },
    { id: 'outPerm', label: 'Outbound permanent employees', group: 'warehouse', value: o.fgFte * WAREHOUSE.ftePerYear * half, basis: 'rule' },
    { id: 'outFlex', label: 'Outbound flexible manpower', group: 'warehouse', value: fg.flexCost, basis: 'calibrated' },
  ];
  const productionCost = costs.filter((c) => c.group === 'production').reduce((s, c) => s + c.value, 0);
  const warehouseCost = costs.filter((c) => c.group === 'warehouse').reduce((s, c) => s + c.value, 0);

  return {
    production: core.production,
    prodFactor: cal.prodFactor,
    line: core.line,
    mixer: core.mixer,
    rm,
    fg,
    components: core.flows,
    tankYard,
    costs,
    productionCost,
    warehouseCost,
    machinesInvestment: mixer.investment + line.investment,
    scLink: {
      risk: core.risk,
      componentAvailability: core.componentAvailability,
      // tồn TB mô hình / tồn TB baseline (cùng cách tính) → dùng để co giãn giá trị tồn R0
      rmStockRatio: Object.fromEntries(COMPONENTS.map((c) => [c, base.core.rmTheory[c] > 0 ? core.rmTheory[c] / base.core.rmTheory[c] : 1])) as Record<ComponentKey, number>,
      fgStockRatio: Object.fromEntries(SKUS.map((k) => [k, base.core.fgTheory[k] > 0 ? core.fgTheory[k] / base.core.fgTheory[k] : 1])) as Record<SkuKey, number>,
    },
  };
}

/** Pallet/tank theo ngày của R0 dựng lại từ tab 11 (dùng cho bảng đối chiếu). */
export function r0DailyStock(data: Round0Data, cal: Calibration, est: Est) {
  const b = baselineCore(data, cal, est).daily;
  return { rmPallets: b.rmPallets, fgPallets: b.fgPallets, tanks: b.tanks };
}
