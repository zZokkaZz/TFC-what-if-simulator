// Finance: P&L R0; thay các dòng Ops (M1) và Stock / Interest on components & products (M2) bằng số model;
// các dòng khác GIỮ SỐ R0 (modeled=false) cho tới M3–M4. ROI = Operating profit / Investment.
import type { Round0Data } from '../data/types';
import type { FinanceResults, FinanceRow, OpsResults, RoiNode, ScResults } from './types';

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

export function simulateFinance(data: Round0Data, ops: OpsResults, sc?: ScResults): FinanceResults {
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
    rows.push({ id: `r${i++}`, group: l.group, label: l.label, r0: l.value, value, modeled });
    // Dòng mới (chi phí Ops không có trong P&L R0) chèn ngay sau Mixer variable costs
    if (/^Mixer variable/i.test(l.label)) {
      for (const c of ops.costs.filter((c) => c.group === 'production' && !OPS_LINE_MAP.some((m) => m.ids.includes(c.id)))) {
        rows.push({ id: c.id, group: l.group, label: `${c.label} (dòng mới)`, r0: 0, value: c.value, modeled: true, isNew: true });
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
    { id: 't-rev', group: 'TỔNG', label: 'Realized revenue', r0: data.finance.totals.realizedRevenue, value: realizedRevenue, modeled: false, isTotal: true },
    { id: 't-pur', group: 'TỔNG', label: 'Purchase value', r0: data.finance.totals.purchaseValue, value: purchase, modeled: false, isTotal: true },
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
