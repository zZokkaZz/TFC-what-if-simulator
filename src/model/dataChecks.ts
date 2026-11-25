// Kiểm tra dữ liệu: đối chiếu các tổng TRONG file Excel với nhau (không dùng model).
// Dùng sau mỗi lần thay file (vòng chính thức) để phát hiện đọc sai/thiếu trước khi tin kết quả.
import type { Round0Data } from '../data/types';

export interface DataCheck {
  label: string;
  a: { name: string; value: number };
  b: { name: string; value: number };
  tol: number; // sai lệch tuyệt đối cho phép (làm tròn của game)
  ok: boolean;
  unit: '€' | 'đv' | '%' | '';
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function dataChecks(d: Round0Data): DataCheck[] {
  const f = d.finance;
  const L = (re: RegExp) => sum(f.lines.filter((l) => re.test(l.group)).map((l) => l.value));
  const lab = (re: RegExp) => f.lines.find((l) => re.test(l.label))?.value ?? NaN;
  const rows: Omit<DataCheck, 'ok'>[] = [
    { label: 'Doanh thu: tổng dòng P&L = Realized revenue', a: { name: 'Σ hợp đồng + penalty (tab 2)', value: L(/^Doanh thu/) }, b: { name: 'Realized revenue (tab 2)', value: f.totals.realizedRevenue }, tol: 3, unit: '€' },
    { label: 'Doanh thu theo khách = doanh thu P&L', a: { name: 'Σ revenue 3 khách (tab 6)', value: sum(d.sales.customerResults.map((c) => c.revenue)) }, b: { name: 'Realized revenue (tab 2)', value: f.totals.realizedRevenue }, tol: 3, unit: '€' },
    { label: 'Mua NL: P&L = kết quả NCC', a: { name: 'Σ purchase value (tab 2)', value: L(/mua NL/) }, b: { name: 'Σ purchase value NCC (tab 4)', value: sum(d.purchasing.results.map((r) => r.purchaseValue)) }, tol: 3, unit: '€' },
    { label: 'COGS = mua NL + sản xuất', a: { name: 'Purchase + production (tab 2)', value: L(/mua NL/) + L(/sản xuất/) }, b: { name: 'COGS (tab 2)', value: f.totals.cogs }, tol: 3, unit: '€' },
    { label: 'Gross margin = doanh thu − COGS', a: { name: 'Revenue − COGS', value: f.totals.realizedRevenue - f.totals.cogs }, b: { name: 'Gross margin (tab 2)', value: f.totals.grossMargin }, tol: 3, unit: '€' },
    { label: 'Indirect cost = tổng các dòng gián tiếp', a: { name: 'Σ dòng Indirect (tab 2)', value: L(/^Indirect/) }, b: { name: 'Indirect cost (tab 2)', value: f.totals.indirectCost }, tol: 3, unit: '€' },
    { label: 'Operating profit = GM − Indirect', a: { name: 'GM − Indirect', value: f.totals.grossMargin - f.totals.indirectCost }, b: { name: 'Operating profit (tab 2)', value: f.totals.operatingProfit }, tol: 3, unit: '€' },
    { label: 'Investment = tổng các dòng', a: { name: 'Σ dòng Investment (tab 2)', value: L(/^Investment/) }, b: { name: 'Investment (tab 2)', value: f.totals.investment }, tol: 3, unit: '€' },
    { label: 'ROI = Operating profit / Investment', a: { name: 'OP / Investment', value: f.totals.operatingProfit / f.totals.investment }, b: { name: 'ROI (tab 2)', value: f.totals.roi }, tol: 0.0001, unit: '%' },
    { label: 'Tồn kho: SC = Investment Stock', a: { name: 'Σ giá trị tồn NL + TP (tab 7)', value: sum(d.supplyChain.componentStock.map((c) => c.stockValue)) + sum(d.supplyChain.productStock.map((p) => p.stockValue)) }, b: { name: 'Stock (tab 2)', value: lab(/^Stock$/) }, tol: 3, unit: '€' },
    { label: 'Nhu cầu: theo SKU = theo khách × SKU', a: { name: 'Σ nhu cầu 6 SKU (tab 3)', value: sum(d.products.map((p) => p.demandPerWeek)) }, b: { name: 'Σ nhu cầu khách × SKU (tab 6)', value: sum(d.sales.customerProduct.map((c) => c.demandPerWeek)) }, tol: 3, unit: 'đv' },
    { label: 'Nhu cầu tab 12 (TB 26 tuần) ≈ tab 3', a: { name: 'Σ TB tuần 1–26 (tab 12)', value: sum(Object.values(d.weekly.mean)) }, b: { name: 'Σ nhu cầu/tuần (tab 3)', value: sum(d.products.map((p) => p.demandPerWeek)) }, tol: 0.05 * sum(d.products.map((p) => p.demandPerWeek)), unit: 'đv' },
    { label: 'Start-up loss: Σ theo SKU = dây chuyền', a: { name: 'Σ 6 SKU (tab 7)', value: sum(d.supplyChain.productStock.map((p) => p.startupLossEur)) }, b: { name: 'Start-up loss (tab 5)', value: d.ops.results.line.startupLossEur }, tol: 3, unit: '€' },
    { label: 'Kho NL: usage / capacity = utilization', a: { name: 'Usage ÷ capacity (tab 5)', value: d.ops.results.rm.usage / d.ops.results.rm.capacity }, b: { name: 'Utilization (tab 5)', value: d.ops.results.rm.utilization }, tol: 0.002, unit: '%' },
    { label: 'Kho TP: usage / capacity = utilization', a: { name: 'Usage ÷ capacity (tab 5)', value: d.ops.results.fg.usage / d.ops.results.fg.capacity }, b: { name: 'Utilization (tab 5)', value: d.ops.results.fg.utilization }, tol: 0.002, unit: '%' },
    { label: 'Dữ liệu theo ngày đủ 130 ngày', a: { name: 'Số ngày (tab 11, bỏ ngày 0)', value: d.daily.filter((x) => x.day >= 1).length }, b: { name: 'Số ngày làm việc/round', value: 130 }, tol: 0, unit: '' },
  ];
  return rows.map((r) => ({ ...r, ok: Number.isFinite(r.a.value) && Number.isFinite(r.b.value) && Math.abs(r.a.value - r.b.value) <= r.tol + 1e-9 }));
}
