// Truy vết nguyên nhân: chỉ số nào phụ thuộc quyết định nào. Khi một quyết định khác baseline,
// ô kết quả liên quan hiện nhãn "← do Ops đổi số ca".
import type { Inputs } from '../model/types';

export type Dept = 'Ops' | 'SC' | 'Purchasing' | 'Sales';

const LABELS: [RegExp, Dept, string][] = [
  [/^ops\.shifts$/, 'Ops', 'số ca'],
  [/^ops\.smed$/, 'Ops', 'SMED'],
  [/^ops\.increaseSpeed$/, 'Ops', 'increase speed'],
  [/^ops\.preventiveMaintenance$/, 'Ops', 'bảo trì'],
  [/^ops\.breakdownTraining$/, 'Ops', 'training'],
  [/^ops\.bottlingLine$/, 'Ops', 'dây chuyền'],
  [/^ops\.mixer$/, 'Ops', 'máy trộn'],
  [/^ops\.rmInspection\./, 'Ops', 'RM inspection'],
  [/^ops\.rmPalletLocations$/, 'Ops', 'pallet kho NL'],
  [/^ops\.rmFte$/, 'Ops', 'FTE kho NL'],
  [/^ops\.intakeDays$/, 'Ops', 'intake time'],
  [/^ops\.fgPalletLocations$/, 'Ops', 'pallet kho TP'],
  [/^ops\.fgFte$/, 'Ops', 'FTE kho TP'],
  [/^sc\.components\..*\.lotSizeWeeks$/, 'SC', 'lot size NL'],
  [/^sc\.components\..*\.safetyStockWeeks$/, 'SC', 'safety stock NL'],
  [/^sc\.products\..*\.productionIntervalDays$/, 'SC', 'production interval'],
  [/^sc\.products\..*\.safetyStockWeeks$/, 'SC', 'safety stock TP'],
  [/^sc\.frozenPeriodWeeks$/, 'SC', 'frozen period'],
  [/^purchasing\.suppliers\./, 'Purchasing', 'NCC'],
  [/^purchasing\.terms\..*\.transport$/, 'Purchasing', 'vận chuyển'],
  [/^purchasing\.terms\..*\.tradeUnit$/, 'Purchasing', 'trade unit NL'],
  [/^purchasing\.terms\..*\.quality$/, 'Purchasing', 'quality NL'],
  [/^purchasing\.terms\..*\.deliveryWindow$/, 'Purchasing', 'delivery window'],
  [/^purchasing\.terms\..*\.paymentTermWeeks$/, 'Purchasing', 'payment term NCC'],
  [/^purchasing\.terms\..*\.agreedReliability$/, 'Purchasing', 'reliability cam kết'],
  [/^purchasing\.terms\..*\.ciGame$/, 'Purchasing', 'CI game'],
  [/^purchasing\.terms\..*\.reliabilityActual$/, 'Purchasing', 'reliability thực tế'],
  [/^purchasing\.terms\..*\.rejectionActual$/, 'Purchasing', 'rejection thực tế'],
  [/^sales\.customers\..*\.tradeUnit$/, 'Sales', 'trade unit khách'],
  [/^sales\.customers\..*\.orderDeadline$/, 'Sales', 'order deadline'],
  [/^sales\.customers\..*\.ciGame$/, 'Sales', 'CI game khách'],
  [/^sales\.customers\..*\.serviceLevelType$/, 'Sales', 'SL type'],
  [/^sales\.customers\..*\.serviceLevel$/, 'Sales', 'SL hứa'],
  [/^sales\.customers\..*\.shelfLife$/, 'Sales', 'shelf life'],
  [/^sales\.customers\..*\.paymentTermWeeks$/, 'Sales', 'payment term khách'],
  [/^sales\.customers\..*\.promotionalPressure$/, 'Sales', 'promotion'],
  [/^sales\.customers\..*\.promotionHorizon$/, 'Sales', 'promotion horizon'],
  [/^sales\.shortageRule$/, 'Sales', 'shortage rule'],
  [/^sales\.customerPriority\./, 'Sales', 'thứ tự ưu tiên khách'],
];

