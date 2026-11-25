// Test cho các chỗ sửa sau phiên tự kiểm tra (25/11/2026):
//  1. câu cảnh báo Investment → ROI đúng theo dấu Operating profit (đang lỗ thì giảm Investment làm ROI xấu đi);
//  2. giảm lot size NL → cảnh báo phí vận chuyển/đơn hàng chưa tính (M3);
//  3. interval ngắn → tồn NL & availability tăng là do mẻ tối thiểu máy trộn; dòng "Interest on components" chỉ khi tăng SS;
//  4. Operating profit / Indirect cost: số game in (cột Ghi chú tab 2) đọc đúng từ file Excel;
//  5. định dạng không ra "−0,00".
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { crossWarnings, investmentRoiNote } from '../src/model/warnings';
import { signed } from '../src/ui/format';
import { r0TwoSources } from '../src/ui/r0Sources';

const XLSX: typeof import('xlsx') = createRequire(import.meta.url)('xlsx');
const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => { const i: Inputs = structuredClone(base); f(i); return { i, r: simulate(i, d) }; };
const allProd = (i: Inputs, patch: object) => { for (const k of Object.keys(i.sc.products)) Object.assign((i.sc.products as Record<string, object>)[k], patch); };
const allComp = (i: Inputs, patch: object) => { for (const k of Object.keys(i.sc.components)) Object.assign((i.sc.components as Record<string, object>)[k], patch); };

describe('1. Investment → ROI theo dấu Operating profit', () => {
  it('đang lỗ: giảm Investment → câu ghi "làm ROI xấu đi", không ghi "ROI tăng"', () => {
    const t = investmentRoiNote(-306505, 3946426, 3989513);
    expect(t).toMatch(/làm ROI xấu đi/);
    expect(t).not.toMatch(/ROI tăng|ROI tốt lên/);
    expect(t).toMatch(/−0,0\d điểm %/);
  });
  it('đang lãi: giảm Investment → "làm ROI tốt lên"; tăng Investment → "xấu đi"', () => {
    expect(investmentRoiNote(100000, 900000, 1000000)).toMatch(/làm ROI tốt lên/);
    expect(investmentRoiNote(100000, 1100000, 1000000)).toMatch(/làm ROI xấu đi/);
  });
  it('đang lỗ: tăng Investment → "làm ROI tốt lên" (lỗ chia mẫu lớn hơn)', () => {
    expect(investmentRoiNote(-306505, 4100000, 3989513)).toMatch(/làm ROI tốt lên/);
  });
  it('R0 đang lỗ: giảm safety stock TP 3 → 2 → cảnh báo tồn kho ghi đúng chiều ROI', () => {
    expect(b.finance.operatingProfit).toBeLessThan(0);
    const { i, r } = run((x) => allProd(x, { safetyStockWeeks: 2 }));
    expect(r.finance.investment).toBeLessThan(b.finance.investment);
    const w = crossWarnings(d, base, i, r, b).find((x) => x.id === 'stock-fin')!;
    expect(w.detail).toMatch(/đang âm \(−€302\.580, lỗ\)/);
    expect(w.detail).not.toMatch(/€-/);
    expect(w.detail).toMatch(/làm ROI xấu đi/);
    expect(w.detail).not.toMatch(/Investment giảm → ROI tăng/);
    // kiểm tra số học: riêng phần Investment (giữ OP kịch bản) đúng là làm ROI giảm
    expect(r.finance.operatingProfit / r.finance.investment).toBeLessThan(r.finance.operatingProfit / b.finance.investment);
  });
});

