// So sánh 2 bộ quyết định của một phòng → danh sách thay đổi + câu tóm tắt cho nhật ký.
import type { Dept, LogChange } from './types';
import { DEPT_SHORT } from './types';
import { describePath, flatten } from '../ui/trace';

const fmt = (v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
  if (v === undefined || v === null) return '—';
  return String(v).slice(0, 60);
};

export function diffDept(dept: Dept, before: unknown, after: unknown): LogChange[] {
  const a = flatten(before, dept), b = flatten(after, dept);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: LogChange[] = [];
  for (const k of keys) {
    if (a[k] === b[k]) continue;
    out.push({ path: k, label: describePath(k).label, from: fmt(a[k]), to: fmt(b[k]) });
  }
  return out.slice(0, 20);
}

export function summarize(dept: Dept, changes: LogChange[]): string {
  if (!changes.length) return `${DEPT_SHORT[dept]} lưu (không đổi)`;
  const head = changes.slice(0, 3).map((c) => `${c.label} ${c.from} → ${c.to}`).join('; ');
  return `${DEPT_SHORT[dept]} đổi ${head}${changes.length > 3 ? ` (+${changes.length - 3})` : ''}`.slice(0, 280);
}
