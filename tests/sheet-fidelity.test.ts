// "KHÔNG BỊA SỐ": đọc thẳng file Excel bằng SheetJS và so TỪNG Ô với dữ liệu app hiển thị.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';

const XLSX: typeof import('xlsx') = createRequire(import.meta.url)('xlsx');
const wb = XLSX.readFile('data/TFC_Round0.xlsx');
const d = data as unknown as Round0Data;
const rowsOf = (sheet: string) => XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: null });

describe('Bảng nguyên văn = đúng từng ô trong file Excel', () => {
  it.each(d.rawTables.filter((t) => t.id !== 'daily-stats').map((t) => [t.id, t] as const))('%s', (_id, t) => {
    const rows = rowsOf(t.sheet);
    const h = rows.findIndex((r) => t.headers.every((x, k) => String(r?.[k] ?? '').normalize('NFC').trim() === x));
    expect(h, `không thấy dòng tiêu đề của ${t.title}`).toBeGreaterThanOrEqual(0);
    t.rows.forEach((r, i) => r.forEach((v, k) => {
      const raw = rows[h + 1 + i]?.[k];
      expect(v, `${t.title} dòng ${i + 1} cột "${t.headers[k]}"`).toBe(raw === undefined || raw === '' ? null : raw);
    }));
  });
  it('thống kê tab 11 (TB, thấp nhất, cao nhất, ngày hết hàng…) = đúng file', () => {
    const t = d.rawTables.find((x) => x.id === 'daily-stats')!;
    const rows = rowsOf(t.sheet);
    for (const r of t.rows) {
      const src = rows.find((x) => String(x?.[0] ?? '') === r[0])!;
      r.slice(1).forEach((v, k) => expect(v).toBe(src[k + 1] ?? null));
    }
  });
  it('130 ngày tồn kho tab 11 = đúng file', () => {
    const rows = rowsOf('11_R0 Theo ngày');
    for (const x of d.daily) {
      const src = rows.find((r) => r?.[0] === x.day && typeof r?.[1] === 'number')!;
      expect([x.rmWeeks.Pack, x.rmWeeks.PET, x.rmWeeks.Orange, x.rmWeeks.Mango, x.rmWeeks['Vitamin C'], x.fgWeeks['Orange 1L'], x.fgWeeks['C-power 1L'], x.fgWeeks['Mango 1L'], x.fgWeeks['Orange PET'], x.fgWeeks['C-power PET'], x.fgWeeks['Mango PET'], x.rmHours, x.fgHours]).toEqual(src.slice(1, 14));
    }
  });
});
