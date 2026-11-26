// Finance (M4): P&L R0 → kịch bản. Dòng Ops (M1), Stock / Interest on components & products / Costs of scrap (M2, C2), mua NL /
// Inbound orders / Payment terms (M3 Purchasing), Contracted sales / Penalty / Payment terms AR (M3 Sales), Distribution costs (M4)
// bằng số model. GIỮ SỐ R0 (người dùng chốt, có lý do trong LINE_BASIS): Energy, Water, Other, Interest, Contracted suppliers,
// Outbound order lines/orders, Fixed. ROI = Operating profit / Investment.
import type { Round0Data } from '../data/types';
import { COEFFS } from './assumptions';
import type { FinanceBasis, FinanceResults, FinanceRow, OpsResults, PurchasingResults, RoiNode, SalesResults, ScResults } from './types';

/**
 * M4: nguồn của từng dòng P&L (hiện trên tab Finance; test kiểm mọi dòng của tab 2 đều có nguồn).
 * r0 = giữ đúng số Round 0 vì sheet/luật không cho cách tính hoặc không có ô quyết định nào làm đổi dòng đó (người dùng chốt 25/11).
 */
export const LINE_BASIS: { re: RegExp; basis: FinanceBasis; why: string }[] = [
  { re: /^Contracted sales/i, basis: 'estimate', why: 'R0 (tab 2) × (lượng × giá sau promotion ÷ R0) × (CI ÷ CI R0) — CI game nhập tay hoặc hệ số COEFFS (= 0)' },
  { re: /^Penalty service level/i, basis: 'estimate', why: 'Penalty R0 từng khách × (mức thiếu SL mới ÷ R0) — game không công bố công thức' },
  { re: /^Bottling line fixed|^Mixer fixed|^Permanent employees \(bottling\)|^Pallet locations|^Inbound permanent|^Outbound permanent/i, basis: 'rule', why: 'Định mức luật (€/năm × 0,5 round) × quyết định Ops' },
  { re: /^(SMED|Increase speed)/i, basis: 'rule', why: 'Phí theo luật (€/năm × 0,5)' },
  // Khớp nhãn "ước lượng" của ops.ts / tab Ops (review 26/11)
  { re: /^Solve breakdowns training/i, basis: 'estimate', why: '€400/người theo luật × số người = công nhân/ca × số ca (giả định — luật không nói bao nhiêu người)' },
  { re: /tank yard/i, basis: 'estimate', why: '€25/tank/ngày + €10/lần nhận + €100/lần giao (luật) × số tank theo ngày mô hình (quy đổi chứa, replay tab 11 — ước lượng)' },
  { re: /^Flexible manpower \(bottling\)/i, basis: 'estimate', why: 'Overtime dây chuyền × €42/giờ × hệ số năng suất thời vụ hiệu chỉnh R0; thuê ngoài > 168 giờ = 2 × (công nhân/ca × €42) (giả định "gấp 2")' },
  { re: /^Mixer variable|^Overflow|^Inbound flexible|^Outbound flexible/i, basis: 'model', why: 'Định mức luật × giờ/pallet mô hình, neo R0 (hiệu chỉnh R0)' },
  { re: /^Interest on (components|products)$/i, basis: 'model', why: 'R0 × (giá trị tồn NL/TP mô hình ÷ baseline)' },
  { re: /^Stock$/i, basis: 'model', why: 'Giá trị tồn R0 (tab 7) × (tồn mô hình ÷ baseline)' },
  { re: /^Machines$/i, basis: 'rule', why: 'Giá máy trộn + dây chuyền đang chọn (tab 5)' },
  { re: /^Payment terms$/i, basis: 'estimate', why: 'R0 365.589 + Δ phải thu khách (revenue/tuần × payment term) − Δ phải trả NCC (purchase value/tuần × payment term) — game không công bố cách tính' },
  { re: /^Costs of scrap$/i, basis: 'estimate', why: 'R0 × (giá trị obsolete/tuần mới ÷ R0) — obsolete theo tuổi tồn (C2)' },
  { re: /^Inbound order(s| lines)$/i, basis: 'estimate', why: 'R0 × (số chuyến giao NL mới ÷ baseline)' },
  { re: /^Distribution costs$/i, basis: 'estimate', why: 'R0 (tab 2) × (Σ phí phân phối khách tab 6 × pallet giao mới ÷ baseline) — theo €/pallet thực tế R0 (≈ €22,09), KHÔNG theo luật €31' },
  { re: /^Energy$|^Water$|^Other$/i, basis: 'r0', why: 'Sheet và luật không cho cách tính → giữ số R0 (người dùng chốt 25/11). Đổi sản lượng / số ca KHÔNG làm đổi dòng này' },
  { re: /^Interest$/i, basis: 'r0', why: 'Sheet không ghi Interest tính trên khoản nào → giữ số R0 (người dùng chốt 25/11)' },
  { re: /^Contracted suppliers$/i, basis: 'r0', why: 'Luôn 5 NCC (1 NCC/nguyên liệu) → không đổi theo quyết định' },
  { re: /^Outbound order(s| lines)$/i, basis: 'r0', why: 'Số dòng đơn / đơn hàng khách giữ R0 trong mô hình (không ô quyết định nào làm đổi)' },
  { re: /^Fixed$/i, basis: 'r0', why: 'Tài sản cố định (nhà xưởng…), không có ô quyết định' },
];
const mua = { basis: 'model' as FinanceBasis, why: 'Giá cơ bản × CI × lượng mua (đã kiểm chứng R0, lệch ≤ €1) + phí vận chuyển (ước lượng)' };
export function lineBasis(group: string, label: string): { basis: FinanceBasis; why: string } | null {
  if (/mua NL/i.test(group)) return mua;
  const hit = LINE_BASIS.find((x) => x.re.test(label));
  return hit ? { basis: hit.basis, why: hit.why } : null;
}

