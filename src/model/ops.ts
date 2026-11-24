// Operations — hàm thuần: kho NL, tank yard, máy trộn, dây chuyền đóng chai, kho TP, chi phí Ops.
// Không đụng DOM. Mọi định mức lấy từ rules.ts (luật game), giả định từ assumptions.ts,
// hệ số hiệu chỉnh từ calibration.ts (tự tính từ R0).
import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import type { CostLine, DailySeries, Inputs, OpsResults, SkuProduction, WarehouseResult, ComponentFlow } from './types';
import type { Calibration } from './calibration';
import { BOTTLING, FG_NORMS, RM_NORMS, ROUND, TANK_YARD, WAREHOUSE } from './rules';
import { EST } from './assumptions';
import { expectedAbove, expectedBelow } from './stats';
import { activeSupplier, COMPONENTS } from './purchasing';
import { componentFlows, fgAvgStockUnits, skuOffset } from './supplyChain';
import { customerPicking, demandBySku, obsoleteBySku, SKUS, unitCostBySku } from './sales';

const D = ROUND.days;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Hệ số hỏng máy theo chất lượng bao bì (trung bình theo lít đóng trên từng loại bao bì). */
function qualityFactor(data: Round0Data, production: SkuProduction[], quality: Record<'Pack' | 'PET', string>, inspection: Record<'Pack' | 'PET', boolean>): number {
  const liters = { Pack: 0, PET: 0 };
  for (const p of production) liters[data.products.find((x) => x.key === p.sku)!.packaging] += p.prodLiters;
  const total = liters.Pack + liters.PET || 1;
  let f = 0;
  for (const k of ['Pack', 'PET'] as const) {
    const m = EST.qualityBreakdownMult[quality[k]] ?? 1;
    const eff = inspection[k] ? 1 + (m - 1) * (1 - EST.inspectionQualityRelief) : m;
    f += (liters[k] / total) * eff;
  }
  return f;
}

function summarizeWarehouse(capacity: number, fte: number, pallets: number[], hours: number[], breakdown: Record<string, number>, palletsInPerWeek: number, orderLinesPerWeek: number): WarehouseResult {
  const overflow = pallets.map((p) => Math.max(0, p - capacity));
  const avgPallets = pallets.reduce((s, x) => s + x, 0) / D;
  const avgOverflow = overflow.reduce((s, x) => s + x, 0) / D;
  const fixedPerDay = (fte * WAREHOUSE.fteHoursPerWeek) / ROUND.daysPerWeek;
  const flexHours = hours.reduce((s, h) => s + Math.max(0, h - fixedPerDay), 0);
  const daily: DailySeries = { pallets, overflow, hours };
  return {
    capacity,
    avgPallets,
    peakPallets: Math.max(...pallets),
    utilization: capacity > 0 ? avgPallets / capacity : Infinity,
    avgOverflowPallets: avgOverflow,
    overflowShare: avgPallets > 0 ? avgOverflow / avgPallets : 0,
    overflowCost: overflow.reduce((s, x) => s + x, 0) * WAREHOUSE.overflowPerPalletDay,
    hoursPerWeek: (hours.reduce((s, x) => s + x, 0) / D) * ROUND.daysPerWeek,
    hoursBreakdown: breakdown,
    fixedHoursPerWeek: fte * WAREHOUSE.fteHoursPerWeek,
    flexHours,
    flexCost: flexHours * WAREHOUSE.flexPerHour,
    peakDayHours: Math.max(...hours),
    daysAboveFixed: hours.filter((h) => h > fixedPerDay + 1e-9).length,
    palletsInPerWeek,
    orderLinesPerWeek,
    daily,
  };
}

/** Thêm giờ chuyển overflow (pallet mới vào overflow mỗi ngày) vào chuỗi giờ công. */
function addOverflowMoves(pallets: number[], capacity: number, hours: number[]): number {
  let total = 0;
  for (let d = 0; d < D; d++) {
    const today = Math.max(0, pallets[d] - capacity);
    const yesterday = Math.max(0, pallets[mod(d - 1, D)] - capacity);
    const h = Math.max(0, today - yesterday) * EST.overflowMovesPerPallet * RM_NORMS.overflowMoveHoursPerPallet;
    hours[d] += h;
    total += h;
  }
  return (total / D) * ROUND.daysPerWeek;
}

