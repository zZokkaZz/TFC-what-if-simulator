// Sales — M1: chỉ cung cấp nhu cầu và đặc điểm đơn hàng R0 cho Ops (chưa có quyết định Sales).
// M3 sẽ thêm service level, shelf life, trade unit, promotion… và nối vào đây.
import type { Round0Data, SkuKey } from '../data/types';

export const SKUS: SkuKey[] = ['Orange 1L', 'C-power 1L', 'Mango 1L', 'Orange PET', 'C-power PET', 'Mango PET'];

export function demandBySku(data: Round0Data): Record<SkuKey, number> {
  return Object.fromEntries(data.products.map((p) => [p.key, p.demandPerWeek])) as Record<SkuKey, number>;
}

/** Giá vốn/đv R0 = giá bán TB − gross margin/đv (dùng để quy start-up loss ra €). */
export function unitCostBySku(data: Round0Data): Record<SkuKey, number> {
  return Object.fromEntries(data.sales.productResults.map((p) => [p.sku, p.avgPrice - p.gmPerUnit])) as Record<SkuKey, number>;
}

export function obsoleteBySku(data: Round0Data): Record<SkuKey, number> {
  return Object.fromEntries(data.sales.productResults.map((p) => [p.sku, p.obsolete])) as Record<SkuKey, number>;
}

export type PickUnit = 'pallet' | 'layer' | 'case';

export interface CustomerPicking {
  customer: string;
  pickUnit: PickUnit;
  orderLinesPerWeek: number;
  palletsPerWeek: number;
  layersPerPallet: number; // trung bình theo nhu cầu
  casesPerPallet: number;
}

export function pickUnitOf(tradeUnit: string): PickUnit {
  const t = tradeUnit.toLowerCase();
  if (t.includes('layer')) return 'layer';
  if (t.includes('case') || t.includes('thùng') || t.includes('box')) return 'case';
  return 'pallet';
}

export function customerPicking(data: Round0Data): CustomerPicking[] {
  const prod = Object.fromEntries(data.products.map((p) => [p.key, p]));
  return data.sales.contracts.map((c) => {
    const rows = data.sales.customerProduct.filter((r) => r.customer === c.customer);
    const res = data.sales.customerResults.find((r) => r.customer === c.customer);
    const units = rows.reduce((s, r) => s + r.demandPerWeek, 0) || 1;
    const pallets = rows.reduce((s, r) => s + r.demandPerWeek / prod[r.sku].unitsPerPallet, 0);
    const layersPerPallet = rows.reduce((s, r) => s + (r.demandPerWeek / units) * (prod[r.sku].unitsPerPallet / prod[r.sku].unitsPerLayer), 0);
    const casesPerPallet = rows.reduce((s, r) => s + (r.demandPerWeek / units) * (prod[r.sku].unitsPerPallet / prod[r.sku].unitsPerCase), 0);
    return {
      customer: c.customer,
      pickUnit: pickUnitOf(c.tradeUnit),
      orderLinesPerWeek: res?.orderLinesPerWeek ?? 0,
      palletsPerWeek: pallets,
      layersPerPallet,
      casesPerPallet,
    };
  });
}