/** Dòng P&L trong tab 2_Finance ↔ id chi phí trong model Ops */
const OPS_LINE_MAP: { re: RegExp; ids: string[] }[] = [
  { re: /^Bottling line fixed/i, ids: ['lineFixed'] },
  { re: /^Permanent employees \(bottling\)/i, ids: ['linePerm'] },
  { re: /^Flexible manpower \(bottling\)/i, ids: ['lineFlex', 'lineOutsource'] },
  { re: /^Mixer fixed/i, ids: ['mixerFixed'] },
  { re: /^Mixer variable/i, ids: ['mixerVar'] },
  { re: /^Pallet locations raw/i, ids: ['rmPallets'] },
  { re: /^Overflow raw/i, ids: ['rmOverflow'] },
  { re: /tank yard/i, ids: ['tankYard'] },
  { re: /^Pallet locations finished/i, ids: ['fgPallets'] },
  { re: /^Overflow finished/i, ids: ['fgOverflow'] },
  { re: /^Inbound permanent/i, ids: ['inPerm'] },
  { re: /^Inbound flexible/i, ids: ['inFlex'] },
  { re: /^Outbound permanent/i, ids: ['outPerm'] },
  { re: /^Outbound flexible/i, ids: ['outFlex'] },
];

export function simulateFinance(data: Round0Data, ops: OpsResults, sc?: ScResults, pur?: PurchasingResults, sales?: SalesResults): FinanceResults {
  const cost = (id: string) => ops.costs.find((c) => c.id === id)?.value ?? 0;
  const used = new Set<string>();
  const rows: FinanceRow[] = [];
  let i = 0;

  for (const l of data.finance.lines) {
    const map = OPS_LINE_MAP.find((m) => m.re.test(l.label));
    let value = l.value;
    let modeled = false;
    if (map) {
      value = map.ids.reduce((s, id) => s + cost(id), 0);
      map.ids.forEach((id) => used.add(id));
      modeled = true;
    }
    if (/^Machines$/i.test(l.label)) { value = ops.machinesInvestment; modeled = true; }
    // M2: tồn kho & lãi tồn kho theo quyết định SC (giá trị tồn R0 × tỷ lệ tồn mô hình/baseline)
    if (sc && /^Stock$/i.test(l.label)) { value = sc.stockValue.total + (l.value - sc.stockValue.componentsR0 - sc.stockValue.productsR0); modeled = true; }
    if (sc && /^Interest on components$/i.test(l.label) && sc.stockValue.componentsR0 > 0) { value = l.value * (sc.stockValue.components / sc.stockValue.componentsR0); modeled = true; }
    if (sc && /^Interest on products$/i.test(l.label) && sc.stockValue.productsR0 > 0) { value = l.value * (sc.stockValue.products / sc.stockValue.productsR0); modeled = true; }
    // M3 Purchasing: mua NL theo NCC/điều kiện; phí đơn hàng nhập theo số chuyến; payment terms theo payment term NCC
    let label = l.label;
    if (pur && /mua NL/i.test(l.group)) {
      const key = l.label.match(/\(([^)]+)\)\s*$/)?.[1];
      const pc = pur.components.find((x) => x.key === key);
      if (pc) { value = pc.purchaseValue; modeled = true; if (!pc.isR0Supplier) label = `${pc.supplier} (${pc.key}) — thay ${pc.supplierR0}`; }
    }
    if (pur && /^Inbound order lines$/i.test(l.label)) { value = pur.inboundOrderLines; modeled = true; }
    if (pur && /^Inbound orders$/i.test(l.label)) { value = pur.inboundOrders; modeled = true; }
    // Payment terms = AR − AP (R0 365.589): Δ AP theo NCC (Purchasing), Δ AR = revenue khách/tuần × payment term khách (Sales) — ước lượng
    if ((pur || sales) && /^Payment terms$/i.test(l.label)) { value = l.value + (pur?.paymentTermsDelta ?? 0) + (sales?.arDelta ?? 0); modeled = true; }
    // C2: Costs of scrap = R0 × (giá trị obsolete/tuần mới ÷ R0)^mũ (COEFFS) — ước lượng
    if (sc && /^Costs of scrap$/i.test(l.label) && sc.obsoleteValuePerWeekR0 > 0) {
      const k = sc.obsoleteValuePerWeek / sc.obsoleteValuePerWeekR0;
      value = Math.abs(k - 1) < 1e-12 ? l.value : l.value * Math.pow(k, COEFFS.scrapObsoleteElasticity.value);
      modeled = true;
    }
    // M3 Sales: penalty service level từng khách (ước lượng theo mức thiếu SL); contracted sales = R0 × CI ÷ CI R0
    if (sales && /^(Penalty service level|Contracted sales)/i.test(l.label)) {
      const cu = sales.customers.find((x) => l.label.normalize('NFC').endsWith(x.customer.normalize('NFC')));
      if (cu) { value = /^Penalty/i.test(l.label) ? cu.penalty : cu.contracted; modeled = true; }
    }
    // M4: Distribution costs = R0 (tab 2) × (Σ phí khách tab 6 mới ÷ R0) — tab 6 cộng 192.114,41, tab 2 ghi 192.114 → neo tab 2
    if (sales && /^Distribution costs$/i.test(l.label) && sales.distributionR0 > 0) {
      const k = sales.distribution / sales.distributionR0;
      value = Math.abs(k - 1) < 1e-12 ? l.value : l.value * k;
      modeled = true;
    }
    const lb = lineBasis(l.group, l.label);
    rows.push({ id: `r${i++}`, group: l.group, label, r0: l.value, value, modeled, basis: lb?.basis, why: lb?.why });
    // Dòng mới (chi phí Ops không có trong P&L R0) chèn ngay sau Mixer variable costs
    if (/^Mixer variable/i.test(l.label)) {
      for (const c of ops.costs.filter((c) => c.group === 'production' && !OPS_LINE_MAP.some((m) => m.ids.includes(c.id)))) {
        const lbn = lineBasis(l.group, c.label);
        rows.push({ id: c.id, group: l.group, label: `${c.label} (dòng mới)`, r0: 0, value: c.value, modeled: true, isNew: true, basis: lbn?.basis ?? 'rule', why: lbn?.why });
        used.add(c.id);
      }
    }
  }

  const sum = (pred: (r: FinanceRow) => boolean) => rows.filter(pred).reduce((s, r) => s + r.value, 0);
  const realizedRevenue = sum((r) => /^Doanh thu/i.test(r.group));
  const purchase = sum((r) => /mua NL/i.test(r.group));
  const production = sum((r) => /sản xuất/i.test(r.group));
  const cogs = purchase + production;
  const grossMargin = realizedRevenue - cogs;
  const indirectCost = sum((r) => /^Indirect/i.test(r.group));
  const operatingProfit = grossMargin - indirectCost;
  const investment = sum((r) => /^Investment/i.test(r.group));

  const totals: FinanceRow[] = [
    { id: 't-rev', group: 'TỔNG', label: 'Realized revenue', r0: data.finance.totals.realizedRevenue, value: realizedRevenue, modeled: !!sales, isTotal: true },
    { id: 't-pur', group: 'TỔNG', label: 'Purchase value', r0: data.finance.totals.purchaseValue, value: purchase, modeled: !!pur, isTotal: true },
    { id: 't-prod', group: 'TỔNG', label: 'Production costs', r0: data.finance.totals.productionCosts, value: production, modeled: true, isTotal: true },
    { id: 't-cogs', group: 'TỔNG', label: 'Cost of goods sold (COGS)', r0: data.finance.totals.cogs, value: cogs, modeled: true, isTotal: true },
    { id: 't-gm', group: 'TỔNG', label: 'Gross margin', r0: data.finance.totals.grossMargin, value: grossMargin, modeled: true, isTotal: true },
    { id: 't-ind', group: 'TỔNG', label: 'Indirect cost', r0: data.finance.totals.indirectCost, value: indirectCost, modeled: true, isTotal: true },
    { id: 't-op', group: 'TỔNG', label: 'Operating profit', r0: data.finance.totals.operatingProfit, value: operatingProfit, modeled: true, isTotal: true },
    { id: 't-inv', group: 'TỔNG', label: 'Investment', r0: data.finance.totals.investment, value: investment, modeled: true, isTotal: true },
  ];

  return {
    rows: [...rows, ...totals],
    realizedRevenue, cogs, grossMargin, indirectCost, operatingProfit, investment,
    roi: operatingProfit / investment,
    opsScore: (ops.productionCost + ops.warehouseCost) / realizedRevenue,
    breakdown: buildBreakdown(rows, operatingProfit, investment, data),
  };
}

