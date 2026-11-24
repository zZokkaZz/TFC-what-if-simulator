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
];

const INTERVAL = /^sc\.products\..*\.productionIntervalDays$/;
const LINE_BASE = [/^ops\.bottlingLine$/, /^ops\.increaseSpeed$/, /^ops\.mixer$/, INTERVAL];
const BREAKDOWN = [...LINE_BASE, /^ops\.preventiveMaintenance$/, /^ops\.breakdownTraining$/, /^ops\.rmInspection\.(Pack|PET)$/, /^purchasing\.suppliers\.(Pack|PET)$/];
const LINE_ALL = [...BREAKDOWN, /^ops\.smed$/, /^ops\.shifts$/];
const RM_STOCK = [/^ops\.rmPalletLocations$/, /^sc\.components\./, /^purchasing\.suppliers\./, /^ops\.mixer$/];
const RM_HOURS = [...RM_STOCK, /^ops\.rmInspection\./, /^ops\.intakeDays$/, INTERVAL];
const FG_STOCK = [/^ops\.fgPalletLocations$/, /^sc\.products\./, /^ops\.mixer$/];

export const DRIVERS: Record<string, RegExp[]> = {
  run: LINE_BASE,
  changeover: [/^ops\.bottlingLine$/, /^ops\.smed$/, INTERVAL],
  breakdown: BREAKDOWN,
  maintenance: [/^ops\.preventiveMaintenance$/],
  lineLoad: LINE_ALL,
  adherence: [...LINE_ALL, /^sc\.components\./, /^ops\.intakeDays$/, /^purchasing\.suppliers\./],
  avail: [/^sc\.components\./, /^ops\.intakeDays$/, /^purchasing\.suppliers\./],
  scStock: [/^sc\./, /^ops\.mixer$/, /^purchasing\.suppliers\./],
  startup: [/^ops\.bottlingLine$/, /^ops\.increaseSpeed$/, INTERVAL],
  mixer: [/^ops\.mixer$/, INTERVAL],
  rmStock: RM_STOCK,
  rmHours: RM_HOURS,
  rmFlex: [...RM_HOURS, /^ops\.rmFte$/],
  fgStock: FG_STOCK,
  fgHours: [...FG_STOCK, INTERVAL],
  fgFlex: [...FG_STOCK, INTERVAL, /^ops\.fgFte$/],
  tank: [/^sc\.components\.Orange/, /^purchasing\.suppliers\.Orange/, INTERVAL],
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
  const detail = parts.length >= 4 ? parts[2] : parts[0] === 'ops' && parts[1] === 'rmInspection' ? parts[2] : parts[0] === 'purchasing' ? parts[2] : '';
  if (!l) return { dept: 'Ops', label: path };
  return { dept: l[1], label: detail ? `${l[2]} (${detail})` : l[2] };
}

export { flatten };
