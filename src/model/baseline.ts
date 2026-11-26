import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import type { Inputs } from './types';
import { defaultTerms } from './purchasing';
import { baselineOrderMgmt, baselineSalesTerms } from './sales';

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
      terms: Object.fromEntries(data.purchasing.contracts.map((c) => [c.component, defaultTerms(data, c.component, c.supplier)])) as Inputs['purchasing']['terms'],
    },
    sales: { customers: baselineSalesTerms(data), ...baselineOrderMgmt(data) },
  };
}
