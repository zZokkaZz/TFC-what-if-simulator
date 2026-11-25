// Ghép dữ liệu nhận về (localStorage / Firestore) lên baseline: chỉ nhận khóa đã biết & đúng kiểu.
import type { Inputs } from '../model/types';
import type { Dept } from './types';

export function merge<T>(base: T, saved: unknown): T {
  // Ô "bỏ trống được" (baseline null, vd CI game hiển thị): nhận số hữu hạn hoặc null
  if (base === null) return (typeof saved === 'number' && Number.isFinite(saved) ? saved : null) as T;
  if (saved === undefined) return base;
  // Ô số bỏ trống được mà người dùng đã điền rồi xóa: baseline là số chỉ khi là ô bắt buộc → null không hợp lệ
  if (saved === null) return base;
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

// Sales (từ mục 1, 25/11) có cấu trúc { customers: { [khách]: { tradeUnit, orderDeadline, ciGame } } } → dùng merge như các phòng khác:
// chỉ nhận khách và trường có trong baseline; bản lưu cũ dạng phẳng ({} hoặc khóa lạ) bị bỏ, về baseline.
export const makeSanitizer = (base: Inputs) => (dept: Dept, data: unknown): unknown => merge(base[dept], data);
