// Purchasing — M3. Điều kiện NCC đang chọn (NCC + ô đàm phán) cho Ops/SC dùng, và mô hình chi phí mua.
//
// ĐÃ KIỂM CHỨNG bằng số R0 (tab 4, cả 5 NCC, lệch ≤ €1):
//   Purchase value = giá cơ bản × contract index × lượng mua + phí vận chuyển.
//   KPI rejection TB / reliability TB = trung bình gia quyền theo purchase value (2,9% / 92,1%).
// ƯỚC LƯỢNG (game không công bố — ASSUMPTIONS.md mục 15):
//   - phí vận chuyển: phí mỗi chuyến × số chuyến + phí đơn vị × số đơn vị/chuyến (lệch −7% … +8% so với R0)
//     → số hiển thị = phí R0 × (mô hình mới ÷ mô hình baseline);
//   - phí đơn hàng nhập (Inbound order lines / orders) = số R0 × (số chuyến giao mới ÷ baseline);
//   - payment term NCC → phải trả ≈ purchase value/tuần × số tuần (→ Investment: Payment terms);
//   - NCC mới: reliability thực tế = cam kết − chênh lệch TB R0; rejection = mức R0 của nguyên liệu đó.
//   Contract index sau đàm phán: game chỉ hiện sau Calculate → đội nhập ô "CI game hiển thị".
import type { ComponentKey, Round0Data, SupplierSpec, SupplierTerms } from '../data/types';
import type { ComponentFlow, Inputs, PurBasis, PurchasingComponentResult, PurchasingResults, PurchasingTerms } from './types';
import { ROUND } from './rules';

export const COMPONENTS: ComponentKey[] = ['Pack', 'PET', 'Orange', 'Mango', 'Vitamin C'];

export interface ActiveSupplier extends SupplierTerms {
  supplierR0: string;
  isR0Supplier: boolean;
  spec: SupplierSpec | null;
  basePrice: number;
  ciBasis: PurBasis;
  ciStale: boolean;
  /** Reliability thực tế dùng cho rủi ro thiếu hàng */
  reliability: number;
  reliabilityBasis: PurBasis;
  rejection: number;
  rejectionBasis: PurBasis;
}

const contractOf = (data: Round0Data, c: ComponentKey) => data.purchasing.contracts.find((s) => s.component === c)!;
const r0ResultOf = (data: Round0Data, c: ComponentKey) => {
  const k = contractOf(data, c);
  return data.purchasing.results.find((r) => r.supplier === k.supplier && r.component === c) ?? null;
};
export const specOf = (data: Round0Data, c: ComponentKey, supplier: string) =>
  data.purchasing.specs.find((s) => s.component === c && s.supplier === supplier) ?? null;
/** Điều kiện niêm yết của NCC: hợp đồng R0 (nếu là NCC đang dùng) hoặc bảng thị trường (trước đàm phán). */
export function listedTerms(data: Round0Data, c: ComponentKey, supplier: string): SupplierTerms | null {
  const k = contractOf(data, c);
  if (k.supplier === supplier) return k;
  return data.purchasing.market.find((s) => s.component === c && s.supplier === supplier) ?? null;
}

/** Chênh lệch TB (reliability cam kết − thực tế) của 5 NCC R0 — dùng ước lượng reliability NCC mới. */
export function avgReliabilityGap(data: Round0Data): number {
  const gaps = data.purchasing.contracts.map((k) => {
    const r = data.purchasing.results.find((x) => x.supplier === k.supplier && x.component === k.component);
    return r ? k.agreedReliability - r.reliability : null;
  }).filter((x): x is number => x !== null);
  return gaps.length ? gaps.reduce((s, x) => s + x, 0) / gaps.length : 0;
}