/** Gom các dòng P&L thành cây: nút cha "mixed" nếu có cả dòng mô hình và dòng giữ R0. */
function node(id: string, label: string, rows: FinanceRow[], note?: string, sign = 1): RoiNode {
  const value = sign * rows.reduce((s, r) => s + r.value, 0);
  const r0 = sign * rows.reduce((s, r) => s + (r.r0 ?? 0), 0);
  const m = rows.filter((r) => r.modeled).length;
  return { id, label, value, r0, status: m === 0 ? 'r0' : m === rows.length ? 'modeled' : 'mixed', note, children: rows.length > 1 ? rows.map((r) => ({ id: r.id, label: r.label, value: sign * r.value, r0: r.r0 === null ? null : sign * r.r0, status: r.modeled ? 'modeled' : 'r0' })) : undefined };
}
const parent = (id: string, label: string, children: RoiNode[], note?: string): RoiNode => {
  const st = new Set(children.map((c) => c.status));
  return {
    id, label, note, children,
    value: children.reduce((s, c) => s + (c.value ?? 0), 0),
    r0: children.reduce((s, c) => s + (c.r0 ?? 0), 0),
    status: st.size === 1 ? [...st][0] : 'mixed',
  };
};

function buildBreakdown(rows: FinanceRow[], operatingProfit: number, investment: number, data: Round0Data) {
  const g = (re: RegExp) => rows.filter((r) => re.test(r.group));
  const lab = (re: RegExp) => rows.filter((r) => re.test(r.label));
  const revenue = node('rev', 'Realized revenue (doanh thu thực nhận)', g(/^Doanh thu/), 'Hợp đồng trừ penalty service level');
  const purchase = node('pur', 'Purchase value (mua NL)', g(/mua NL/), undefined, -1);
  const production = node('prod', 'Production costs (sản xuất)', g(/sản xuất/), undefined, -1);
  const cogs = parent('cogs', 'COGS (giá vốn)', [purchase, production]);
  const gm = parent('gm', 'Gross margin (lãi gộp)', [revenue, cogs]);
  const indirectGroups = [...new Set(g(/^Indirect/).map((r) => r.group))];
  const opex = parent('opex', 'Operating expense = Indirect cost', indirectGroups.map((grp) => node(`ind-${grp}`, grp, rows.filter((r) => r.group === grp), undefined, -1)));
  const op: RoiNode = { ...parent('op', 'Operating profit', [gm, opex]), value: operatingProfit };
  const fixed = node('fixed', 'Fixed assets', [...lab(/^Fixed$/), ...lab(/^Machines$/)], 'Fixed (tòa nhà…) + Machines (máy trộn + dây chuyền)');
  const stock = node('stock', 'Tồn kho (Stock)', lab(/^Stock$/), 'NL + TP, theo quyết định SC (safety stock, lot size, production interval)');
  const pt = node('pt', 'Payment terms = Phải thu (AR) − Phải trả (AP)', lab(/^Payment terms$/), 'Game chỉ in số ròng');
  const ar: RoiNode = { id: 'ar', label: 'Phải thu khách (AR)', value: null, r0: null, status: 'missing', note: 'Thiếu dữ liệu: file chỉ có số ròng AR − AP' };
  const ap: RoiNode = { id: 'ap', label: 'Phải trả NCC (AP)', value: null, r0: null, status: 'missing', note: 'Thiếu dữ liệu: file chỉ có số ròng AR − AP' };
  const wc = parent('wc', 'Working capital', [stock, { ...pt, children: [ar, ap] }]);
  const inv: RoiNode = { ...parent('inv', 'Investment', [fixed, wc]), value: investment, r0: data.finance.totals.investment };
  return { roi: operatingProfit / investment, operatingProfit: op, investment: inv };
}