export function simulateOps(inputs: Inputs, data: Round0Data, cal: Calibration): OpsResults {
  const o = inputs.ops;
  const line = data.ops.lines.find((l) => l.name === o.bottlingLine) ?? data.ops.lines[0];
  const lineR0 = data.ops.lines.find((l) => l.name === data.ops.decisions.bottlingLine)!;
  const mixer = data.ops.mixers.find((m) => m.name === o.mixer) ?? data.ops.mixers[0];
  const demand = demandBySku(data);
  const unitCost = unitCostBySku(data);
  const obsolete = obsoleteBySku(data);
  const prodOf = (s: SkuKey) => data.products.find((p) => p.key === s)!;
  const speed = line.speedLph * (o.increaseSpeed ? 1 + BOTTLING.speedIncrease : 1);

  // ---------- 1. Kế hoạch sản xuất & máy trộn ----------
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

  // ---------- 2. Dây chuyền ----------
  const changeoversPerWeek = production.reduce((s, p) => s + p.batchesPerWeek, 0);
  const avgChangeoverH = (cal.sizeShare * line.sizeChangeoverH + (1 - cal.sizeShare) * line.formulaChangeoverH) * (o.smed ? 1 - BOTTLING.smedChangeoverReduction : 1);
  const litersPerWeek = production.reduce((s, p) => s + p.prodLiters + p.excessLitersPerBatch * p.batchesPerWeek, 0);
  const run = litersPerWeek / speed + changeoversPerWeek * line.startupLoss * BOTTLING.startupLossHours;
  const changeover = changeoversPerWeek * avgChangeoverH;

  const sup = Object.fromEntries(COMPONENTS.map((c) => [c, activeSupplier(inputs, data, c)])) as Record<ComponentKey, ReturnType<typeof activeSupplier>>;
  const r0Quality = (c: ComponentKey) => data.purchasing.contracts.find((s) => s.component === c)!.quality;
  const qNow = qualityFactor(data, production, { Pack: sup.Pack.quality, PET: sup.PET.quality }, { Pack: o.rmInspection.Pack, PET: o.rmInspection.PET });
  const qR0 = qualityFactor(data, production, { Pack: r0Quality('Pack'), PET: r0Quality('PET') }, { Pack: data.ops.decisions.rmInspection.Pack, PET: data.ops.decisions.rmInspection.PET });
  const tolRel = (EST.toleranceMult[line.tolerance] ?? 1) / (EST.toleranceMult[lineR0.tolerance] ?? 1);
  const pm = BOTTLING.pm[o.preventiveMaintenance];
  const breakdown = run * cal.breakdownPerRunHour * (qNow / qR0) * tolRel * (1 - pm.breakdownReduction) * (o.breakdownTraining ? 1 - BOTTLING.trainingRepairReduction : 1);
  const maintenance = pm.hoursPerWeek;

  const needHours = run + changeover + breakdown + maintenance;
  const C = BOTTLING.shiftHours[o.shifts] ?? BOTTLING.shiftHours[2];
  const sigmaHours = cal.loadCv * needHours;
  const unused = expectedBelow(needHours, sigmaHours, C);
  const outsourced = expectedAbove(needHours, sigmaHours, BOTTLING.maxHoursPerWeek);
  const overtime = Math.max(0, expectedAbove(needHours, sigmaHours, C) - outsourced);
  const capacityAdherence = Math.min(1, Math.max(0, 1 - cal.adherenceK * (breakdown + overtime + outsourced) / (C + overtime)));
  for (const p of production) p.adherence = capacityAdherence * p.availability;
  const wSum = production.reduce((s, p) => s + p.batchesPerWeek, 0);
  const planAdherence = production.reduce((s, p) => s + p.adherence * p.batchesPerWeek, 0) / wSum;
  const startupLossEur = production.reduce((s, p) => s + p.startupLossEur, 0);

  // ---------- 3. Máy trộn ----------
  const lotsPerWeek = production.reduce((s, p) => s + p.mixerLotsPerBatch * p.batchesPerWeek, 0);
  const avgLotL = production.reduce((s, p) => s + p.mixerLotsPerBatch * p.batchesPerWeek * p.mixerLotL, 0) / lotsPerWeek;
  const mixHours = lotsPerWeek * mixer.mixHoursPerBatch;
  const cleanHours = changeoversPerWeek * mixer.cleanHours;
  const mixerAvail = C + overtime;
  const mixerUtil = (mixHours + cleanHours) / mixerAvail;

  // ---------- 4. Dòng NL ----------
  const flows: ComponentFlow[] = componentFlows(inputs, data, cal, production);

  // ---------- 5. Mô phỏng theo ngày ----------
  const rmPallets = new Array<number>(D).fill(0);
  const tanks = new Array<number>(D).fill(0);
  const rmHours = new Array<number>(D).fill(RM_NORMS.fixedHoursPerDay);
  const rmBreak = { fixed: RM_NORMS.fixedHoursPerDay * ROUND.daysPerWeek, receiving: 0, inspection: 0, issuing: 0, overflowMoves: 0 };
  let tankReceipts = 0;
  const intake = Math.max(1, Math.round(o.intakeDays));

  flows.forEach((f, idx) => {
    if (f.purchasedPerWeek <= 0) return;
    const comp = data.components.find((x) => x.key === f.key)!;
    const rej = sup[f.key].rejection;
    const T = (f.orderUnits / f.purchasedPerWeek) * ROUND.daysPerWeek; // ngày/chu kỳ
    const offset = (idx / COMPONENTS.length) * T;
    const ss = inputs.sc.components[f.key].safetyStockWeeks * f.usagePerWeek;
    const good = f.orderUnits * (1 - rej);
    const tu = f.tradeUnit.toLowerCase();
    for (let d = 0; d < D; d++) {
      const pos = mod(d - offset, T);
      const level = ss + good * (1 - pos / T);
      if (comp.unitsPerPallet) rmPallets[d] += level / comp.unitsPerPallet;
      else if (tu.includes('tank')) tanks[d] += Math.ceil(level / comp.liquidUnits!.tank - 1e-9);
      else if (tu.includes('ibc')) rmPallets[d] += Math.ceil(level / comp.liquidUnits!.ibc - 1e-9) / EST.ibcPerPallet;
      else rmPallets[d] += Math.ceil(level / comp.liquidUnits!.drum - 1e-9) / EST.drumsPerPallet;
      // số lần hàng về trong [d, d+1)
      const arrivals = Math.floor((d + 1 - offset) / T) - Math.floor((d - offset) / T);
      if (arrivals > 0) {
        const insp = o.rmInspection[f.key] ? RM_NORMS.inspectionHoursPerLine : 0;
        const recv = RM_NORMS.receiveHoursPerLine + f.palletsPerDelivery * RM_NORMS.receiveHoursPerPallet;
        for (let k = 0; k < intake; k++) rmHours[mod(d + k, D)] += (arrivals * (recv + insp)) / intake;
        rmBreak.receiving += (arrivals * recv) / ROUND.weeks;
        rmBreak.inspection += (arrivals * insp) / ROUND.weeks;
        if (f.storage === 'tank') tankReceipts += arrivals * Math.ceil(f.orderUnits / comp.liquidUnits!.tank - 1e-9);
      }
    }
  });

  // Cấp NL cho sản xuất & nhập TP theo lịch sản xuất (các SKU so le trong chu kỳ)
  const fgPallets = new Array<number>(D).fill(0);
  const fgHours = new Array<number>(D).fill(FG_NORMS.fixedHoursPerDay);
  const fgBreak = { fixed: FG_NORMS.fixedHoursPerDay * ROUND.daysPerWeek, inbound: 0, picking: 0, scrap: 0, overflowMoves: 0 };
  let tankIssues = 0;
  production.forEach((p, i) => {
    const prod = prodOf(p.sku);
    const P = p.intervalDays;
    const off = skuOffset(i, SKUS.length, P);
    const batchUnits = p.prodUnits / p.batchesPerWeek + p.excessLitersPerBatch / prod.litersPerUnit;
    // giờ cấp NL cho 1 mẻ
    let issueH = 0;
    for (const c of COMPONENTS) {
      if (prod.bom[c] <= 0) continue;
      const comp = data.components.find((x) => x.key === c)!;
      const units = prod.bom[c] * batchUnits;
      const tu = sup[c].tradeUnit.toLowerCase();
      if (comp.unitsPerPallet) issueH += (units / comp.unitsPerPallet) * RM_NORMS.issueHoursPerPallet;
      else if (tu.includes('tank')) { const t = units / comp.liquidUnits!.tank; issueH += t * RM_NORMS.issueHoursPerTank; tankIssues += t * (ROUND.days / P); }
      else if (tu.includes('ibc')) issueH += (units / comp.liquidUnits!.ibc / EST.ibcPerPallet) * RM_NORMS.issueHoursPerPallet;
      else issueH += (units / comp.liquidUnits!.drum / EST.drumsPerPallet) * RM_NORMS.issueHoursPerPallet;
    }
    const batchPallets = batchUnits / prod.unitsPerPallet;
    const mean = fgAvgStockUnits(inputs, cal, p.sku, p.demandUnits);
    for (let d = 0; d < D; d++) {
      const k = mod(d - off, P);
      if (k === 0) {
        rmHours[d] += issueH;
        fgHours[d] += batchPallets * FG_NORMS.inboundHoursPerPallet;
      }
      const level = Math.max(0, mean + batchUnits * (0.5 - (k + 0.5) / P));
      fgPallets[d] += level / prod.unitsPerPallet;
    }
    rmBreak.issuing += issueH * p.batchesPerWeek;
    fgBreak.inbound += batchPallets * FG_NORMS.inboundHoursPerPallet * p.batchesPerWeek;
    fgBreak.scrap += ((obsolete[p.sku] * p.prodUnits) / prod.unitsPerPallet) * FG_NORMS.overflowOrScrapHoursPerPallet;
  });

  // Soạn hàng (đều mỗi ngày)
  const picking = customerPicking(data);
  for (const c of picking) {
    const L = c.orderLinesPerWeek;
    let h = L * FG_NORMS.pickHoursPerLine;
    if (c.pickUnit === 'pallet') h += c.palletsPerWeek * FG_NORMS.pickHoursPerPalletOrLayer;
    else {
      h += Math.max(0, c.palletsPerWeek - EST.pickRemainderPallet * L) * FG_NORMS.pickHoursPerPalletOrLayer;
      h += c.pickUnit === 'layer'
        ? L * EST.pickRemainderPallet * c.layersPerPallet * FG_NORMS.pickHoursPerPalletOrLayer
        : L * EST.pickRemainderPallet * c.casesPerPallet * FG_NORMS.pickHoursPerCase;
    }
    fgBreak.picking += h;
  }
  for (let d = 0; d < D; d++) fgHours[d] += (fgBreak.picking + fgBreak.scrap) / ROUND.daysPerWeek;

  rmBreak.overflowMoves = addOverflowMoves(rmPallets, o.rmPalletLocations, rmHours);
  fgBreak.overflowMoves = addOverflowMoves(fgPallets, o.fgPalletLocations, fgHours);

  const rmPalletsIn = flows.reduce((s, f) => s + (f.palletsPerDelivery * f.deliveriesPerRound) / ROUND.weeks, 0);
  const rmLines = flows.reduce((s, f) => s + f.deliveriesPerRound / ROUND.weeks, 0);
  const rm = summarizeWarehouse(o.rmPalletLocations, o.rmFte, rmPallets, rmHours, rmBreak, rmPalletsIn, rmLines);
  const fgIn = production.reduce((s, p) => s + p.prodUnits / prodOf(p.sku).unitsPerPallet, 0);
  const fg = summarizeWarehouse(o.fgPalletLocations, o.fgFte, fgPallets, fgHours, fgBreak, fgIn, picking.reduce((s, c) => s + c.orderLinesPerWeek, 0));

  const tankDays = tanks.reduce((s, x) => s + x, 0);
  const tankYard = {
    avgTanks: tankDays / D,
    peakTanks: Math.max(...tanks),
    tankDays,
    receipts: tankReceipts,
    deliveries: tankIssues,
    cost: tankDays * TANK_YARD.perTankDay + tankReceipts * TANK_YARD.perReceipt + tankIssues * TANK_YARD.perDelivery,
  };

  // ---------- 6. Chi phí (cả round) ----------
  const half = ROUND.annualToRound;
  const crew = line.workersPerShift;
  const costs: CostLine[] = [
    { id: 'lineFixed', label: 'Bottling line fixed costs', group: 'production', value: line.annualFee * half, basis: 'rule' },
    { id: 'linePerm', label: 'Permanent employees (bottling)', group: 'production', value: crew * o.shifts * WAREHOUSE.ftePerYear * half, basis: 'rule' },
    { id: 'lineFlex', label: 'Flexible manpower (bottling)', group: 'production', value: overtime * ROUND.weeks * crew * WAREHOUSE.flexPerHour * cal.bottlingFlexFactor, basis: 'calibrated' },
    { id: 'lineOutsource', label: 'Thuê ngoài (> 168 giờ/tuần)', group: 'production', value: outsourced * ROUND.weeks * crew * WAREHOUSE.flexPerHour * BOTTLING.outsourcingCostMultiplier, basis: 'estimate' },
    { id: 'mixerFixed', label: 'Mixer fixed costs', group: 'production', value: mixer.annualFee * half, basis: 'rule' },
    { id: 'mixerVar', label: 'Mixer variable costs', group: 'production', value: (mixHours + cleanHours) * ROUND.weeks * mixer.costPerRunHour, basis: 'rule' },
    { id: 'smed', label: 'SMED action', group: 'production', value: o.smed ? BOTTLING.smedAnnual * half : 0, basis: 'rule' },
    { id: 'speed', label: 'Increase speed', group: 'production', value: o.increaseSpeed ? BOTTLING.speedAnnual * half : 0, basis: 'rule' },
    { id: 'training', label: 'Solve breakdowns training', group: 'production', value: o.breakdownTraining ? BOTTLING.trainingPerPerson * crew * o.shifts : 0, basis: 'estimate' },
    { id: 'rmPallets', label: 'Pallet locations raw materials warehouse', group: 'warehouse', value: o.rmPalletLocations * WAREHOUSE.palletLocationPerYear * half, basis: 'rule' },
    { id: 'rmOverflow', label: 'Overflow raw materials warehouse', group: 'warehouse', value: rm.overflowCost, basis: 'rule' },
    { id: 'tankYard', label: 'Outsourcing tank yard', group: 'warehouse', value: tankYard.cost, basis: 'estimate' },
    { id: 'fgPallets', label: 'Pallet locations finished goods warehouse', group: 'warehouse', value: o.fgPalletLocations * WAREHOUSE.palletLocationPerYear * half, basis: 'rule' },
    { id: 'fgOverflow', label: 'Overflow finished goods warehouse', group: 'warehouse', value: fg.overflowCost, basis: 'rule' },
    { id: 'inPerm', label: 'Inbound permanent employees', group: 'warehouse', value: o.rmFte * WAREHOUSE.ftePerYear * half, basis: 'rule' },
    { id: 'inFlex', label: 'Inbound flexible manpower', group: 'warehouse', value: rm.flexCost, basis: 'rule' },
    { id: 'outPerm', label: 'Outbound permanent employees', group: 'warehouse', value: o.fgFte * WAREHOUSE.ftePerYear * half, basis: 'rule' },
    { id: 'outFlex', label: 'Outbound flexible manpower', group: 'warehouse', value: fg.flexCost, basis: 'rule' },
  ];
  const productionCost = costs.filter((c) => c.group === 'production').reduce((s, c) => s + c.value, 0);
  const warehouseCost = costs.filter((c) => c.group === 'warehouse').reduce((s, c) => s + c.value, 0);

  return {
    production,
    prodFactor: cal.prodFactor,
    line: {
      name: line.name, speedLph: speed, regularHours: C, run, changeover, breakdown, maintenance, unused, overtime, outsourced,
      needHours, sigmaHours, changeoversPerWeek, avgChangeoverH, capacityAdherence, planAdherence, startupLossEur,
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
    rm,
    fg,
    components: flows,
    tankYard,
    costs,
    productionCost,
    warehouseCost,
    machinesInvestment: mixer.investment + line.investment,
  };
}
