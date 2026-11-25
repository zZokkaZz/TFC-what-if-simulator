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

import { baselineInputs, simulate } from '../src/model/simulate';

describe('Số HIỂN THỊ ở baseline = đúng số đề bài', () => {
  const r = simulate(baselineInputs(d), d);
  const R0 = d.ops.results;
  const fin = (re: RegExp) => d.finance.lines.find((l) => re.test(l.label))!.value;
  it('ROI = ô ROI tab 2 (−7,68%), OP, Investment, GM, Indirect = đúng tab 2', () => {
    expect(r.finance.roi).toBeCloseTo(d.finance.totals.roi, 9); // ô ROI trong file lưu 11 chữ số
    expect(r.finance.operatingProfit).toBeCloseTo(d.finance.totals.operatingProfit, 6);
    expect(r.finance.investment).toBeCloseTo(d.finance.totals.investment, 6);
    expect(r.finance.grossMargin).toBeCloseTo(d.finance.totals.grossMargin, 6);
    expect(r.finance.indirectCost).toBeCloseTo(d.finance.totals.indirectCost, 6);
    expect(r.finance.realizedRevenue).toBe(d.finance.totals.realizedRevenue);
  });
  it('mọi dòng P&L = đúng tab 2', () => {
    for (const row of r.finance.rows.filter((x) => !x.isTotal && !x.isNew)) expect(row.value, row.label).toBeCloseTo(row.r0 as number, 6);
  });
  it('mọi chỉ số Ops hiển thị = đúng tab 5 / tab 11', () => {
    const o = r.ops;
    expect([o.line.run, o.line.changeover, o.line.breakdown, o.line.unused, o.line.overtime]).toEqual([R0.line.run, R0.line.changeover, R0.line.breakdown, R0.line.unused, R0.line.overtime].map((x) => expect.closeTo(x, 9)));
    expect(o.line.planAdherence).toBeCloseTo(R0.line.planAdherence, 9);
    expect(o.line.startupLossEur).toBeCloseTo(R0.line.startupLossEur, 6);
    expect(o.mixer.cleaningShare).toBeCloseTo(R0.mixer.cleaningShare, 9);
    expect(o.mixer.avgLotL).toBeCloseTo(R0.mixer.avgLotL, 6);
    expect(o.rm.utilization).toBeCloseTo(R0.rm.utilization, 9);
    expect(o.rm.overflowShare).toBeCloseTo(R0.rm.overflow, 9);
    expect(o.rm.hoursPerWeek).toBeCloseTo(R0.rm.hoursPerWeek, 9);
    expect(o.rm.overflowCost).toBeCloseTo(fin(/^Overflow raw/), 6);
    expect(o.rm.flexCost).toBeCloseTo(fin(/^Inbound flexible/), 6);
    expect(o.rm.daysAboveFixed).toBe(d.dailyStats.rmDaysAboveFixed);
    expect(o.fg.utilization).toBeCloseTo(R0.fg.utilization, 9);
    expect(o.fg.overflowShare).toBeCloseTo(R0.fg.overflow, 9);
    expect(o.fg.hoursPerWeek).toBeCloseTo(R0.fg.hoursPerWeek, 9);
    expect(o.fg.overflowCost).toBeCloseTo(fin(/^Overflow finished/), 6);
    expect(o.fg.flexCost).toBeCloseTo(fin(/^Outbound flexible/), 6);
    expect(o.fg.daysAboveFixed).toBe(d.dailyStats.fgDaysAboveFixed);
    expect(o.tankYard.cost).toBeCloseTo(fin(/tank yard/i), 6);
    for (const p of o.production) {
      const st = d.supplyChain.productStock.find((x) => x.sku === p.sku)!;
      expect(p.adherence).toBeCloseTo(st.planAdherence, 9);
      expect(p.startupLossEur).toBeCloseTo(st.startupLossEur, 6);
    }
  });
});

describe('Tab 2: số game in (cột Ghi chú) = đúng file; app hiện cả hai nguồn', () => {
  it('Operating profit & Indirect cost: "Game: …" trong ô Ghi chú = gamePrinted', () => {
    const rows = rowsOf('2_Finance');
    const note = (label: string) => String(rows.find((r) => String(r?.[1] ?? '').trim() === label)?.[3] ?? '');
    const game = (label: string) => Number(note(label).match(/Game:\s*(-?[\d.]+)/)![1].replace(/\./g, ''));
    expect(d.finance.gamePrinted.operatingProfit).toBe(game('Operating profit'));
    expect(d.finance.gamePrinted.indirectCost).toBe(game('Indirect cost'));
  });
});
