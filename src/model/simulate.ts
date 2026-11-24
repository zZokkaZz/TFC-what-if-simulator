// Điểm vào duy nhất của model: simulate(inputs, data) → results. Hàm thuần.
import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import type { Inputs, Results } from './types';
import { calibrate, type Calibration } from './calibration';
import { simulateOps } from './ops';
import { simulateFinance } from './finance';

const calCache = new WeakMap<Round0Data, Calibration>();
export function getCalibration(data: Round0Data): Calibration {
  let c = calCache.get(data);
  if (!c) { c = calibrate(data); calCache.set(data, c); }
  return c;
}

/** Bộ quyết định Round 0 (baseline) đọc từ dữ liệu. */
export function baselineInputs(data: Round0Data): Inputs {
  const d = data.ops.decisions;
  return {
    ops: {
      rmInspection: { ...d.rmInspection },
      rmPalletLocations: d.rmPalletLocations,
      rmFte: d.rmFte,
      intakeDays: d.intakeDays,
      mixer: d.mixer,
      preventiveMaintenance: d.preventiveMaintenance,
      breakdownTraining: d.breakdownTraining,
      bottlingLine: d.bottlingLine,
      shifts: d.shifts,
      smed: d.smed,
      increaseSpeed: d.increaseSpeed,
      fgPalletLocations: d.fgPalletLocations,
      fgFte: d.fgFte,
    },
    sc: {
      components: Object.fromEntries(data.supplyChain.components.map((c) => [c.component, { safetyStockWeeks: c.safetyStockWeeks, lotSizeWeeks: c.lotSizeWeeks }])) as Inputs['sc']['components'],
      products: Object.fromEntries(data.supplyChain.products.map((p) => [p.sku, { productionIntervalDays: p.productionIntervalDays, safetyStockWeeks: p.safetyStockWeeks }])) as Record<SkuKey, { productionIntervalDays: number; safetyStockWeeks: number }>,
      frozenPeriodWeeks: data.supplyChain.frozenPeriodWeeks,
    },
    purchasing: {
      suppliers: Object.fromEntries(data.purchasing.contracts.map((c) => [c.component, c.supplier])) as Record<ComponentKey, string>,
    },
  };
}

export function simulate(inputs: Inputs, data: Round0Data): Results {
  const cal = getCalibration(data);
  const ops = simulateOps(inputs, data, cal);
  const finance = simulateFinance(data, ops);
  return { ops, finance };
}
