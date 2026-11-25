// Định dạng số kiểu Việt Nam: 1.234.567 · 12,5% · €1.234
const nf = (d: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });

export const num = (x: number, d = 0) => (Number.isFinite(x) ? nf(d).format(x) : '—');
export const eur = (x: number) => (Number.isFinite(x) ? `${x < 0 ? '−' : ''}€${nf(0).format(Math.abs(x))}` : '—');
export const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${nf(d).format(x * 100)}%` : '—');
export const hrs = (x: number, d = 1) => `${num(x, d)} giờ`;

export function signed(x: number, kind: 'eur' | 'pct' | 'pt' | 'num', d = 1): string {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  // Dấu theo số ĐÃ làm tròn hiển thị: −0,00004 với 2 chữ số → "±0,00", không phải "−0,00"
  const dp = kind === 'eur' ? 0 : d;
  const shown = Number(((kind === 'pct' || kind === 'pt' ? a * 100 : a)).toFixed(dp));
  const s = shown === 0 ? '±' : x > 0 ? '+' : '−';
  if (kind === 'eur') return `${s}€${nf(0).format(a)}`;
  if (kind === 'pct') return `${s}${nf(d).format(a * 100)}%`;
  if (kind === 'pt') return `${s}${nf(d).format(a * 100)} điểm %`;
  return `${s}${nf(d).format(a)}`;
}
