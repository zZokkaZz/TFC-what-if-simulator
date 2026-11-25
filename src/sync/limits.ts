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

/** Purchasing — giới hạn chống nhập nhầm (không phải luật game). Tỷ lệ lưu dạng 0–1. Khớp firestore.rules. */
export const PUR_LIMITS = {
  paymentTermWeeks: { min: 0, max: 52, int: true, label: 'Payment term', unit: 'tuần' } as NumLimit,
  agreedReliability: { min: 0.5, max: 1, label: 'Agreed delivery reliability' } as NumLimit,
  ciGame: { min: 0.5, max: 2, label: 'Contract index (game hiển thị)' } as NumLimit,
  reliabilityActual: { min: 0, max: 1, label: 'Reliability thực tế' } as NumLimit,
  rejectionActual: { min: 0, max: 0.5, label: 'Rejection thực tế' } as NumLimit,
};
/** Ô chữ của điều kiện hợp đồng: độ dài tối đa (rules: shortStr). */
export const PUR_TEXT = ['transport', 'tradeUnit', 'quality', 'deliveryWindow'] as const;
export const PUR_TEXT_MAX = 20;
export const PUR_COMPONENTS = ['Pack', 'PET', 'Orange', 'Mango', 'Vitamin C'] as const;

/** Sales — ô hợp đồng từng khách. Tên khách = tab 6 (test kiểm tra khớp dữ liệu và firestore.rules).
 *  Lựa chọn hợp lệ của ô chữ đọc từ sheet; ở đây (và rules) chỉ chặn độ dài chuỗi.
 *  Khoảng SL hứa / shelf life / payment term = khoảng game cho phép ghi ở tab 6 (test so với sheet); tỷ lệ lưu dạng 0–1. */
export const SALES_CUSTOMERS = ['Food & Groceries', 'LAND Market', "Dominick's"] as const;
export const SALES_LIMITS = {
  ciGame: { min: 0.5, max: 2, label: 'Contract index khách (game hiển thị)' } as NumLimit,
  serviceLevel: { min: 0.75, max: 1, label: 'Service level hứa' } as NumLimit,
  shelfLife: { min: 0.4, max: 0.85, label: 'Shelf life yêu cầu' } as NumLimit,
  paymentTermWeeks: { min: 1, max: 8, int: true, label: 'Payment term khách', unit: 'tuần' } as NumLimit,
};
export const SALES_TEXT = ['tradeUnit', 'orderDeadline', 'serviceLevelType', 'promotionalPressure', 'promotionHorizon'] as const;
export const SALES_TEXT_MAX = 20;

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
    for (const [c, t] of Object.entries((d.terms ?? {}) as Record<string, Record<string, unknown>>)) {
      if (!(PUR_COMPONENTS as readonly string[]).includes(c)) { add(`purchasing.terms.${c}`, `Điều kiện ${c}`, c, 'nguyên liệu không hợp lệ'); continue; }
      for (const k of PUR_TEXT) if (typeof t?.[k] !== 'string' || (t[k] as string).length > PUR_TEXT_MAX) add(`purchasing.terms.${c}.${k}`, `${k} (${c})`, t?.[k], 'giá trị không hợp lệ');
      add(`purchasing.terms.${c}.paymentTermWeeks`, `Payment term (${c})`, t?.paymentTermWeeks, checkNumber(t?.paymentTermWeeks, PUR_LIMITS.paymentTermWeeks));
      add(`purchasing.terms.${c}.agreedReliability`, `Reliability cam kết (${c})`, t?.agreedReliability, checkNumber(t?.agreedReliability, PUR_LIMITS.agreedReliability));
      for (const k of ['ciGame', 'reliabilityActual', 'rejectionActual'] as const) {
        if (t?.[k] !== null) add(`purchasing.terms.${c}.${k}`, `${PUR_LIMITS[k].label} (${c})`, t?.[k], checkNumber(t?.[k], PUR_LIMITS[k]));
      }
    }
  } else if (dept === 'sales') {
    for (const [c, t] of Object.entries((d.customers ?? {}) as Record<string, Record<string, unknown>>)) {
      if (!(SALES_CUSTOMERS as readonly string[]).includes(c)) { add(`sales.customers.${c}`, `Khách ${c}`, c, 'khách hàng không hợp lệ'); continue; }
      for (const k of SALES_TEXT) if (typeof t?.[k] !== 'string' || (t[k] as string).length > SALES_TEXT_MAX) add(`sales.customers.${c}.${k}`, `${k} (${c})`, t?.[k], 'giá trị không hợp lệ');
      if (t?.ciGame !== null) add(`sales.customers.${c}.ciGame`, `${SALES_LIMITS.ciGame.label} (${c})`, t?.ciGame, checkNumber(t?.ciGame, SALES_LIMITS.ciGame));
      for (const k of ['serviceLevel', 'shelfLife', 'paymentTermWeeks'] as const) add(`sales.customers.${c}.${k}`, `${SALES_LIMITS[k].label} (${c})`, t?.[k], checkNumber(t?.[k], SALES_LIMITS[k]));
    }
  }
  return out;
}

export const describeIssues = (issues: Issue[]) =>
  issues.slice(0, 3).map((i) => `${i.label} = ${i.value} (${i.message})`).join('; ') + (issues.length > 3 ? ` … +${issues.length - 3}` : '');
