// Lưu/đọc bộ quyết định chế độ một mình trong localStorage (bọc try/catch).
import type { Inputs } from '../model/types';
import { merge } from '../sync/sanitize';

const KEY = 'tfc-sim:inputs:v1';
const TAB_KEY = 'tfc-sim:tab';

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