const INTERVAL = /^sc\.products\..*\.productionIntervalDays$/;
const LINE_BASE = [/^ops\.bottlingLine$/, /^ops\.increaseSpeed$/, /^ops\.mixer$/, INTERVAL, /^sales\.customers\..*\.promotionalPressure$/];
const PUR = /^purchasing\./;
const PUR_QUALITY = /^purchasing\.(suppliers\.(Pack|PET)|terms\.(Pack|PET)\.quality)$/;
const BREAKDOWN = [...LINE_BASE, /^ops\.preventiveMaintenance$/, /^ops\.breakdownTraining$/, /^ops\.rmInspection\.(Pack|PET)$/, PUR_QUALITY];
const LINE_ALL = [...BREAKDOWN, /^ops\.smed$/, /^ops\.shifts$/];
const RM_STOCK = [/^ops\.rmPalletLocations$/, /^sc\.components\./, PUR, /^ops\.mixer$/, /^sales\.customers\..*\.promotionalPressure$/];
const RM_HOURS = [...RM_STOCK, /^ops\.rmInspection\./, /^ops\.intakeDays$/, INTERVAL];
const FG_STOCK = [/^ops\.fgPalletLocations$/, /^sc\.products\./, /^ops\.mixer$/, /^sales\.customers\..*\.(promotionalPressure|shelfLife)$/];
const SALES_TU = /^sales\.customers\..*\.tradeUnit$/;
const SALES_CI = /^sales\.customers\./;
const SALES_PROMO = /^sales\.customers\..*\.promotionalPressure$/;
const SALES_SHELF = /^sales\.customers\..*\.shelfLife$/;

export const DRIVERS: Record<string, RegExp[]> = {
  run: LINE_BASE,
  changeover: [/^ops\.bottlingLine$/, /^ops\.smed$/, INTERVAL],
  breakdown: BREAKDOWN,
  maintenance: [/^ops\.preventiveMaintenance$/],
  lineLoad: LINE_ALL,
  adherence: [...LINE_ALL, /^sc\.components\./, /^ops\.intakeDays$/, PUR],
  avail: [/^sc\.components\./, /^ops\.intakeDays$/, PUR],
  scStock: [/^sc\.(components|products)\./, /^ops\.mixer$/, PUR, SALES_PROMO, SALES_SHELF],
  startup: [/^ops\.bottlingLine$/, /^ops\.increaseSpeed$/, INTERVAL],
  mixer: [/^ops\.mixer$/, INTERVAL],
  rmStock: RM_STOCK,
  rmHours: RM_HOURS,
  rmFlex: [...RM_HOURS, /^ops\.rmFte$/],
  fgStock: FG_STOCK,
  fgHours: [...FG_STOCK, INTERVAL, SALES_TU],
  fgFlex: [...FG_STOCK, INTERVAL, /^ops\.fgFte$/, SALES_TU],
  tank: [/^sc\.components\.(Orange|Mango|Vitamin C)/, /^purchasing\.(suppliers|terms)\.(Orange|Mango|Vitamin C)/, INTERVAL],
  // M3 Purchasing
  purchase: [PUR, /^sc\.components\./, /^ops\.mixer$/, INTERVAL, SALES_PROMO],
  trips: [/^sc\.components\..*\.lotSizeWeeks$/, PUR, /^ops\.mixer$/, INTERVAL],
  // M3 Sales: SL dự kiến ← safety stock TP, interval (SC) + plan adherence (Ops, NL, NCC); frozen period chưa mô hình
  sales: [/^sc\.(components|products)\./, ...LINE_ALL, /^ops\.intakeDays$/, PUR, SALES_CI],
  // Sales mục 1: contract index khách ← điều khoản hợp đồng (ước lượng) hoặc CI game
  salesCi: [SALES_CI],
  payterm: [/^purchasing\.terms\..*\.paymentTermWeeks$/, PUR, /^sc\.components\./, /^sales\.customers\./],
};

function flatten(o: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = o;
  return out;
}

export function changedPaths(base: Inputs, cur: Inputs): string[] {
  const a = flatten(base), b = flatten(cur);
  return Object.keys(b).filter((k) => a[k] !== b[k]);
}

export interface Cause { dept: Dept; label: string }

export function causesFor(driverKey: string, changed: string[]): Cause[] {
  const pats = DRIVERS[driverKey] ?? [];
  const seen = new Set<string>();
  const out: Cause[] = [];
  for (const p of changed) {
    if (!pats.some((re) => re.test(p))) continue;
    const l = LABELS.find(([re]) => re.test(p));
    if (!l) continue;
    const key = `${l[1]}:${l[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ dept: l[1], label: l[2] });
  }
  return out;
}

/** Nhãn dễ đọc cho một đường dẫn quyết định, vd "sc.components.PET.lotSizeWeeks" → "lot size NL (PET)". */
export function describePath(path: string): { dept: Dept; label: string } {
  const l = LABELS.find(([re]) => re.test(path));
  const parts = path.split('.');
  const detail = parts[0] === 'sales' && parts[1] === 'customerPriority' ? `hạng ${Number(parts[2]) + 1}` : parts.length >= 4 ? parts[2] : parts[0] === 'ops' && parts[1] === 'rmInspection' ? parts[2] : parts[0] === 'purchasing' ? parts[2] : '';
  if (!l) return { dept: 'Ops', label: path };
  return { dept: l[1], label: detail ? `${l[2]} (${detail})` : l[2] };
}

export { flatten };