describe('2. Lot size NL giảm → cảnh báo phí vận chuyển & đơn hàng (M3: đã tính, ước lượng)', () => {
  // Trước M3 cảnh báo ghi "chưa tính"; M3 Purchasing tính phí vận chuyển & phí đơn hàng theo số chuyến (ước lượng, neo R0).
  it('lot size 4 → 2: có cảnh báo gắn "ước lượng", dòng ROI có số (phí tăng), không còn "chưa tính"', () => {
    const { i, r } = run((x) => allComp(x, { lotSizeWeeks: 2 }));
    const w = crossWarnings(d, base, i, r, b).find((x) => x.id === 'sc-lot-trips')!;
    expect(w).toBeTruthy();
    expect(w.title).toMatch(/phí vận chuyển & phí đơn hàng tăng \(ước lượng\)/);
    expect(w.title).not.toMatch(/chưa tính/);
    expect(w.roi.length).toBeGreaterThan(0);
    expect(w.roi.every((x) => x.delta !== null)).toBe(true);
    const row = (re: RegExp) => r.finance.rows.find((x) => re.test(x.label))!;
    // số chuyến ×2 → phí đơn hàng nhập ×2 (neo R0 × tỷ lệ số chuyến)
    expect(row(/^Inbound orders$/).value).toBeCloseTo(row(/^Inbound orders$/).r0! * 2, 6);
    expect(r.purchasing.transportCost).toBeGreaterThan(b.purchasing.transportCost);
  });
  it('lot size tăng hoặc không đổi → không có cảnh báo này', () => {
    expect(crossWarnings(d, base, base, b, b).some((x) => x.id === 'sc-lot-trips')).toBe(false);
    const { i, r } = run((x) => allComp(x, { lotSizeWeeks: 6 }));
    expect(crossWarnings(d, base, i, r, b).some((x) => x.id === 'sc-lot-trips')).toBe(false);
  });
});

describe('3. Interval ngắn → tồn NL tăng là do mẻ tối thiểu máy trộn', () => {
  const short = run((x) => allProd(x, { productionIntervalDays: 5 }));
  it('Fruitmix MQ (mẻ tối thiểu 8.000 L): interval 5 → dư lít → lượng dùng & tồn Vitamin C tăng', () => {
    expect(short.r.opsRaw.mixer.excessLitersPerWeek).toBeGreaterThan(0);
    const vc = short.r.opsRaw.components.find((x) => x.key === 'Vitamin C')!;
    const vb = b.opsRaw.components.find((x) => x.key === 'Vitamin C')!;
    expect(vc.usagePerWeek).toBeGreaterThan(vb.usagePerWeek);
    expect(short.r.sc.stockValue.components).toBeGreaterThan(b.sc.stockValue.components);
  });
  it('đổi sang FMM 4000 (mẻ tối thiểu 3.000 L): interval 5 KHÔNG còn đổi lượng dùng, tồn và availability NL', () => {
    const fmm = run((x) => { allProd(x, { productionIntervalDays: 5 }); x.ops.mixer = 'FMM 4000'; });
    const fmmBase = run((x) => { x.ops.mixer = 'FMM 4000'; });
    expect(fmm.r.opsRaw.mixer.excessLitersPerWeek).toBe(0);
    for (const c of fmm.r.opsRaw.components) {
      const cb = fmmBase.r.opsRaw.components.find((x) => x.key === c.key)!;
      expect(c.usagePerWeek).toBeCloseTo(cb.usagePerWeek, 9);
    }
    expect(fmm.r.sc.stockValue.components).toBeCloseTo(fmmBase.r.sc.stockValue.components, 6);
    for (const c of fmm.r.sc.components) expect(c.availability).toBeCloseTo(fmmBase.r.sc.components.find((x) => x.key === c.key)!.availability, 9);
  });
  it('cảnh báo mẻ tối thiểu nói rõ NL tăng và availability tăng là ước lượng', () => {
    const w = crossWarnings(d, base, short.i, short.r, b).find((x) => x.id === 'mixer-min')!;
    expect(w.detail).toMatch(/Lít dư vẫn tiêu thụ nguyên liệu/);
    expect(w.detail).toMatch(/Vitamin C \+\d+%/);
    expect(w.detail).toMatch(/Availability NL mô hình tăng.*ước lượng/);
    expect(w.roi.some((x) => /Interest on components/.test(x.label))).toBe(true);
    expect(w.from).toBe('SC');
    expect(w.to).not.toContain('SC');
  });
  it('cảnh báo Vitamin C không hiện dòng "Interest on components" khi không tăng safety stock', () => {
    const wBase = crossWarnings(d, base, base, b, b).find((x) => x.id === 'avail-low-Vitamin C')!;
    expect(wBase.roi.some((x) => /Interest on components/.test(x.label))).toBe(false);
    const wShort = crossWarnings(d, base, short.i, short.r, b).find((x) => x.id === 'avail-low-Vitamin C')!;
    expect(wShort.roi.some((x) => /Interest on components/.test(x.label))).toBe(false);
  });
  it('tăng safety stock Vitamin C → dòng "Interest on components (do tăng SS)" hiện ở cảnh báo Vitamin C', () => {
    const { i, r } = run((x) => { x.sc.components['Vitamin C'].safetyStockWeeks = 3; });
    const w = crossWarnings(d, base, i, r, b).find((x) => x.id === 'avail-low-Vitamin C')!;
    expect(w).toBeTruthy();
    const row = w.roi.find((x) => /Interest on components \(do tăng SS\)/.test(x.label))!;
    expect(row.delta).toBeGreaterThan(0);
  });
});

