// Sales — nhu cầu và đặc điểm đơn hàng R0 cho Ops; M3: service level → penalty → realized revenue.
// Quyết định hợp đồng Sales (SL hứa, shelf life, deadline, trade unit, promotion) CHƯA có ô nhập.
import type { Round0Data, SkuKey } from '../data/types';
import type { SalesCustomerResult, SalesResults, ScResults } from './types';
import { adherenceSlSlope } from './supplyChain';
import { COEFFS } from './assumptions';

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

// ======================= M3: service level → penalty → realized revenue =======================
/**
 * ĐÃ KIỂM CHỨNG bằng R0: doanh thu khách (tab 6) = contracted + penalty (tab 2) — khớp đúng cả 3 khách;
 * penalty ≈ contracted × (1 − attained CI ÷ CI) (lệch 0,05–0,77% do CI làm tròn 3 chữ số).
 * ƯỚC LƯỢNG (game không công bố công thức penalty):
 *  - SL order lines của khách = SL R0 + TB (theo nhu cầu khách × SKU, tab 6) của thay đổi SL TP từng SKU;
 *  - penalty = penalty R0 của khách × (mức thiếu mới ÷ mức thiếu R0)^mũ (COEFFS, mũ = 1), mức thiếu = max(0, SL hứa − SL order lines).
 *    Neo TỪNG KHÁCH vì R0 cho thấy tỷ lệ penalty/điểm thiếu khác nhau (5,1% / 2,5% / 1,9% contracted) → không có
 *    một công thức chung. Đạt hoặc vượt SL hứa → penalty 0; "thưởng nhỏ khi vượt" (luật) CHƯA tính.
 *  - Contracted sales giữ R0 (nhu cầu và giá hợp đồng chưa mô hình).
 *  - Chặn penalty ≤ contracted (doanh thu khách ≥ 0). Mức thiếu > COEFFS.outOfRangeFactor × mức thiếu R0 hoặc bị chặn → cờ "ngoài vùng dữ liệu R0".
 *  - Attained CI kịch bản = attained CI R0 (tab 6) × (revenue mới ÷ revenue R0) → baseline = đúng ô tab 6.
 */
// Hệ số ước lượng: chỉ đọc từ COEFFS (src/model/assumptions.ts) — sửa ở đó khi có dữ liệu trial
const OUT_OF_RANGE_FACTOR = COEFFS.outOfRangeFactor.value;
const PENALTY_EXP = COEFFS.penaltyShortfallExponent.value;

export function simulateSales(data: Round0Data, sc: ScResults): SalesResults {
  const fin = (label: string) => data.finance.lines.find((l) => l.label.normalize('NFC') === label.normalize('NFC'))?.value ?? null;
  const dSl = Object.fromEntries(sc.products.map((p) => [p.sku, p.slPiecesEst - p.slPiecesR0])) as Record<SkuKey, number>;
  // Tỷ lệ penalty/điểm thiếu TB của R0 — chỉ dùng khi một khách R0 KHÔNG thiếu (penalty R0 = 0) mà kịch bản thiếu
  const rates: number[] = [];
  const pre = data.sales.contracts.map((k) => {
    const r = data.sales.customerResults.find((x) => x.customer === k.customer)!;
    const contracted = fin(`Contracted sales – ${k.customer}`) ?? r.revenue;
    const penaltyR0 = fin(`Penalty service level – ${k.customer}`) ?? r.revenue - contracted;
    const shortfallR0 = Math.max(0, k.serviceLevel - r.slOrderLines);
    if (shortfallR0 > 0 && contracted > 0) rates.push(-penaltyR0 / contracted / shortfallR0);
    return { k, r, contracted, penaltyR0, shortfallR0 };
  });
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

  const customers: SalesCustomerResult[] = pre.map(({ k, r, contracted, penaltyR0, shortfallR0 }) => {
    const rows = data.sales.customerProduct.filter((x) => x.customer === k.customer);
    const w = rows.reduce((s, x) => s + x.demandPerWeek, 0);
    const delta = w > 0 ? rows.reduce((s, x) => s + x.demandPerWeek * (dSl[x.sku] ?? 0), 0) / w : 0;
    const slOrderLines = Math.min(1, Math.max(0, r.slOrderLines + delta));
    const slPieces = Math.min(1, Math.max(0, r.slPieces + delta));
    const shortfall = Math.max(0, k.serviceLevel - slOrderLines);
    const penaltyRaw = Math.abs(shortfall - shortfallR0) < 1e-12 ? penaltyR0
      : shortfallR0 > 0 ? penaltyR0 * Math.pow(shortfall / shortfallR0, PENALTY_EXP)
      : -contracted * avgRate * shortfall;
    // Chặn: penalty không vượt contracted → doanh thu khách ≥ 0 (không có dữ liệu R0 cho vùng này)
    const capped = penaltyRaw < -contracted;
    const penaltyCapped = capped ? -contracted : penaltyRaw;
    const penalty = penaltyCapped === 0 ? 0 : penaltyCapped; // tránh -0
    const revenue = contracted + penalty;
    // "Ngoài vùng dữ liệu R0": mức thiếu > OUT_OF_RANGE_FACTOR × mức thiếu R0 (ngoại suy tuyến tính quá xa điểm R0 duy nhất),
    // hoặc R0 không thiếu mà kịch bản thiếu, hoặc đã phải chặn
    const outOfRange = capped || (shortfallR0 > 0 ? shortfall > OUT_OF_RANGE_FACTOR * shortfallR0 : shortfall > 0);
    return {
      customer: k.customer, contractIndex: k.contractIndex, serviceLevelType: k.serviceLevelType, promised: k.serviceLevel,
      slOrderLinesR0: r.slOrderLines, slOrderLines, slPiecesR0: r.slPieces, slPieces, shortfallR0, shortfall,
      contracted, penaltyR0, penalty, revenueR0: contracted + penaltyR0, revenue, capped, outOfRange,
      attainedCiR0: r.attainedContractIndex, attainedCi: r.attainedContractIndex * (contracted + penaltyR0 !== 0 ? revenue / (contracted + penaltyR0) : 1),
    };
  });
  const olw = (c: SalesCustomerResult) => data.sales.customerResults.find((x) => x.customer === c.customer)?.orderLinesPerWeek ?? 0;
  const wSum = customers.reduce((s, c) => s + olw(c), 0);
  const wAvg = (get: (c: SalesCustomerResult) => number) => (wSum > 0 ? customers.reduce((s, c) => s + olw(c) * get(c), 0) / wSum : 0);
  const slR0 = data.kpiQuick.find((k) => /^Service level outbound/.test(k.label))?.value ?? null;
  return {
    customers,
    realizedRevenue: customers.reduce((s, c) => s + c.revenue, 0),
    penaltyTotal: customers.reduce((s, c) => s + c.penalty, 0),
    slOutbound: slR0 === null ? null : (() => {
      const delta = wAvg((c) => c.slOrderLines) - wAvg((c) => c.slOrderLinesR0);
      return Math.abs(delta) < 1e-12 ? slR0 : Math.min(1, Math.max(0, slR0 + delta)); // không đổi → đúng số tab 1
    })(),
    adherenceSlope: adherenceSlSlope(data),
  };
}
