// KPI dashboard từng phòng — CHỈ dùng số có trong file (CLAUDE.md mục 0). Thiếu → null + ghi chú.
import type { Round0Data } from '../data/types';
import type { Results } from './types';

export type KpiDept = 'Purchasing' | 'Operations' | 'Sales' | 'Supply Chain';
export interface KpiPoint { value: number | null; source: string }
export interface Kpi {
  id: string;
  dept: KpiDept | 'Chung';
  label: string; // tên như dashboard của game
  unit: 'pct' | 'eur' | 'weeks' | 'index';
  rMinus2: KpiPoint;
  rMinus1: KpiPoint;
  r0: KpiPoint;
  scenario: number | null;
  scenarioBasis: 'model' | 'estimate' | 'notModeled';
  good: 'up' | 'down' | 'none';
  target: { value: number; source: string } | null;
  comment: string | null; // nhận xét của game (nếu sheet có)
}

const MISSING = (what: string): KpiPoint => ({ value: null, source: `Thiếu dữ liệu: sheet chưa có ${what}` });
const R1_EQ = 'tab 13: Round -1 trùng hoàn toàn Round 0';

export function buildKpis(d: Round0Data, res: Results, base: Results): Kpi[] {
  const dash = (re: RegExp) => d.supplyChain.dashboard.find((x) => re.test(x.kpi));
  const hist = (group: RegExp, obj: RegExp, metric: RegExp) => d.history.find((h) => group.test(h.group) && obj.test(h.object) && metric.test(h.metric));
  const quick = (re: RegExp) => d.kpiQuick.find((k) => re.test(k.label));
  const pd = d.purchasingDashboard;
  const fromHist = (h: ReturnType<typeof hist>, what: string): KpiPoint => (h && h.rMinus2 !== null ? { value: h.rMinus2, source: `tab 13 (${h.metric})` } : MISSING(`${what} Round -2`));
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const out: Kpi[] = [];

  // ---------- Chung ----------
  const roiDash = dash(/^ROI/);
  out.push({
    id: 'roi', dept: 'Chung', label: 'ROI (%)', unit: 'pct',
    rMinus2: roiDash ? { value: roiDash.rMinus2, source: 'tab 7 dashboard' } : MISSING('ROI R-2'),
    rMinus1: roiDash ? { value: roiDash.rMinus1, source: 'tab 7 dashboard' } : MISSING('ROI R-1'),
    r0: { value: d.finance.totals.roi, source: 'tab 2 (Operating profit ÷ Investment)' },
    scenario: res.finance.roi, scenarioBasis: 'model', good: 'up', target: null, comment: roiDash?.comment ?? null,
  });

  // ---------- Purchasing (dashboard game: ROI, Rejection, Raw material costs, Delivery reliability) ----------
  const purSrc = 'tab 4 (tiêu đề bảng kết quả: "dashboard: …")';
  out.push({
    id: 'pur-rej', dept: 'Purchasing', label: 'Rejection components (%)', unit: 'pct',
    rMinus2: MISSING('Rejection components (TB) Round -2'),
    rMinus1: pd.rejection !== null ? { value: pd.rejection, source: R1_EQ } : MISSING('Rejection R-1'),
    r0: pd.rejection !== null ? { value: pd.rejection, source: purSrc } : MISSING('Rejection components R0'),
    scenario: pd.rejection !== null ? res.purchasing.kpi.rejection : null, scenarioBasis: 'estimate', good: 'down', target: null, comment: null,
  });
  // Raw material costs = purchase value ÷ realized revenue; neo vào số dashboard
  const rmShare = (r: Results) => r.finance.rows.filter((x) => /mua NL/i.test(x.group)).reduce((s, x) => s + x.value, 0) / r.finance.realizedRevenue;
  out.push({
    id: 'pur-rmcost', dept: 'Purchasing', label: 'Raw material costs (%)', unit: 'pct',
    rMinus2: MISSING('Raw material costs Round -2'),
    rMinus1: pd.rmCostShare !== null ? { value: pd.rmCostShare, source: R1_EQ } : MISSING('Raw material costs R-1'),
    r0: pd.rmCostShare !== null ? { value: pd.rmCostShare, source: purSrc } : MISSING('Raw material costs R0'),
    scenario: pd.rmCostShare !== null ? pd.rmCostShare * (rmShare(res) / rmShare(base)) : null,
    scenarioBasis: 'model', good: 'down', target: null, comment: null,
  });
  out.push({
    id: 'pur-rel', dept: 'Purchasing', label: 'Delivery reliability suppliers (%)', unit: 'pct',
    rMinus2: MISSING('Delivery reliability (TB) Round -2'),
    rMinus1: pd.reliability !== null ? { value: pd.reliability, source: R1_EQ } : MISSING('Delivery reliability R-1'),
    r0: pd.reliability !== null ? { value: pd.reliability, source: purSrc } : MISSING('Delivery reliability R0'),
    scenario: pd.reliability !== null ? res.purchasing.kpi.reliability : null, scenarioBasis: 'estimate', good: 'up', target: null, comment: null,
  });

  // ---------- Operations (dashboard game: ROI, Cube utilization RM, FG, Plan adherence) ----------
  const R0 = d.ops.results;
  out.push({
    id: 'ops-rm', dept: 'Operations', label: 'Cube utilization raw materials warehouse', unit: 'pct',
    rMinus2: fromHist(hist(/^Kho$/, /Kho NL/, /Cube utilization/), 'cube utilization kho NL'),
    rMinus1: { value: R0.rm.utilization, source: R1_EQ }, r0: { value: R0.rm.utilization, source: 'tab 5' },
    scenario: res.ops.rm.utilization, scenarioBasis: 'model', good: 'none', target: null, comment: null,
  });
  out.push({
    id: 'ops-fg', dept: 'Operations', label: 'Cube utilization finished goods warehouse', unit: 'pct',
    rMinus2: fromHist(hist(/^Kho$/, /Kho TP/, /Cube utilization/), 'cube utilization kho TP'),
    rMinus1: { value: R0.fg.utilization, source: R1_EQ }, r0: { value: R0.fg.utilization, source: 'tab 5' },
    scenario: res.ops.fg.utilization, scenarioBasis: 'model', good: 'none', target: null, comment: null,
  });
  out.push({
    id: 'ops-adh', dept: 'Operations', label: 'Production plan adherence', unit: 'pct',
    rMinus2: fromHist(hist(/Dây chuyền/, /./, /plan adherence/i), 'plan adherence'),
    rMinus1: { value: R0.line.planAdherence, source: R1_EQ }, r0: { value: R0.line.planAdherence, source: 'tab 5' },
    scenario: res.ops.line.planAdherence, scenarioBasis: 'model', good: 'up', target: null, comment: null,
  });

  // ---------- Sales (dashboard game: ROI, Gross margin, Obsolete products, SL outbound order lines) ----------
  out.push({
    id: 'sal-gm', dept: 'Sales', label: 'Gross margin (customer)', unit: 'eur',
    rMinus2: MISSING('Gross margin tổng Round -2 (tab 13 chỉ có GM/tuần từng khách)'),
    rMinus1: { value: d.finance.totals.grossMargin, source: R1_EQ }, r0: { value: d.finance.totals.grossMargin, source: 'tab 2' },
    scenario: res.finance.grossMargin, scenarioBasis: 'model', good: 'up', target: null, comment: null,
  });
  const obs = quick(/^Obsolete products/);
  const obsW = (r: Results) => {
    const w = r.sc.products.reduce((t, p) => t + (p.sheet.demandPerWeek.value ?? 0), 0);
    return w > 0 ? r.sc.products.reduce((t, p) => t + (p.sheet.demandPerWeek.value ?? 0) * p.obsoleteEst, 0) / w : 0;
  };
  out.push({
    id: 'sal-obs', dept: 'Sales', label: 'Obsolete products (%)', unit: 'pct',
    rMinus2: MISSING('Obsolete products Round -2'),
    rMinus1: obs?.value != null ? { value: obs.value, source: R1_EQ } : MISSING('Obsolete R-1'),
    r0: obs?.value != null ? { value: obs.value, source: `tab 1 (${obs.source})` } : MISSING('Obsolete products R0'),
    // C2: R0 dashboard + (obsolete TB gia quyền nhu cầu mới − R0), ước lượng theo tuổi tồn
    scenario: obs?.value != null ? (Math.abs(obsW(res) - obsW(base)) < 1e-12 ? obs.value : Math.min(1, Math.max(0, obs.value + obsW(res) - obsW(base)))) : null, scenarioBasis: 'estimate', good: 'down', target: null, comment: null,
  });
  const sl = quick(/^Service level outbound/);
  const slTarget = d.sales.contracts.length ? Math.min(...d.sales.contracts.map((c) => c.serviceLevel)) : null;
  out.push({
    id: 'sal-sl', dept: 'Sales', label: 'Service level outbound order lines', unit: 'pct',
    rMinus2: MISSING('Service level outbound Round -2'),
    rMinus1: sl?.value != null ? { value: sl.value, source: R1_EQ } : MISSING('SL R-1'),
    r0: sl?.value != null ? { value: sl.value, source: `tab 1 (${sl.source})` } : MISSING('Service level outbound R0'),
    scenario: sl?.value != null ? res.sales.slOutbound : null, scenarioBasis: 'estimate', good: 'up',
    target: slTarget !== null ? { value: slTarget, source: 'tab 6: service level hứa trong hợp đồng' } : null, comment: null,
  });

  // ---------- Supply Chain (dashboard game: ROI, Availability components, Stock components, Stock products) ----------
  const av = dash(/Availability components/), sc = dash(/Stock components/), sp = dash(/Stock products/);
  const avDelta = mean(res.sc.components.map((c) => c.availability)) - mean(base.sc.components.map((c) => c.availability));
  out.push({
    id: 'sc-av', dept: 'Supply Chain', label: 'Availability components (%)', unit: 'pct',
    rMinus2: av ? { value: av.rMinus2, source: 'tab 7 dashboard' } : MISSING('Availability R-2'),
    rMinus1: av ? { value: av.rMinus1, source: 'tab 7 dashboard' } : MISSING('Availability R-1'),
    r0: av ? { value: av.r0, source: 'tab 7 dashboard' } : MISSING('Availability R0'),
    scenario: av?.r0 != null ? Math.min(1, Math.max(0, av.r0 + avDelta)) : null, scenarioBasis: 'estimate', good: 'up', target: null, comment: av?.comment ?? null,
  });
  // Số tuần tồn = giá trị tồn ÷ giá trị nhu cầu/tuần. Nhu cầu/tuần theo giá trị từng NL/SKU = giá trị tồn R0 ÷ số tuần R0 (tab 7),
  // co giãn theo nhu cầu kịch bản (cột "Demand/tuần" mô hình) → promotion không làm số tuần tăng giả.
  const weeklyValue = (items: { value: number | null; r0: number | null; sv: number | null; sw: number | null }[]) =>
    items.reduce((s, x) => s + (x.sv && x.sw ? (x.sv / x.sw) * (x.r0 && x.value !== null ? x.value / x.r0 : 1) : 0), 0);
  const useC = weeklyValue(res.sc.components.map((c) => ({ value: c.sheet.demandPerWeek.value, r0: c.sheet.demandPerWeek.r0, sv: c.stockValueR0, sw: c.sheet.stockWeeks.r0 })));
  const useC0 = weeklyValue(base.sc.components.map((c) => ({ value: c.sheet.demandPerWeek.value, r0: c.sheet.demandPerWeek.r0, sv: c.stockValueR0, sw: c.sheet.stockWeeks.r0 })));
  const useP = weeklyValue(res.sc.products.map((p) => ({ value: p.sheet.demandPerWeek.value, r0: p.sheet.demandPerWeek.r0, sv: p.stockValueR0, sw: p.sheet.stockWeeks.r0 })));
  const useP0 = weeklyValue(base.sc.products.map((p) => ({ value: p.sheet.demandPerWeek.value, r0: p.sheet.demandPerWeek.r0, sv: p.stockValueR0, sw: p.sheet.stockWeeks.r0 })));
  const kUseC = useC0 > 0 ? useC / useC0 : 1, kUseP = useP0 > 0 ? useP / useP0 : 1;
  out.push({
    id: 'sc-stc', dept: 'Supply Chain', label: 'Stock components (weeks)', unit: 'weeks',
    rMinus2: sc ? { value: sc.rMinus2, source: 'tab 7 dashboard' } : MISSING('Stock components R-2'),
    rMinus1: sc ? { value: sc.rMinus1, source: 'tab 7 dashboard' } : MISSING('Stock components R-1'),
    r0: sc ? { value: sc.r0, source: 'tab 7 dashboard' } : MISSING('Stock components R0'),
    scenario: sc?.r0 != null ? sc.r0 * (res.sc.stockValue.components / base.sc.stockValue.components) / kUseC : null, scenarioBasis: 'estimate', good: 'down', target: null, comment: sc?.comment ?? null,
  });
  out.push({
    id: 'sc-stp', dept: 'Supply Chain', label: 'Stock products (weeks)', unit: 'weeks',
    rMinus2: sp ? { value: sp.rMinus2, source: 'tab 7 dashboard' } : MISSING('Stock products R-2'),
    rMinus1: sp ? { value: sp.rMinus1, source: 'tab 7 dashboard' } : MISSING('Stock products R-1'),
    r0: sp ? { value: sp.r0, source: 'tab 7 dashboard' } : MISSING('Stock products R0'),
    scenario: sp?.r0 != null ? sp.r0 * (res.sc.stockValue.products / base.sc.stockValue.products) / kUseP : null, scenarioBasis: 'estimate', good: 'down', target: null, comment: sp?.comment ?? null,
  });
  return out;
}