describe('4. Operating profit & Indirect cost: cả số game in và tổng dòng sheet', () => {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(XLSX.readFile('data/TFC_Round0.xlsx').Sheets['2_Finance'], { header: 1, raw: true, defval: null });
  const noteOf = (label: string) => String(rows.find((r) => String(r?.[1] ?? '').trim() === label)![3]);
  const vnInt = (s: string) => Number(s.replace(/\./g, ''));
  it('số game in = đúng chuỗi "Game: …" trong cột Ghi chú tab 2', () => {
    const op = noteOf('Operating profit').match(/Game:\s*(-?[\d.]+)/)![1];
    const ind = noteOf('Indirect cost').match(/Game:\s*(-?[\d.]+)/)![1];
    expect(d.finance.gamePrinted.operatingProfit).toBe(vnInt(op));
    expect(d.finance.gamePrinted.indirectCost).toBe(vnInt(ind));
    expect(d.finance.gamePrinted).toEqual({ operatingProfit: -306503, indirectCost: 1209651 });
  });
  it('tổng dòng sheet vẫn là số app dùng (ROI = ô tab 2)', () => {
    expect(d.finance.totals.operatingProfit).toBe(-306505);
    expect(d.finance.totals.indirectCost).toBe(1209653);
    expect(b.finance.operatingProfit).toBe(d.finance.totals.operatingProfit);
  });
  it('chuỗi hiển thị có cả hai nguồn', () => {
    expect(r0TwoSources(d, 'operatingProfit')).toBe('R0: tổng dòng sheet −€306.505 · game in −€306.503');
    expect(r0TwoSources(d, 'indirectCost')).toBe('R0: tổng dòng sheet €1.209.653 · game in €1.209.651');
  });
});

describe('5. Định dạng chênh lệch không ra "−0,00"', () => {
  it('số rất nhỏ làm tròn về 0 → "±0,00 điểm %"', () => {
    expect(signed(-0.00004, 'pt', 2)).toBe('±0,00 điểm %');
    expect(signed(0.00004, 'pt', 2)).toBe('±0,00 điểm %');
    expect(signed(-0.3, 'eur')).toBe('±€0');
  });
  it('số khác 0 giữ dấu', () => {
    expect(signed(-0.0085, 'pt', 2)).toBe('−0,85 điểm %');
    expect(signed(0.0002, 'pt', 2)).toBe('+0,02 điểm %');
    expect(signed(-106, 'eur')).toBe('−€106');
  });
});
