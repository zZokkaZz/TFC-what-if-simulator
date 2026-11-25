// Sales — nhu cầu và đặc điểm đơn hàng cho Ops; M3: service level → penalty → realized revenue; ô hợp đồng từng khách
// (trade unit, order deadline, SL type, SL hứa, shelf life, payment term, promotional pressure, promotion horizon, CI game).
// Lựa chọn / khoảng đọc từ tab 6 "LỰA CHỌN HỢP ĐỒNG SALES". Shortage rule, SKU bán cho khách: chưa có ô.
import type { Round0Data, SalesOption, SalesOptionKey, SkuKey } from '../data/types';
import type { Inputs, SalesCiBasis, SalesCiSteps, SalesCustomerResult, SalesCustomerTerms, SalesResults, ScResults } from './types';
import { adherenceSlSlope } from './supplyChain';
import { COEFFS } from './assumptions';
import { ROUND } from './rules';

export const SKUS: SkuKey[] = ['Orange 1L', 'C-power 1L', 'Mango 1L', 'Orange PET', 'C-power PET', 'Mango PET'];

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
function matchChoice(key: SalesOptionKey, choices: string[] | null | undefined, v: string): string | null {
  if (!choices) return null;
  if (key === 'orderDeadline') { const m = deadlineMinutes(v); return choices.find((c) => m !== null && deadlineMinutes(c) === m) ?? null; }
  return choices.find((c) => normTxt(c) === normTxt(v)) ?? null;
}