/** Điểm từng phòng theo tab luật: "Purchasing = contract index TB (thấp tốt); Ops = (chi phí sản xuất + kho)/doanh thu; Sales = doanh thu; SC = giá trị tồn kho (thấp tốt)". */
export interface RoleScore { dept: KpiDept; rule: string; r0: number; scenario: number; unit: 'index' | 'pct' | 'eur'; good: 'up' | 'down'; note: string }

export function roleScores(d: Round0Data, res: Results, base: Results): RoleScore[] {
  const rule = d.rules.find((r) => /Điểm từng role/i.test(r.rule))?.rule ?? '';
  const ciR0 = d.purchasing.contracts.reduce((s, c) => s + c.contractIndex, 0) / (d.purchasing.contracts.length || 1);
  const sum = (r: Results, re: RegExp) => r.finance.rows.filter((x) => !x.isTotal && re.test(x.label)).reduce((s, x) => s + x.value, 0);
  const whRe = /^(Pallet locations|Overflow|Outsourcing tank yard|Inbound permanent|Inbound flexible|Outbound permanent|Outbound flexible)/i;
  const opsScore = (r: Results) => (r.finance.rows.filter((x) => /sản xuất/i.test(x.group) && !x.isTotal).reduce((s, x) => s + x.value, 0) + sum(r, whRe)) / r.finance.realizedRevenue;
  const stock = (r: Results) => r.finance.rows.find((x) => /^Stock$/i.test(x.label))!.value;
  return [
    { dept: 'Purchasing', rule, r0: ciR0, scenario: res.purchasing.kpi.avgContractIndex, unit: 'index', good: 'down', note: 'Contract index TB đơn giản của 5 hợp đồng (tab 4) — game có thể tính trọng số khác (ước lượng). NCC mới / đổi điều kiện mà chưa nhập CI game → dùng CI trước đàm phán.' },
    { dept: 'Operations', rule, r0: opsScore(base), scenario: opsScore(res), unit: 'pct', good: 'down', note: 'Production costs + dòng kho (pallet locations, overflow, tank yard, nhân công kho) ÷ realized revenue (tab 2) — game chưa nói rõ dòng nào là "kho" (ước lượng).' },
    { dept: 'Sales', rule, r0: d.finance.totals.realizedRevenue, scenario: res.finance.realizedRevenue, unit: 'eur', good: 'up', note: 'Realized revenue (tab 2) = contracted (R0 × lượng promotion × CI ÷ CI R0; CI = số game hoặc ước lượng) + penalty service level ước lượng theo SL dự kiến và SL hứa / SL type.' },
    { dept: 'Supply Chain', rule, r0: stock(base), scenario: stock(res), unit: 'eur', good: 'down', note: 'Investment: Stock (tab 2) — giá trị tồn NL + TP.' },
  ];
}
