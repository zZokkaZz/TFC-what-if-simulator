// Ghép dữ liệu nhận về (localStorage / Firestore) lên baseline: chỉ nhận khóa đã biết & đúng kiểu.
import type { Inputs } from '../model/types';
import type { Dept } from './types';

export function merge<T>(base: T, saved: unknown): T {
  if (saved === null || saved === undefined) return base;
  if (typeof base !== 'object' || base === null) {
    if (typeof saved !== typeof base) return base;
    if (typeof saved === 'number' && !Number.isFinite(saved)) return base;
    return saved as T;
  }
  if (typeof saved !== 'object') return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(out)) out[k] = merge(out[k], (saved as Record<string, unknown>)[k]);
  return out as T;
}

/** Sales chưa có quyết định (M3): chỉ nhận số/chuỗi/boolean phẳng. */
function mergeFlat(saved: unknown): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  if (saved && typeof saved === 'object') {
    for (const [k, v] of Object.entries(saved as Record<string, unknown>).slice(0, 50)) {
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v;
    }
  }
  return out;
}

export const makeSanitizer = (base: Inputs) => (dept: Dept, data: unknown): unknown =>
  dept === 'sales' && Object.keys(base.sales).length === 0 ? mergeFlat(data) : merge(base[dept], data);
