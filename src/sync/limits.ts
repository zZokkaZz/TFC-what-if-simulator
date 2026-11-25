// Giới hạn hợp lệ cho từng ô quyết định — DÙNG CHUNG cho ô nhập trên giao diện và kiểm tra trước khi
// ghi Firebase. Các giới hạn ops/sc khớp với firestore.rules (sửa ở đây thì sửa cả rules).
import type { Dept } from './types';

export interface NumLimit { min: number; max: number; int?: boolean; label: string; unit?: string }

export const OPS_LIMITS: Record<string, NumLimit> = {
  rmPalletLocations: { min: 0, max: 100_000, int: true, label: 'Pallet locations kho NL', unit: 'pallet' },
  rmFte: { min: 0, max: 200, label: 'FTE kho NL', unit: 'FTE' },
  intakeDays: { min: 1, max: 60, int: true, label: 'Intake time', unit: 'ngày' },
  shifts: { min: 1, max: 5, int: true, label: 'Số ca' },
  fgPalletLocations: { min: 0, max: 100_000, int: true, label: 'Pallet locations kho TP', unit: 'pallet' },
  fgFte: { min: 0, max: 200, label: 'FTE kho TP', unit: 'FTE' },
};

export const SC_LIMITS = {
  frozenPeriodWeeks: { min: 0, max: 26, label: 'Frozen period', unit: 'tuần' } as NumLimit,
  safetyStockWeeks: { min: 0, max: 26, label: 'Safety stock', unit: 'tuần' } as NumLimit,
  lotSizeWeeks: { min: 0.2, max: 26, label: 'Lot size', unit: 'tuần' } as NumLimit,
  productionIntervalDays: { min: 1, max: 130, int: true, label: 'Production interval', unit: 'ngày' } as NumLimit,
};

export interface Issue { path: string; label: string; value: string; message: string }

const fmt = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('vi-VN') : JSON.stringify(v));

/** Lỗi của một giá trị số theo giới hạn, hoặc null nếu hợp lệ. */
export function checkNumber(v: unknown, lim: NumLimit): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'phải là số';
  if (lim.int && !Number.isInteger(v)) return 'phải là số nguyên';
  if (v < lim.min) return `tối thiểu ${lim.min.toLocaleString('vi-VN')}${lim.unit ? ' ' + lim.unit : ''}`;
  if (v > lim.max) return `tối đa ${lim.max.toLocaleString('vi-VN')}${lim.unit ? ' ' + lim.unit : ''}`;
  return null;
}

/** Kiểm tra dữ liệu một phòng trước khi ghi lên bản chung. */
export function validateDept(dept: Dept, data: unknown): Issue[] {
  const out: Issue[] = [];
  const d = (data ?? {}) as Record<string, unknown>;
  const add = (path: string, label: string, v: unknown, msg: string | null) => { if (msg) out.push({ path, label, value: fmt(v), message: msg }); };
  if (dept === 'ops') {
    for (const [k, lim] of Object.entries(OPS_LIMITS)) add(`ops.${k}`, lim.label, d[k], checkNumber(d[k], lim));
    for (const k of ['mixer', 'bottlingLine']) if (typeof d[k] !== 'string' || (d[k] as string).length > 60) add(`ops.${k}`, k, d[k], 'tên không hợp lệ');
    if (!['None', 'Minimal', 'Extensive'].includes(d.preventiveMaintenance as string)) add('ops.preventiveMaintenance', 'Preventive maintenance', d.preventiveMaintenance, 'chỉ được None / Minimal / Extensive');
  } else if (dept === 'sc') {
    add('sc.frozenPeriodWeeks', SC_LIMITS.frozenPeriodWeeks.label, d.frozenPeriodWeeks, checkNumber(d.frozenPeriodWeeks, SC_LIMITS.frozenPeriodWeeks));
    for (const [c, v] of Object.entries((d.components ?? {}) as Record<string, Record<string, unknown>>)) {
      add(`sc.components.${c}.safetyStockWeeks`, `Safety stock NL (${c})`, v?.safetyStockWeeks, checkNumber(v?.safetyStockWeeks, SC_LIMITS.safetyStockWeeks));
      add(`sc.components.${c}.lotSizeWeeks`, `Lot size NL (${c})`, v?.lotSizeWeeks, checkNumber(v?.lotSizeWeeks, SC_LIMITS.lotSizeWeeks));
    }
    for (const [s, v] of Object.entries((d.products ?? {}) as Record<string, Record<string, unknown>>)) {
      add(`sc.products.${s}.productionIntervalDays`, `Production interval (${s})`, v?.productionIntervalDays, checkNumber(v?.productionIntervalDays, SC_LIMITS.productionIntervalDays));
      add(`sc.products.${s}.safetyStockWeeks`, `Safety stock TP (${s})`, v?.safetyStockWeeks, checkNumber(v?.safetyStockWeeks, SC_LIMITS.safetyStockWeeks));
    }
  } else if (dept === 'purchasing') {
    for (const [c, v] of Object.entries((d.suppliers ?? {}) as Record<string, unknown>)) if (typeof v !== 'string' || v.length > 60) add(`purchasing.suppliers.${c}`, `NCC ${c}`, v, 'tên NCC không hợp lệ');
  }
  return out;
}

export const describeIssues = (issues: Issue[]) =>
  issues.slice(0, 3).map((i) => `${i.label} = ${i.value} (${i.message})`).join('; ') + (issues.length > 3 ? ` … +${issues.length - 3}` : '');