/** Ô đàm phán mặc định khi chọn một NCC (điều kiện niêm yết, chưa đàm phán; các ô "số game" bỏ trống). */
export function defaultTerms(data: Round0Data, c: ComponentKey, supplier: string): PurchasingTerms {
  const t = listedTerms(data, c, supplier) ?? contractOf(data, c);
  const spec = specOf(data, c, supplier);
  const modes = spec?.transportModes ?? [t.transport];
  // Phương tiện mặc định: phương tiện có lead time = lead time niêm yết (NCC chỉ có 1 phương tiện → phương tiện đó)
  const transport = modes.find((m) => spec?.leadTimeDays[m] === t.leadTimeDays) ?? (modes.includes(t.transport) ? t.transport : modes[0]);
  return {
    transport, tradeUnit: t.tradeUnit, quality: t.quality, deliveryWindow: t.deliveryWindow,
    paymentTermWeeks: t.paymentTermWeeks, agreedReliability: t.agreedReliability,
    ciGame: null, reliabilityActual: null, rejectionActual: null,
  };
}

/** Các ô đàm phán (bỏ qua 3 ô số game) có khác điều kiện niêm yết không → CI niêm yết không còn đúng. */
export function termsNegotiated(data: Round0Data, c: ComponentKey, supplier: string, t: PurchasingTerms): boolean {
  const d = defaultTerms(data, c, supplier);
  return t.transport !== d.transport || t.tradeUnit !== d.tradeUnit || t.quality !== d.quality || t.deliveryWindow !== d.deliveryWindow
    || Math.abs(t.paymentTermWeeks - d.paymentTermWeeks) > 1e-9 || Math.abs(t.agreedReliability - d.agreedReliability) > 1e-9;
}

export function activeSupplier(inputs: Inputs, data: Round0Data, c: ComponentKey): ActiveSupplier {
  const k = contractOf(data, c);
  const name = inputs.purchasing.suppliers[c] ?? k.supplier;
  const listed = listedTerms(data, c, name) ?? k;
  const supplier = listed.supplier;
  const isR0 = supplier === k.supplier;
  const t: PurchasingTerms = inputs.purchasing.terms?.[c] ?? defaultTerms(data, c, supplier);
  const spec = specOf(data, c, supplier);
  const modes = spec?.transportModes ?? [listed.transport];
  const transport = modes.includes(t.transport) ? t.transport : defaultTerms(data, c, supplier).transport;
  const leadTimeDays = spec?.leadTimeDays[transport] ?? listed.leadTimeDays;
  const basePrice = spec?.basePrice ?? data.components.find((x) => x.key === c)!.basePrice;

  const negotiated = termsNegotiated(data, c, supplier, { ...t, transport });
  const ciGame = t.ciGame;
  const contractIndex = ciGame ?? listed.contractIndex;
  const ciBasis: PurBasis = ciGame !== null ? 'game' : isR0 && !negotiated ? 'sheet' : 'estimate';

  const r0 = isR0 ? r0ResultOf(data, c) : null;
  let reliability: number, reliabilityBasis: PurBasis;
  if (t.reliabilityActual !== null) { reliability = t.reliabilityActual; reliabilityBasis = 'game'; }
  else if (r0) {
    // NCC R0: thực tế R0 + (cam kết mới − cam kết R0); không đổi cam kết → đúng số sheet
    const shift = t.agreedReliability - k.agreedReliability;
    reliability = Math.min(1, Math.max(0, r0.reliability + shift));
    reliabilityBasis = Math.abs(shift) < 1e-9 ? 'sheet' : 'estimate';
  } else { reliability = Math.min(1, Math.max(0, t.agreedReliability - avgReliabilityGap(data))); reliabilityBasis = 'estimate'; }

  let rejection: number, rejectionBasis: PurBasis;
  const rejR0 = r0ResultOf(data, c)?.rejection ?? 0;
  if (t.rejectionActual !== null) { rejection = t.rejectionActual; rejectionBasis = 'game'; }
  else if (r0 && t.quality === k.quality) { rejection = r0.rejection; rejectionBasis = 'sheet'; }
  else { rejection = rejR0; rejectionBasis = 'estimate'; }

  return {
    ...listed,
    supplier, transport, leadTimeDays, contractIndex,
    tradeUnit: t.tradeUnit as SupplierTerms['tradeUnit'], quality: t.quality as SupplierTerms['quality'],
    deliveryWindow: t.deliveryWindow, paymentTermWeeks: t.paymentTermWeeks, agreedReliability: t.agreedReliability,
    supplierR0: k.supplier, isR0Supplier: isR0, spec, basePrice,
    ciBasis, ciStale: negotiated && ciGame === null,
    reliability, reliabilityBasis, rejection, rejectionBasis,
  };
}

