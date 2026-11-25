// Phân phối chuẩn: dùng cho biến động giờ tải dây chuyền theo tuần.

export const phi = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/** CDF chuẩn (xấp xỉ Abramowitz–Stegun 7.1.26, sai số < 1.5e-7). */
export function Phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** E[(X − a)+] với X ~ N(mu, sigma) */
export function expectedAbove(mu: number, sigma: number, a: number): number {
  if (sigma <= 0) return Math.max(0, mu - a);
  const z = (a - mu) / sigma;
  return sigma * phi(z) + (mu - a) * (1 - Phi(z));
}

/** E[(a − X)+] với X ~ N(mu, sigma) */
export function expectedBelow(mu: number, sigma: number, a: number): number {
  if (sigma <= 0) return Math.max(0, a - mu);
  const z = (a - mu) / sigma;
  return (a - mu) * Phi(z) + sigma * phi(z);
}

/** Tìm nghiệm f(x)=0 trên [lo, hi] bằng chia đôi (f đơn điệu). */
export function bisect(f: (x: number) => number, lo: number, hi: number, iters = 80): number {
  let flo = f(lo);
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}