/** Điều khoản R0 của từng khách, viết bằng đúng chuỗi lựa chọn của sheet (nếu khối lựa chọn có). */
export function baselineSalesTerms(data: Round0Data): Record<string, SalesCustomerTerms> {
  const ch = (k: SalesOptionKey) => salesOption(data, k)?.choices;
  const pick = (k: SalesOptionKey, v: string) => matchChoice(k, ch(k), v) ?? v;
  return Object.fromEntries(data.sales.contracts.map((c) => [c.customer, {
    serviceLevelType: pick('serviceLevelType', c.serviceLevelType),
    serviceLevel: c.serviceLevel,
    shelfLife: c.shelfLife,
    paymentTermWeeks: c.paymentTermWeeks,
    promotionalPressure: pick('promotionalPressure', c.promotionalPressure),
    promotionHorizon: pick('promotionHorizon', c.promotionHorizon),
    tradeUnit: pick('tradeUnit', c.tradeUnit),
    orderDeadline: pick('orderDeadline', c.orderDeadline),
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
/** Vị trí của lựa chọn trong danh sách sheet (−1 nếu không có). */
const idxOf = (xs: string[] | null | undefined, v: string) => (xs ?? []).findIndex((x) => normTxt(x) === normTxt(v));
const stepIdx = (xs: string[] | null | undefined, from: string, to: string) => { const a = idxOf(xs, from), b = idxOf(xs, to); return a >= 0 && b >= 0 ? b - a : 0; };

/** Thứ tự mức promotion theo % nhu cầu thêm (đọc từ sheet), thấp → cao. */
function promoOrder(data: Round0Data): string[] {
  const o = salesOption(data, 'promotionalPressure');
  const lv = o?.levels ?? {};
  return [...(o?.choices ?? [])].sort((a, b) => ((lv[a]?.min ?? 0) + (lv[a]?.max ?? 0)) - ((lv[b]?.min ?? 0) + (lv[b]?.max ?? 0)));
}

/**
 * Số bậc thay đổi so với R0, dương = hướng làm CI TĂNG theo Info Center (tab 6 cột "Tác động"):
 * trade unit nhỏ hơn; deadline muộn hơn; SL hứa cao hơn (điểm %); SL type khó đo hơn (thứ tự sheet Units → Order lines → Orders — hướng CI là giả định);
 * shelf life cao hơn (điểm %); payment term dài hơn (tuần); promotion THẤP hơn; horizon ngắn hơn (thứ tự sheet Short → Middle → Long).
 */
export function ciSteps(data: Round0Data, cur: SalesCustomerTerms, r0: SalesCustomerTerms): SalesCiSteps {
  const order = [...(salesOption(data, 'orderDeadline')?.choices ?? [])].sort((a, b) => (deadlineMinutes(a) ?? 0) - (deadlineMinutes(b) ?? 0));
  const ia = order.indexOf(r0.orderDeadline), ib = order.indexOf(cur.orderDeadline);
  const z = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x);
  return {
    tradeUnit: TU_RANK[pickUnitOf(r0.tradeUnit)] - TU_RANK[pickUnitOf(cur.tradeUnit)],
    orderDeadline: ia >= 0 && ib >= 0 ? ib - ia : 0,
    serviceLevel: z((cur.serviceLevel - r0.serviceLevel) * 100),
    serviceLevelType: stepIdx(salesOption(data, 'serviceLevelType')?.choices, r0.serviceLevelType, cur.serviceLevelType),
    shelfLife: z((cur.shelfLife - r0.shelfLife) * 100),
    paymentTerm: cur.paymentTermWeeks - r0.paymentTermWeeks,
    promotionalPressure: -stepIdx(promoOrder(data), r0.promotionalPressure, cur.promotionalPressure),
    promotionHorizon: -stepIdx(salesOption(data, 'promotionHorizon')?.choices, r0.promotionHorizon, cur.promotionHorizon),
  };
}

/** Hệ số CI (COEFFS) của từng loại bậc — đều = 0 theo người dùng chốt; đọc từ COEFFS, không gõ lại số. */
const CI_COEF: Record<keyof SalesCiSteps, number> = {
  tradeUnit: COEFFS.salesCiPerStepTradeUnit.value,
  orderDeadline: COEFFS.salesCiPerStepOrderDeadline.value,
  serviceLevel: COEFFS.salesCiPerPointServiceLevel.value,
  serviceLevelType: COEFFS.salesCiPerStepSlType.value,
  shelfLife: COEFFS.salesCiPerPointShelfLife.value,
  paymentTerm: COEFFS.salesCiPerWeekPaymentTerm.value,
  promotionalPressure: COEFFS.salesCiPerStepPromotion.value,
  promotionHorizon: COEFFS.salesCiPerStepPromotionHorizon.value,
};
/** Các khóa bậc làm đổi CI (để UI biết ghi chú "giá tăng" hay "giá giảm"). */
export const CI_STEP_KEYS = Object.keys(CI_COEF) as (keyof SalesCiSteps)[];

/** Điều khoản đang dùng của khách: ô nhập nếu có, ngược lại R0. */
function termsOf(data: Round0Data, inputs: Inputs | undefined, customer: string): SalesCustomerTerms {
  return inputs?.sales?.customers?.[customer] ?? baselineSalesTerms(data)[customer];
}

// ======================= Promotion → nhu cầu (ước lượng, neo R0) =======================
/**
 * Luật (tab 6 F63, đọc từ sheet): nhu cầu thêm None 0% · Light 0,5–1% · Middle 1,5–2% · Heavy 4–5,5%; khách Value for money ×2; cặp slowmover ×2.
 * App dùng ĐIỂM GIỮA khoảng và NEO vào % bán thêm nhờ khuyến mãi thực tế R0 của từng cặp khách × SKU (tab 6, đã gồm ×2 VfM / slowmover):
 *   bán thêm mới = bán thêm R0 × (điểm giữa mức mới ÷ điểm giữa mức R0);  nhu cầu = nhu cầu R0 × (1 + bán thêm mới) ÷ (1 + bán thêm R0).
 * Không cần tự xác định cặp nào là slowmover. Nếu mức R0 có điểm giữa 0 (None) → bán thêm mới = điểm giữa × (VfM ? 2 : 1) (không biết slowmover).
 */
export function promoMid(data: Round0Data, level: string): number | null {
  const lv = salesOption(data, 'promotionalPressure')?.levels;
  const key = Object.keys(lv ?? {}).find((k) => normTxt(k) === normTxt(level));
  return key && lv ? (lv[key].min + lv[key].max) / 2 : null;
}
/** Hệ số nhu cầu của cặp khách × SKU so với R0 (1 = không đổi). */
export function promoFactor(data: Round0Data, inputs: Inputs | undefined, customer: string, sku: SkuKey): number {
  if (!inputs) return 1;
  const t = termsOf(data, inputs, customer), t0 = baselineSalesTerms(data)[customer];
  if (!t || !t0 || normTxt(t.promotionalPressure) === normTxt(t0.promotionalPressure)) return 1;
  const row = data.sales.customerProduct.find((r) => r.customer === customer && r.sku === sku);
  const k = data.sales.contracts.find((c) => c.customer === customer);
  const mNew = promoMid(data, t.promotionalPressure), m0 = promoMid(data, t0.promotionalPressure);
  if (!row || !k || mNew === null || m0 === null) return 1;
  const u0 = row.promoUplift;
  const u = m0 > 0 ? u0 * (mNew / m0) : mNew * (k.valueForMoney ? 2 : 1);
  return (1 + u) / (1 + u0);
}

/** Nhu cầu/tuần từng SKU: R0 (tab 3) × (Σ nhu cầu khách × SKU sau promotion ÷ Σ R0, tab 6). Không truyền inputs → R0. */
export function demandBySku(data: Round0Data, inputs?: Inputs): Record<SkuKey, number> {
  const out = Object.fromEntries(data.products.map((p) => [p.key, p.demandPerWeek])) as Record<SkuKey, number>;
  if (!inputs) return out;
  for (const sku of Object.keys(out) as SkuKey[]) {
    const rows = data.sales.customerProduct.filter((r) => r.sku === sku);
    const w0 = rows.reduce((s, r) => s + r.demandPerWeek, 0);
    const w1 = rows.reduce((s, r) => s + r.demandPerWeek * promoFactor(data, inputs, r.customer, sku), 0);
    if (w0 > 0 && Math.abs(w1 - w0) > 1e-9 * w0) out[sku] *= w1 / w0;
  }
  return out;
}

/** Giờ soạn hàng theo khách: trade unit lấy từ ô quyết định Sales, lượng theo promotion (không truyền inputs → hợp đồng R0). */
export function customerPicking(data: Round0Data, inputs?: Inputs): CustomerPicking[] {
  const prod = Object.fromEntries(data.products.map((p) => [p.key, p]));
  return data.sales.contracts.map((c) => {
    const rows = data.sales.customerProduct.filter((r) => r.customer === c.customer).map((r) => ({ ...r, demandPerWeek: r.demandPerWeek * promoFactor(data, inputs, c.customer, r.sku) }));
    const res = data.sales.customerResults.find((r) => r.customer === c.customer);
    const units = rows.reduce((s, r) => s + r.demandPerWeek, 0) || 1;
    const pallets = rows.reduce((s, r) => s + r.demandPerWeek / prod[r.sku].unitsPerPallet, 0);
    const layersPerPallet = rows.reduce((s, r) => s + (r.demandPerWeek / units) * (prod[r.sku].unitsPerPallet / prod[r.sku].unitsPerLayer), 0);
    const casesPerPallet = rows.reduce((s, r) => s + (r.demandPerWeek / units) * (prod[r.sku].unitsPerPallet / prod[r.sku].unitsPerCase), 0);
    return {
      customer: c.customer,
      pickUnit: pickUnitOf(termsOf(data, inputs, c.customer).tradeUnit),
      orderLinesPerWeek: res?.orderLinesPerWeek ?? 0, // số dòng đơn giữ R0 (promotion làm dòng to hơn, không thêm dòng — ước lượng)
      palletsPerWeek: pallets,
      layersPerPallet,
      casesPerPallet,
    };
  });
}

/** Shelf life khách đòi cao nhất trong các khách mua SKU (ô Sales; không truyền inputs → R0). null = không có khách. */
export function requiredShelfLife(data: Round0Data, inputs: Inputs | undefined, sku: SkuKey): number | null {
  const buyers = [...new Set(data.sales.customerProduct.filter((r) => r.sku === sku).map((r) => r.customer))];
  const vals = buyers.map((c) => termsOf(data, inputs, c)?.shelfLife).filter((x): x is number => typeof x === 'number');
  return vals.length ? Math.max(...vals) : null;
}
/** SL hứa cao nhất trong các khách mua SKU (ô Sales). */
export function requiredServiceLevel(data: Round0Data, inputs: Inputs | undefined, sku: SkuKey): number | null {
  const buyers = [...new Set(data.sales.customerProduct.filter((r) => r.sku === sku).map((r) => r.customer))];
  const vals = buyers.map((c) => termsOf(data, inputs, c)?.serviceLevel).filter((x): x is number => typeof x === 'number');
  return vals.length ? Math.max(...vals) : null;
}

/** SL type → chỉ số đo tương ứng của tab 6 (Units = SL pieces). */
export type SlMeasure = 'pieces' | 'orderLines' | 'orders';
export function slMeasureOf(type: string): SlMeasure {
  const t = normTxt(type);
  if (t.includes('unit') || t.includes('piece')) return 'pieces';
  if (t.includes('line')) return 'orderLines';
  return 'orders';
}

// ======================= M3: service level → penalty → realized revenue =======================
/**
 * ĐÃ KIỂM CHỨNG bằng R0: doanh thu khách (tab 6) = contracted + penalty (tab 2) — khớp đúng cả 3 khách;
 * penalty ≈ contracted × (1 − attained CI ÷ CI) (lệch 0,05–0,77% do CI làm tròn 3 chữ số).
 * ƯỚC LƯỢNG (game không công bố công thức penalty):
 *  - SL của khách (pieces / order lines / orders) = SL R0 tab 6 + TB (theo nhu cầu khách × SKU) của thay đổi SL TP từng SKU;
 *  - mức thiếu = max(0, SL hứa − SL theo LOẠI ĐO đang hứa (ô Sales)); R0: 95% − SL order lines;
 *  - penalty = penalty R0 của khách × (contracted ÷ contracted R0) × (mức thiếu mới ÷ mức thiếu R0)^mũ (COEFFS, mũ = 1).
 *    Neo TỪNG KHÁCH (tỷ lệ penalty/điểm thiếu R0 khác nhau: 5,1% / 2,5% / 1,9% contracted). Đạt hoặc vượt SL hứa → 0; thưởng khi vượt CHƯA tính.
 *    Đổi SL type → không có dữ liệu R0 cho loại đo khác → cờ "ngoài vùng dữ liệu R0" nếu còn thiếu.
 *  - Contracted sales = contracted R0 × (Σ nhu cầu × giá sau promotion ÷ R0) × (CI ÷ CI R0). CI = "CI game hiển thị" nếu đội nhập;
 *    bỏ trống mà đã đổi điều khoản → CI R0 × (1 + Σ hệ số COEFFS × bậc) (người dùng chốt hệ số = 0).
 *  - Chặn penalty ≤ contracted (doanh thu khách ≥ 0). Mức thiếu > COEFFS.outOfRangeFactor × mức thiếu R0 hoặc bị chặn → "ngoài vùng dữ liệu R0".
 *  - Attained CI kịch bản = attained CI R0 (tab 6) × (revenue mới ÷ revenue R0) → baseline = đúng ô tab 6.
 *  - Phải thu (AR) = revenue khách ÷ 26 × payment term khách; Investment "Payment terms" = R0 + Δ AR (ước lượng, neo 365.589).
 */
// Hệ số ước lượng: chỉ đọc từ COEFFS (src/model/assumptions.ts) — sửa ở đó khi có dữ liệu trial
const OUT_OF_RANGE_FACTOR = COEFFS.outOfRangeFactor.value;
const PENALTY_EXP = COEFFS.penaltyShortfallExponent.value;

export function simulateSales(data: Round0Data, sc: ScResults, inputs?: Inputs): SalesResults {
  const baseTerms = baselineSalesTerms(data);
  const fin = (label: string) => data.finance.lines.find((l) => l.label.normalize('NFC') === label.normalize('NFC'))?.value ?? null;
  const dSl = Object.fromEntries(sc.products.map((p) => [p.sku, p.slPiecesEst - p.slPiecesR0])) as Record<SkuKey, number>;
  const slOf = (r: { slPieces: number; slOrderLines: number; slOrders: number }, type: string) => { const m = slMeasureOf(type); return m === 'pieces' ? r.slPieces : m === 'orderLines' ? r.slOrderLines : r.slOrders; };
  // Tỷ lệ penalty/điểm thiếu TB của R0 — chỉ dùng khi một khách R0 KHÔNG thiếu (penalty R0 = 0) mà kịch bản thiếu
  const rates: number[] = [];
  const pre = data.sales.contracts.map((k) => {
    const r = data.sales.customerResults.find((x) => x.customer === k.customer)!;
    const contractedR0 = fin(`Contracted sales – ${k.customer}`) ?? r.revenue;
    const penaltyR0 = fin(`Penalty service level – ${k.customer}`) ?? r.revenue - contractedR0;
    const shortfallR0 = Math.max(0, k.serviceLevel - slOf(r, k.serviceLevelType));
    if (shortfallR0 > 0 && contractedR0 > 0) rates.push(-penaltyR0 / contractedR0 / shortfallR0);
    // Contract index: số game nếu đội nhập; ngược lại R0 × (1 + Σ hệ số × bậc) — ước lượng (COEFFS, = 0)
    const t0 = baseTerms[k.customer], t = termsOf(data, inputs, k.customer);
    const steps = ciSteps(data, t, t0);
    const termsChanged = CI_STEP_KEYS.some((x) => steps[x] !== 0) || t.tradeUnit !== t0.tradeUnit || t.orderDeadline !== t0.orderDeadline
      || normTxt(t.serviceLevelType) !== normTxt(t0.serviceLevelType) || normTxt(t.promotionalPressure) !== normTxt(t0.promotionalPressure) || normTxt(t.promotionHorizon) !== normTxt(t0.promotionHorizon);
    const ciBasis: SalesCiBasis = t.ciGame !== null ? 'game' : termsChanged ? 'estimate' : 'sheet';
    const ci = t.ciGame !== null ? t.ciGame : k.contractIndex * (1 + CI_STEP_KEYS.reduce((s, x) => s + CI_COEF[x] * steps[x], 0));
    const ciRatio = k.contractIndex > 0 ? ci / k.contractIndex : 1;
    // Promotion → lượng bán (giá bán từng cặp khách × SKU, tab 6)
    const rows = data.sales.customerProduct.filter((x) => x.customer === k.customer);
    const demandR0 = rows.reduce((s, x) => s + x.demandPerWeek, 0);
    const demand = rows.reduce((s, x) => s + x.demandPerWeek * promoFactor(data, inputs, k.customer, x.sku), 0);
    const v0 = rows.reduce((s, x) => s + x.demandPerWeek * x.price, 0);
    const v1 = rows.reduce((s, x) => s + x.demandPerWeek * x.price * promoFactor(data, inputs, k.customer, x.sku), 0);
    const scale = (v0 > 0 ? v1 / v0 : 1) * ciRatio;
    const same = Math.abs(scale - 1) < 1e-12;
    const contracted = same ? contractedR0 : contractedR0 * scale;
    return { k, r, t, t0, steps, ciBasis, ci, ciStale: termsChanged && t.ciGame === null, contractedR0, contracted, penaltyR0Scaled: same ? penaltyR0 : penaltyR0 * scale, penaltyR0, shortfallR0, demandR0, demand };
  });
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

  const customers: SalesCustomerResult[] = pre.map(({ k, r, t, t0, steps, ciBasis, ci, ciStale, contractedR0, contracted, penaltyR0Scaled, penaltyR0, shortfallR0, demandR0, demand }) => {
    const rows = data.sales.customerProduct.filter((x) => x.customer === k.customer);
    const w = rows.reduce((s, x) => s + x.demandPerWeek, 0);
    const delta = w > 0 ? rows.reduce((s, x) => s + x.demandPerWeek * (dSl[x.sku] ?? 0), 0) / w : 0;
    const clip = (x: number) => Math.min(1, Math.max(0, x));
    const slOrderLines = clip(r.slOrderLines + delta);
    const slPieces = clip(r.slPieces + delta);
    const slOrders = clip(r.slOrders + delta);
    const typeChanged = slMeasureOf(t.serviceLevelType) !== slMeasureOf(k.serviceLevelType);
    const slMeasuredR0 = slOf(r, k.serviceLevelType);
    const slMeasured = slOf({ slPieces, slOrderLines, slOrders }, t.serviceLevelType);
    const shortfall = Math.max(0, t.serviceLevel - slMeasured);
    // Penalty R0 co giãn theo contracted (CI, promotion) rồi theo mức thiếu
    const penaltyRaw = Math.abs(shortfall - shortfallR0) < 1e-12 ? penaltyR0Scaled
      : shortfallR0 > 0 ? penaltyR0Scaled * Math.pow(shortfall / shortfallR0, PENALTY_EXP)
      : -contracted * avgRate * shortfall;
    // Chặn: penalty không vượt contracted → doanh thu khách ≥ 0 (không có dữ liệu R0 cho vùng này)
    const capped = penaltyRaw < -contracted;
    const penaltyCapped = capped ? -contracted : penaltyRaw;
    const penalty = penaltyCapped === 0 ? 0 : penaltyCapped; // tránh -0
    const revenue = contracted + penalty;
    const revenueR0 = contractedR0 + penaltyR0;
    // "Ngoài vùng dữ liệu R0": mức thiếu > OUT_OF_RANGE_FACTOR × mức thiếu R0, hoặc R0 không thiếu mà kịch bản thiếu,
    // hoặc đã phải chặn, hoặc đổi SL type mà vẫn thiếu (R0 chỉ có dữ liệu penalty cho loại đo R0)
    const outOfRange = capped || (typeChanged && shortfall > 0) || (shortfallR0 > 0 ? shortfall > OUT_OF_RANGE_FACTOR * shortfallR0 : shortfall > 0);
    const arR0 = (revenueR0 / ROUND.weeks) * t0.paymentTermWeeks;
    const ar = Math.abs(revenue - revenueR0) < 1e-9 && t.paymentTermWeeks === t0.paymentTermWeeks ? arR0 : (revenue / ROUND.weeks) * t.paymentTermWeeks;
    return {
      customer: k.customer, contractIndex: ci, contractIndexR0: k.contractIndex, ciBasis, ciStale, ciSteps: steps, terms: t, termsR0: t0,
      tradeUnit: t.tradeUnit, tradeUnitR0: t0.tradeUnit, orderDeadline: t.orderDeadline, orderDeadlineR0: t0.orderDeadline,
      serviceLevelType: t.serviceLevelType, promised: t.serviceLevel,
      demandR0, demand, slMeasured, slMeasuredR0, slOrdersR0: r.slOrders, slOrders, arR0, ar,
      slOrderLinesR0: r.slOrderLines, slOrderLines, slPiecesR0: r.slPieces, slPieces, shortfallR0, shortfall,
      contractedR0, contracted, penaltyR0, penalty, revenueR0, revenue, capped, outOfRange,
      attainedCiR0: r.attainedContractIndex, attainedCi: r.attainedContractIndex * (revenueR0 !== 0 ? revenue / revenueR0 : 1),
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
    arDelta: customers.reduce((s, c) => s + (c.ar - c.arR0), 0),
  };
}
