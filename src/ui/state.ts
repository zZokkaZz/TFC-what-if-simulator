// Lưu/đọc bộ quyết định trong localStorage (bọc try/catch: trình duyệt chặn storage vẫn chạy được).
import type { Inputs } from '../model/types';

const KEY = 'tfc-sim:inputs:v1';
const TAB_KEY = 'tfc-sim:tab';

/** Ghép dữ liệu đã lưu lên baseline: chỉ nhận khóa đã biết & đúng kiểu, tránh hỏng khi đổi phiên bản. */
function merge<T>(base: T, saved: unknown): T {
  if (saved === null || saved === undefined) return base;
  if (typeof base !== 'object' || base === null) return (typeof saved === typeof base ? saved : base) as T;
  if (typeof saved !== 'object') return base;
  const out: Record<string, unknown> = Array.isArray(base) ? [...(base as unknown[])] as unknown as Record<string, unknown> : { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(out)) out[k] = merge(out[k], (saved as Record<string, unknown>)[k]);
  return out as T;
}

export function loadInputs(base: Inputs): Inputs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? merge(base, JSON.parse(raw)) : base;
  } catch {
    return base;
  }
}

export function saveInputs(i: Inputs) {
  try { localStorage.setItem(KEY, JSON.stringify(i)); } catch { /* bỏ qua */ }
}

export function loadTab(def: string): string {
  try { return localStorage.getItem(TAB_KEY) ?? def; } catch { return def; }
}
export function saveTab(t: string) {
  try { localStorage.setItem(TAB_KEY, t); } catch { /* bỏ qua */ }
}
