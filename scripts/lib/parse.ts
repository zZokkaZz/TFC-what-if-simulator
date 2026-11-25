/** Đọc số từ ô Excel; chuỗi kiểu Việt Nam: '.' = nghìn, ',' = thập phân, có thể kèm % hoặc €. */
export function parseVN(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  let s = String(v).trim().replace(/[€\s]/g, '');
  const pct = s.endsWith('%');
  if (pct) s = s.slice(0, -1);
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return pct ? n / 100 : n;
}