/**
 * Phí vận chuyển MÔ HÌNH cả round (ước lượng): mỗi chuyến = phí mỗi chuyến + phí theo đơn vị giao
 * (pallet/drum/IBC: phí / Pallet-Drum-IBC × số đơn vị làm tròn lên; FTL/tank: phí / FTL-Tank × số xe/bồn làm tròn lên).
 * Pallet layer (PET) tính như pallet tương đương (ước lượng). Chỉ dùng dạng tỷ lệ so với baseline.
 */
export function transportModel(data: Round0Data, sup: ActiveSupplier, flow: ComponentFlow): number {
  const spec = sup.spec;
  if (!spec || flow.deliveriesPerRound <= 0) return 0;
  const mode = sup.transport;
  const first = (r: Record<string, number>) => r[mode] ?? Object.values(r)[0] ?? 0;
  const ship = first(spec.costPerShipment), small = first(spec.costPerSmallUnit), full = first(spec.costPerFull);
  const comp = data.components.find((x) => x.key === sup.component)!;
  const perDelivery = (flow.purchasedPerWeek * ROUND.weeks) / flow.deliveriesPerRound;
  const tu = sup.tradeUnit.toLowerCase();
  let unitCost: number;
  if (comp.unitsPerPallet) {
    const pallets = perDelivery / comp.unitsPerPallet;
    if (tu.includes('ftl') && data.palletsPerFtl) unitCost = Math.ceil(pallets / data.palletsPerFtl - 1e-9) * full;
    else unitCost = Math.ceil(pallets - 1e-9) * small;
  } else {
    const lu = comp.liquidUnits!;
    if (tu.includes('tank')) unitCost = Math.ceil(perDelivery / lu.tank - 1e-9) * full;
    else if (tu.includes('ibc')) unitCost = Math.ceil(perDelivery / lu.ibc - 1e-9) * small;
    else unitCost = Math.ceil(perDelivery / lu.drum - 1e-9) * small;
  }
  return flow.deliveriesPerRound * (ship + unitCost);
}

const ratio = (x: number, b: number) => (Math.abs(b) > 1e-12 ? x / b : 1);

/**
 * Kết quả Purchasing, NEO vào số R0 (tab 4): không đổi gì → mọi số = đúng sheet.
 *  - lượng mua = lượng mua R0 × (lượng mua mô hình ÷ baseline)
 *  - tiền hàng = (Purchase value R0 − phí vận chuyển R0) × tỷ lệ lượng × (giá cơ bản × CI ÷ giá × CI của R0)
 *  - phí vận chuyển = phí R0 × (mô hình ÷ mô hình baseline)  [ước lượng]
 */
