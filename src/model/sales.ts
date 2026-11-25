// Sales — nhu cầu và đặc điểm đơn hàng R0 cho Ops; M3: service level → penalty → realized revenue.
// Ô hợp đồng (mục 1, 25/11): trade unit, order deadline, CI game hiển thị. Lựa chọn đọc từ tab 6 "LỰA CHỌN HỢP ĐỒNG SALES".
// Chưa có ô: SL hứa, shelf life, payment term khách, promotion (các mục sau).
import type { Round0Data, SalesOption, SalesOptionKey, SkuKey } from '../data/types';
import type { Inputs, SalesCiBasis, SalesCustomerResult, SalesCustomerTerms, SalesResults, ScResults } from './types';
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

// ======================= Ô hợp đồng Sales: lựa chọn đọc từ sheet =======================
const normTxt = (x: unknown) => String(x ?? '').normalize('NFC').trim().toLowerCase();

export function salesOption(data: Round0Data, key: SalesOptionKey): SalesOption | undefined {
  return data.sales.options.find((o) => o.key === key);
}

/** "20:00" (bảng hợp đồng) và "20.00" (khối lựa chọn) → phút trong ngày; không đọc được → null. */
export function deadlineMinutes(v: string): number | null {
  const m = String(v).trim().match(/^(\d{1,2})[.:h](\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Lựa chọn của sheet trùng với giá trị hợp đồng R0 (so theo nghĩa: giờ theo phút, chữ không phân biệt hoa thường). */
function matchChoice(key: 'tradeUnit' | 'orderDeadline', choices: string[] | null | undefined, v: string): string | null {
  if (!choices) return null;
  if (key === 'orderDeadline') { const m = deadlineMinutes(v); return choices.find((c) => m !== null && deadlineMinutes(c) === m) ?? null; }
  return choices.find((c) => normTxt(c) === normTxt(v)) ?? null;
}

/** Điều khoản R0 của từng khách, viết bằng đúng chuỗi lựa chọn của sheet (nếu khối lựa chọn có). */
export function baselineSalesTerms(data: Round0Data): Record<string, SalesCustomerTerms> {
  const tu = salesOption(data, 'tradeUnit')?.choices, dl = salesOption(data, 'orderDeadline')?.choices;
  return Object.fromEntries(data.sales.contracts.map((c) => [c.customer, {
    tradeUnit: matchChoice('tradeUnit', tu, c.tradeUnit) ?? c.tradeUnit,
    orderDeadline: matchChoice('orderDeadline', dl, c.orderDeadline) ?? c.orderDeadline,
    ciGame: null,
  }]));
}

export interface SalesOptionCheck { customer: string; field: string; optionValue: string | number | null; contractValue: string | number; same: boolean; inChoices: boolean }

/** Đối chiếu giá trị R0 trong khối lựa chọn với bảng hợp đồng (cùng tab 6) và với danh sách lựa chọn / khoảng. */
export function salesOptionChecks(data: Round0Data): SalesOptionCheck[] {
  const out: SalesOptionCheck[] = [];
  const pctKeys: SalesOptionKey[] = ['serviceLevel', 'shelfLife'];
  for (const o of data.sales.options) {
    for (const c of data.sales.contracts) {
      const cv = (c as unknown as Record<string, string | number>)[o.key];
      if (cv === undefined || o.key === 'shortageRule') continue;
      const ov = o.r0[c.customer] ?? null;
      let same: boolean;
      if (ov === null) same = false;
      else if (pctKeys.includes(o.key)) same = typeof ov === 'number' && Math.abs(ov / 100 - Number(cv)) < 1e-9;
      else if (o.key === 'paymentTermWeeks') same = Number(ov) === Number(cv);
      else if (o.key === 'orderDeadline') same = deadlineMinutes(String(ov)) !== null && deadlineMinutes(String(ov)) === deadlineMinutes(String(cv));
      else same = normTxt(ov) === normTxt(cv);
      const inChoices = ov === null ? false
        : o.choices ? o.choices.some((x) => normTxt(x) === normTxt(ov))
        : o.range ? typeof ov === 'number' && ov >= o.range.min && ov <= o.range.max
        : true;
      out.push({ customer: c.customer, field: o.field, optionValue: ov, contractValue: cv, same, inChoices });
    }
  }
  return out;
}

const TU_RANK: Record<PickUnit, number> = { case: 0, layer: 1, pallet: 2 };
/** Số bậc thay đổi so với R0, dương = hướng làm CI tăng theo Info Center (trade unit nhỏ hơn; deadline muộn hơn). */
export function ciSteps(data: Round0Data, cur: SalesCustomerTerms, r0: SalesCustomerTerms): { tradeUnit: number; orderDeadline: number } {
  const tradeUnit = TU_RANK[pickUnitOf(r0.tradeUnit)] - TU_RANK[pickUnitOf(cur.tradeUnit)];
  const order = [...(salesOption(data, 'orderDeadline')?.choices ?? [])].sort((a, b) => (deadlineMinutes(a) ?? 0) - (deadlineMinutes(b) ?? 0));
  const ia = order.indexOf(r0.orderDeadline), ib = order.indexOf(cur.orderDeadline);
  return { tradeUnit, orderDeadline: ia >= 0 && ib >= 0 ? ib - ia : 0 };
}

/** Điều khoản đang dùng của khách: ô nhập nếu có, ngược lại R0. */
function termsOf(data: Round0Data, inputs: Inputs | undefined, customer: string): SalesCustomerTerms {
  return inputs?.sales?.customers?.[customer] ?? baselineSalesTerms(data)[customer];
}

/** Giờ soạn hàng theo khách: trade unit lấy từ ô quyết định Sales (không truyền inputs → hợp đồng R0). */
export function customerPicking(data: Round0Data, inputs?: Inputs): CustomerPicking[] {
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
      pickUnit: pickUnitOf(termsOf(data, inputs, c.customer).tradeUnit),
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
 *  - Contracted sales = contracted R0 × (CI ÷ CI R0): CI = "CI game hiển thị" nếu đội nhập; bỏ trống mà đã đổi điều khoản
 *    → CI R0 × (1 + Σ hệ số COEFFS × số bậc) (ước lượng; hệ số đang = 0). Nhu cầu giữ R0. Penalty co giãn cùng tỷ lệ contracted.
 *  - Chặn penalty ≤ contracted (doanh thu khách ≥ 0). Mức thiếu > COEFFS.outOfRangeFactor × mức thiếu R0 hoặc bị chặn → cờ "ngoài vùng dữ liệu R0".
 *  - Attained CI kịch bản = attained CI R0 (tab 6) × (revenue mới ÷ revenue R0) → baseline = đúng ô tab 6.
 */
// Hệ số ước lượng: chỉ đọc từ COEFFS (src/model/assumptions.ts) — sửa ở đó khi có dữ liệu trial
const OUT_OF_RANGE_FACTOR = COEFFS.outOfRangeFactor.value;
const PENALTY_EXP = COEFFS.penaltyShortfallExponent.value;

const CI_STEP_TU = COEFFS.salesCiPerStepTradeUnit.value;
const CI_STEP_DL = COEFFS.salesCiPerStepOrderDeadline.value;

export function simulateSales(data: Round0Data, sc: ScResults, inputs?: Inputs): SalesResults {
  const baseTerms = baselineSalesTerms(data);
  const fin = (label: string) => data.finance.lines.find((l) => l.label.normalize('NFC') === label.normalize('NFC'))?.value ?? null;
  const dSl = Object.fromEntries(sc.products.map((p) => [p.sku, p.slPiecesEst - p.slPiecesR0])) as Record<SkuKey, number>;
  // Tỷ lệ penalty/điểm thiếu TB của R0 — chỉ dùng khi một khách R0 KHÔNG thiếu (penalty R0 = 0) mà kịch bản thiếu
  const rates: number[] = [];
  const pre = data.sales.contracts.map((k) => {
    const r = data.sales.customerResults.find((x) => x.customer === k.customer)!;
    const contractedR0 = fin(`Contracted sales – ${k.customer}`) ?? r.revenue;
    const penaltyR0 = fin(`Penalty service level – ${k.customer}`) ?? r.revenue - contractedR0;
    const shortfallR0 = Math.max(0, k.serviceLevel - r.slOrderLines);
    if (shortfallR0 > 0 && contractedR0 > 0) rates.push(-penaltyR0 / contractedR0 / shortfallR0);
    // Contract index: số game nếu đội nhập; ngược lại R0 × (1 + hệ số × bậc) — ước lượng (COEFFS)
    const t0 = baseTerms[k.customer], t = termsOf(data, inputs, k.customer);
    const steps = ciSteps(data, t, t0);
    const termsChanged = t.tradeUnit !== t0.tradeUnit || t.orderDeadline !== t0.orderDeadline;
    const ciBasis: SalesCiBasis = t.ciGame !== null ? 'game' : termsChanged ? 'estimate' : 'sheet';
    const ci = t.ciGame !== null ? t.ciGame : k.contractIndex * (1 + CI_STEP_TU * steps.tradeUnit + CI_STEP_DL * steps.orderDeadline);
    const ciRatio = k.contractIndex > 0 ? ci / k.contractIndex : 1;
    const contracted = Math.abs(ciRatio - 1) < 1e-12 ? contractedR0 : contractedR0 * ciRatio;
    return { k, r, t, t0, steps, ciBasis, ci, ciStale: termsChanged && t.ciGame === null, contractedR0, contracted, penaltyR0Scaled: Math.abs(ciRatio - 1) < 1e-12 ? penaltyR0 : penaltyR0 * ciRatio, penaltyR0, shortfallR0 };
  });
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

  const customers: SalesCustomerResult[] = pre.map(({ k, r, t, t0, steps, ciBasis, ci, ciStale, contractedR0, contracted, penaltyR0Scaled, penaltyR0, shortfallR0 }) => {
    const rows = data.sales.customerProduct.filter((x) => x.customer === k.customer);
    const w = rows.reduce((s, x) => s + x.demandPerWeek, 0);
    const delta = w > 0 ? rows.reduce((s, x) => s + x.demandPerWeek * (dSl[x.sku] ?? 0), 0) / w : 0;
    const slOrderLines = Math.min(1, Math.max(0, r.slOrderLines + delta));
    const slPieces = Math.min(1, Math.max(0, r.slPieces + delta));
    const shortfall = Math.max(0, k.serviceLevel - slOrderLines);
    // Penalty R0 co giãn theo contracted (CI) rồi theo mức thiếu
    const penaltyRaw = Math.abs(shortfall - shortfallR0) < 1e-12 ? penaltyR0Scaled
      : shortfallR0 > 0 ? penaltyR0Scaled * Math.pow(shortfall / shortfallR0, PENALTY_EXP)
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
      customer: k.customer, contractIndex: ci, contractIndexR0: k.contractIndex, ciBasis, ciStale, ciSteps: steps,
      tradeUnit: t.tradeUnit, tradeUnitR0: t0.tradeUnit, orderDeadline: t.orderDeadline, orderDeadlineR0: t0.orderDeadline,
      serviceLevelType: k.serviceLevelType, promised: k.serviceLevel,
      slOrderLinesR0: r.slOrderLines, slOrderLines, slPiecesR0: r.slPieces, slPieces, shortfallR0, shortfall,
      contractedR0, contracted, penaltyR0, penalty, revenueR0: contractedR0 + penaltyR0, revenue, capped, outOfRange,
      attainedCiR0: r.attainedContractIndex, attainedCi: r.attainedContractIndex * (contractedR0 + penaltyR0 !== 0 ? revenue / (contractedR0 + penaltyR0) : 1),
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
