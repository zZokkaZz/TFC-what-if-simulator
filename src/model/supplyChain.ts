// Supply Chain — tồn kho NL và TP theo safety stock / lot size / production interval.
// M1: quyết định SC giữ R0 (chưa sửa trên giao diện) nhưng mọi công thức đã nhận tham số,
// nên M2 chỉ cần mở ô nhập.
import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import type { Inputs, ComponentFlow, SkuProduction } from './types';
import type { Calibration } from './calibration';
import { activeSupplier, COMPONENTS } from './purchasing';
import type { Est } from './assumptions';
import { ROUND } from './rules';

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
