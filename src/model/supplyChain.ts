// Supply Chain — tồn kho NL và TP theo safety stock / lot size / production interval.
// M1: quyết định SC giữ R0 (chưa sửa trên giao diện) nhưng mọi công thức đã nhận tham số,
// nên M2 chỉ cần mở ô nhập.
import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import type { Inputs, ComponentFlow, SkuProduction } from './types';
import type { Calibration } from './calibration';
import { activeSupplier, COMPONENTS } from './purchasing';
import { EST } from './assumptions';
import { ROUND } from './rules';

/** Số đơn vị lưu trữ (pallet location hoặc tank) cho một lượng NL. */
export function storageOf(data: Round0Data, c: ComponentKey, tradeUnit: string, units: number): { kind: 'pallet' | 'tank'; locations: number; containers: number } {
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
    return { kind: 'pallet', locations: ibc / EST.ibcPerPallet, containers: ibc };
  }
  const drums = units / lu.drum;
  return { kind: 'pallet', locations: drums / EST.drumsPerPallet, containers: drums };
}

export function componentFlows(inputs: Inputs, data: Round0Data, cal: Calibration, production: SkuProduction[]): ComponentFlow[] {
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
    // Tồn TB = safety stock + ½ lô (phần dùng được, sau khi trừ hàng bị loại)
    const avgStock = safetyStockWeeks * usage + (order * (1 - sup.rejection)) / 2;
    const st = storageOf(data, c, sup.tradeUnit, avgStock);
    const perDelivery = storageOf(data, c, sup.tradeUnit, order);
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

/** Tồn TP trung bình (đv) = (SS + ½ chu kỳ) × nhu cầu × hệ số thực tế R0. */
export function fgAvgStockUnits(inputs: Inputs, cal: Calibration, sku: SkuKey, demandPerWeek: number): number {
  const d = inputs.sc.products[sku];
  return (d.safetyStockWeeks + d.productionIntervalDays / ROUND.daysPerWeek / 2) * demandPerWeek * cal.fgRealization[sku];
}

/** Ngày lệch pha để các SKU sản xuất so le trong chu kỳ. */
export function skuOffset(index: number, n: number, intervalDays: number): number {
  return Math.round((index * intervalDays) / n) % Math.max(1, intervalDays);
}