export function simulatePurchasing(
  data: Round0Data,
  sup: Record<ComponentKey, ActiveSupplier>, flows: ComponentFlow[],
  baseSup: Record<ComponentKey, ActiveSupplier>, baseFlows: ComponentFlow[],
  realizedRevenue: number, baseRealizedRevenue: number,
): PurchasingResults {
  const components: PurchasingComponentResult[] = COMPONENTS.map((c) => {
    const s = sup[c], sb = baseSup[c];
    const f = flows.find((x) => x.key === c)!, fb = baseFlows.find((x) => x.key === c)!;
    const r0 = r0ResultOf(data, c)!;
    const kQty = ratio(f.purchasedPerWeek, fb.purchasedPerWeek);
    const kPrice = ratio(s.basePrice * s.contractIndex, sb.basePrice * sb.contractIndex);
    const goodsR0 = r0.purchaseValue - r0.transportCost;
    const goodsValue = goodsR0 * kQty * kPrice;
    const transportCost = r0.transportCost * ratio(transportModel(data, s, f), transportModel(data, sb, fb));
    const purchaseValue = goodsValue + transportCost;
    const amountPurchased = (r0.purchasedInRound ?? fb.purchasedPerWeek * ROUND.weeks) * kQty;
    return {
      key: c, supplier: s.supplier, supplierR0: s.supplierR0, isR0Supplier: s.isR0Supplier,
      transport: s.transport, tradeUnit: s.tradeUnit, quality: s.quality, deliveryWindow: s.deliveryWindow,
      paymentTermWeeks: s.paymentTermWeeks, leadTimeDays: s.leadTimeDays, basePrice: s.basePrice,
      contractIndex: s.contractIndex, ciBasis: s.ciBasis, ciStale: s.ciStale,
      reliability: s.reliability, reliabilityBasis: s.reliabilityBasis, rejection: s.rejection, rejectionBasis: s.rejectionBasis,
      amountPurchased, goodsValue, transportCost, purchaseValue,
      purchaseValueR0: r0.purchaseValue, transportCostR0: r0.transportCost,
      // Neo cột "Giá thực trả" tab 4: số sheet × (giá/đv mới ÷ giá/đv R0) → không đổi gì = đúng sheet
      pricePaid: r0.pricePaid * ratio(amountPurchased > 0 ? purchaseValue / amountPurchased : 0, r0.purchaseValue / (r0.purchasedInRound ?? amountPurchased)),
      deliveriesPerRound: f.deliveriesPerRound,
      payables: (purchaseValue / ROUND.weeks) * s.paymentTermWeeks,
    };
  });

  const finRow = (re: RegExp) => data.finance.lines.find((l) => re.test(l.label))?.value ?? 0;
  const del = flows.reduce((s, f) => s + f.deliveriesPerRound, 0);
  const delBase = baseFlows.reduce((s, f) => s + f.deliveriesPerRound, 0);
  const kDel = ratio(del, delBase);
  // Payables baseline theo cùng công thức với số R0 → baseline chênh lệch = 0
  const payablesBase = COMPONENTS.reduce((s, c) => s + (r0ResultOf(data, c)!.purchaseValue / ROUND.weeks) * baseSup[c].paymentTermWeeks, 0);
  const payables = components.reduce((s, x) => s + x.payables, 0);

  const pv = components.reduce((s, x) => s + x.purchaseValue, 0);
  const wAvg = (get: (x: PurchasingComponentResult) => number, pvOf: (x: PurchasingComponentResult) => number, list: PurchasingComponentResult[]) => {
    const tot = list.reduce((s, x) => s + pvOf(x), 0);
    return tot > 0 ? list.reduce((s, x) => s + get(x) * pvOf(x), 0) / tot : 0;
  };
  // Baseline của KPI: cùng công thức trên số sheet R0
  const baseList = COMPONENTS.map((c) => ({ rel: baseSup[c].reliability, rej: baseSup[c].rejection, pv: r0ResultOf(data, c)!.purchaseValue }));
  const baseRel = baseList.reduce((s, x) => s + x.rel * x.pv, 0) / baseList.reduce((s, x) => s + x.pv, 0);
  const baseRej = baseList.reduce((s, x) => s + x.rej * x.pv, 0) / baseList.reduce((s, x) => s + x.pv, 0);
  const basePv = baseList.reduce((s, x) => s + x.pv, 0);
  const pd = data.purchasingDashboard;
  const rel = wAvg((x) => x.reliability, (x) => x.purchaseValue, components);
  const rej = wAvg((x) => x.rejection, (x) => x.purchaseValue, components);

  return {
    components,
    purchaseValue: pv,
    transportCost: components.reduce((s, x) => s + x.transportCost, 0),
    inboundOrderLines: finRow(/^Inbound order lines$/i) * kDel,
    inboundOrders: finRow(/^Inbound orders$/i) * kDel,
    deliveriesPerRound: del,
    paymentTermsDelta: -(payables - payablesBase),
    kpi: {
      rejection: (pd.rejection ?? baseRej) + (rej - baseRej),
      reliability: (pd.reliability ?? baseRel) + (rel - baseRel),
      rawMaterialCosts: (pd.rmCostShare ?? basePv / baseRealizedRevenue) * ratio(pv / realizedRevenue, basePv / baseRealizedRevenue),
      avgContractIndex: components.reduce((s, x) => s + x.contractIndex, 0) / components.length,
    },
  };
}
