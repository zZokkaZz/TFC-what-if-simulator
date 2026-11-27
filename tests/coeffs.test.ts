// Hệ số ước lượng chưa xác minh: một chỗ duy nhất (src/model/assumptions.ts → COEFFS).
// Khi có dữ liệu trial: sửa giá trị ở đó rồi chạy lại test — các test dưới đây đọc giá trị từ COEFFS, không gõ lại số.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs } from '../src/model/types';
import { COEFFS, type Coeff } from '../src/model/assumptions';
import { baselineInputs, simulate } from '../src/model/simulate';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => { const i: Inputs = structuredClone(base); f(i); return simulate(i, d); };
const entries = Object.entries(COEFFS) as [string, Coeff][];

/** Toàn bộ mã nguồn src/ trừ assumptions.ts (nơi khai báo). */
function srcFiles(dir = 'src'): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? srcFiles(p) : /\.(ts|tsx)$/.test(p) && !p.endsWith('assumptions.ts') ? [p] : [];
  });
}
const SRC = srcFiles().map((p) => ({ p, text: readFileSync(p, 'utf8') }));

describe('COEFFS: mỗi hệ số có nguồn, trạng thái, nơi dùng, cách xác minh', () => {
  it.each(entries)('%s', (_id, c) => {
    expect(Number.isFinite(c.value)).toBe(true);
    expect(c.label.length).toBeGreaterThan(5);
    expect(c.source.length).toBeGreaterThan(20);
    expect(['chưa xác minh', 'đã xác minh']).toContain(c.status);
    expect(c.usedIn.length).toBeGreaterThan(3);
    expect(c.verifyWith.length).toBeGreaterThan(5);
  });
  it('hệ số "đã xác minh" phải ghi nguồn Round 1 (hiệu chỉnh R1, 27/11); còn lại "chưa xác minh"', () => {
    for (const [id, c] of entries) if (c.status === 'đã xác minh') expect(c.source, id).toMatch(/R1/);
  });
  it('"usedIn" khớp thực tế: hệ số "chưa dùng" thì không file nào đọc; hệ số đang dùng thì file ghi trong usedIn có đọc COEFFS.<id>', () => {
    for (const [id, c] of entries) {
      const users = SRC.filter((f) => f.text.includes(`COEFFS.${id}`)).map((f) => f.p);
      if (/^chưa dùng/.test(c.usedIn)) expect(users, id).toEqual([]);
      else {
        expect(users.length, id).toBeGreaterThan(0);
        expect(users.some((u) => c.usedIn.includes(u.replace(/\\/g, '/'))), `${id}: usedIn "${c.usedIn}" không khớp ${users.join(', ')}`).toBe(true);
      }
    }
  });
});

describe('Mô hình đọc đúng giá trị từ COEFFS (không gõ lại số)', () => {
  const k = COEFFS.outOfRangeFactor.value, e = COEFFS.penaltyShortfallExponent.value;
  const scenarios: [string, (i: Inputs) => void][] = [
    ['SS TP 3 → 2', (i) => { for (const s of Object.keys(i.sc.products)) (i.sc.products as Record<string, { safetyStockWeeks: number }>)[s].safetyStockWeeks = 2; }],
    ['SS TP 3 → 1', (i) => { for (const s of Object.keys(i.sc.products)) (i.sc.products as Record<string, { safetyStockWeeks: number }>)[s].safetyStockWeeks = 1; }],
    ['2 → 1 ca', (i) => { i.ops.shifts = 1; }],
  ];
  it.each(scenarios)('%s: cờ ngoài vùng = mức thiếu > outOfRangeFactor × R0 (hoặc bị chặn); penalty = R0 × (tỷ lệ thiếu)^mũ (chặn ở contracted)', (_n, f) => {
    const r = run(f);
    for (const c of r.sales.customers) {
      expect(c.outOfRange).toBe(c.capped || (c.shortfallR0 > 0 ? c.shortfall > k * c.shortfallR0 : c.shortfall > 0));
      const raw = c.penaltyR0 * Math.pow(c.shortfall / c.shortfallR0, e);
      expect(c.penalty).toBeCloseTo(Math.max(raw, -c.contracted), 6);
    }
  });
  it('baseline không phụ thuộc các hệ số (tỷ lệ = 1): không khách nào ngoài vùng, penalty = đúng tab 2', () => {
    for (const c of b.sales.customers) {
      expect(c.outOfRange).toBe(false);
      expect(c.penalty).toBe(c.penaltyR0);
    }
  });
  it('không còn số "2 ×" gõ cứng cho mốc ngoài vùng trong src/', () => {
    for (const f of SRC) expect(f.text, f.p).not.toMatch(/OUT_OF_RANGE_FACTOR\s*=\s*\d|mức thiếu (&gt;|>) 2 ×/);
  });
});
