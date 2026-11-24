// Finance — M1 (tạm thời): P&L R0, thay các dòng Ops bằng số model; các dòng khác GIỮ SỐ R0
// (đánh dấu modeled=false) cho tới M2–M4. ROI = Operating profit / Investment.
import type { Round0Data } from '../data/types';
import type { FinanceResults, FinanceRow, OpsResults } from './types';

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

export function simulateFinance(data: Round0Data, ops: OpsResults): FinanceResults {
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
  };
}
