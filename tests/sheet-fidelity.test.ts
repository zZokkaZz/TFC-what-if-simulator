// "KHÔNG BỊA SỐ": đọc thẳng file Excel bằng SheetJS và so TỪNG Ô với dữ liệu app hiển thị.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';

const XLSX: typeof import('xlsx') = createRequire(import.meta.url)('xlsx');
/** Vị trí cột theo tiêu đề — mẫu phải khớp ĐÚNG 1 cột (khớp nhiều cột = sheet có cột mới trùng tên → sửa mẫu). */
function uniqueCol(headers: string[], re: RegExp): number {
  const hits = headers.map((h, k) => (h && re.test(h) ? k : -1)).filter((k) => k >= 0);
  if (hits.length !== 1) throw new Error(`Mẫu ${re} khớp ${hits.length} cột: ${hits.map((k) => headers[k]).join(' | ')}`);
  return hits[0];
}
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

describe('M3 Purchasing: baseline (không đổi gì) = đúng từng ô tab 4 / tab 2 / dashboard', () => {
  const rows4 = rowsOf('4_Purchasing');
  const hdr = rows4.findIndex((r) => String(r?.[0] ?? '').trim() === 'Nhà cung cấp' && String(r?.[1] ?? '').trim() === 'Reliability thực tế');
  const H = rows4[hdr].map((x) => String(x ?? '').trim());
  const col = (re: RegExp) => uniqueCol(H, re);
  const sheetRow = (supplier: string) => rows4.slice(hdr + 1).find((r) => String(r?.[0] ?? '').trim() === supplier)!;
  const r = simulate(baselineInputs(d), d);
  it.each(r.purchasing.components.map((x) => [x.supplier, x] as const))('%s: reliability, rejection, purchase value, transport, giá thực trả = tab 4', (_s, x) => {
    const row = sheetRow(x.supplier);
    expect(x.reliability).toBe(row[col(/^Reliability thực tế$/)]);
    expect(x.rejection).toBe(row[col(/^Rejection$/)]);
    expect(x.purchaseValue).toBeCloseTo(row[col(/^Purchase value/)] as number, 6);
    expect(x.transportCost).toBeCloseTo(row[col(/^Transport cost/)] as number, 6);
    expect(x.pricePaid).toBeCloseTo(row[col(/^Giá thực trả/)] as number, 9);
    expect(x.ciBasis).toBe('sheet');
    expect(x.reliabilityBasis).toBe('sheet');
    expect(x.rejectionBasis).toBe('sheet');
  });
  it('NCC, contract index, lead time, trade unit, payment term, reliability cam kết = hợp đồng tab 4', () => {
    const h = rows4.findIndex((x) => String(x?.[0] ?? '').trim() === 'Component' && String(x?.[1] ?? '').trim() === 'Nhà cung cấp');
    const HC = rows4[h].map((x) => String(x ?? '').trim());
    const cc = (re: RegExp) => uniqueCol(HC, re);
    for (const x of r.purchasing.components) {
      const row = rows4.slice(h + 1, h + 6).find((y) => String(y?.[1] ?? '').trim() === x.supplier)!;
      expect(x.contractIndex).toBe(row[cc(/^Contract index$/)]);
      expect(x.leadTimeDays).toBe(row[cc(/^Lead time/)]);
      expect(x.tradeUnit).toBe(row[cc(/^Trade unit$/)]);
      expect(x.paymentTermWeeks).toBe(row[cc(/^Payment term/)]);
      expect(x.quality).toBe(row[cc(/^Quality$/)]);
      expect(x.deliveryWindow).toBe(row[cc(/^Delivery window$/)]);
    }
  });
  it('P&L: dòng mua NL, Inbound order lines, Inbound orders, Payment terms, Purchase value = đúng tab 2; ROI = ô tab 2', () => {
    const fin = rowsOf('2_Finance');
    const v = (label: string) => fin.find((x) => String(x?.[1] ?? '').trim() === label)![2] as number;
    for (const row of r.finance.rows.filter((x) => /mua NL/i.test(x.group))) expect(row.value).toBeCloseTo(v(row.label), 6);
    for (const label of ['Inbound order lines', 'Inbound orders', 'Payment terms', 'Purchase value']) {
      expect(r.finance.rows.find((x) => x.label === label)!.value, label).toBeCloseTo(v(label), 6);
    }
    expect(r.finance.roi).toBeCloseTo(v('ROI'), 9);
  });
  it('KPI Purchasing (dashboard tab 4: rejection 2,9%, reliability 92,1%, chi phí NL 39,5%) và điểm phòng = R0', () => {
    const title = String(rows4.find((x) => /dashboard:/i.test(String(x?.[0] ?? '')))![0]);
    const pctIn = (re: RegExp) => Number(title.match(re)![1].replace(',', '.')) / 100;
    expect(r.purchasing.kpi.rejection).toBeCloseTo(pctIn(/rejection TB\s*([\d,]+)%/), 12);
    expect(r.purchasing.kpi.reliability).toBeCloseTo(pctIn(/reliability TB\s*([\d,]+)%/), 12);
    expect(r.purchasing.kpi.rawMaterialCosts).toBeCloseTo(pctIn(/chi phí NL\s*([\d,]+)%/), 12);
    const ci = d.purchasing.contracts.reduce((s, x) => s + x.contractIndex, 0) / d.purchasing.contracts.length;
    expect(r.purchasing.kpi.avgContractIndex).toBeCloseTo(ci, 12);
  });
  it('công thức đã kiểm chứng: giá cơ bản × CI × lượng mua + phí vận chuyển = Purchase value (tab 4, lệch ≤ €1)', () => {
    const h = rows4.findIndex((x) => String(x?.[1] ?? '').trim() === 'Nhà cung cấp' && /Basic contract index/.test(String(x?.[3] ?? '')));
    const HS = rows4[h].map((x) => String(x ?? '').trim());
    const priceCol = HS.findIndex((x) => /^Giá cơ bản/.test(x));
    for (const k of d.purchasing.contracts) {
      const price = rows4.slice(h + 1).find((y) => String(y?.[1] ?? '').trim() === k.supplier)![priceCol] as number;
      const row = sheetRow(k.supplier);
      const calc = price * k.contractIndex * (row[col(/^Amount purchased|^Lượng mua|^Đã mua/)] as number ?? d.purchasing.results.find((x) => x.supplier === k.supplier)!.purchasedInRound!) + (row[col(/^Transport cost/)] as number);
      expect(Math.abs(calc - (row[col(/^Purchase value/)] as number)), k.supplier).toBeLessThanOrEqual(1);
    }
  });
  it('số pallet / FTL = đúng ghi chú tab 3 ("30 pallet = 1 xe tải")', () => {
    const txt = rowsOf('3_Sản phẩm').flat().map((x) => String(x ?? '')).find((t) => /pallet\s*=\s*1\s*xe tải/i.test(t))!;
    expect(d.palletsPerFtl).toBe(Number(txt.match(/(\d+)\s*pallet\s*=\s*1\s*xe tải/i)![1]));
  });
});

describe('M3 Sales: baseline (không đổi gì) = đúng tab 2 / tab 6 / tab 1 / tab 7', () => {
  const r = simulate(baselineInputs(d), d);
  const fin = rowsOf('2_Finance');
  const v2 = (label: string) => fin.find((x) => String(x?.[1] ?? '').trim().normalize('NFC') === label.normalize('NFC'))![2] as number;
  const rows6 = rowsOf('6_Sales');
  const h6 = rows6.findIndex((x) => String(x?.[0] ?? '').trim() === 'Khách hàng' && /Attained contract index/.test(String(x?.[1] ?? '')));
  const H6 = rows6[h6].map((x) => String(x ?? '').trim());
  const c6 = (re: RegExp) => uniqueCol(H6, re);
  it.each(r.sales.customers.map((x) => [x.customer, x] as const))('%s: penalty, contracted (tab 2); revenue, SL order lines, SL pieces, attained CI (tab 6)', (_c, x) => {
    const row = rows6.slice(h6 + 1).find((y) => String(y?.[0] ?? '').trim() === x.customer)!;
    expect(x.penalty).toBe(v2(`Penalty service level – ${x.customer}`));
    expect(x.contracted).toBe(v2(`Contracted sales – ${x.customer}`));
    expect(x.revenue).toBe(row[c6(/^Revenue \(€/)]);
    expect(x.slOrderLines).toBe(row[c6(/^SL order lines$/)]);
    expect(x.slPieces).toBe(row[c6(/^SL pieces$/)]);
    expect(x.attainedCi).toBe(row[c6(/^Attained contract index$/)]);
  });
  it('P&L: 3 dòng penalty và Realized revenue = đúng tab 2', () => {
    for (const row of r.finance.rows.filter((x) => /^Penalty service level/.test(x.label))) expect(row.value).toBe(v2(row.label));
    expect(r.finance.realizedRevenue).toBe(v2('Realized revenue'));
    expect(r.sales.realizedRevenue).toBe(v2('Realized revenue'));
  });
  it('Service level outbound order lines = KPI nhanh tab 1; SL TP từng SKU = tab 7', () => {
    const rows1 = rowsOf('1_Vấn đề R0');
    const hq = rows1.findIndex((x) => (x ?? []).some((c) => String(c ?? '').trim() === 'Chỉ số') && (x ?? []).some((c) => String(c ?? '').trim() === 'Giá trị'));
    const iL = rows1[hq].findIndex((c) => String(c ?? '').trim() === 'Chỉ số'), iV = rows1[hq].findIndex((c) => String(c ?? '').trim() === 'Giá trị');
    const q = rows1.slice(hq + 1).find((x) => /^Service level outbound/.test(String(x?.[iL] ?? '')))!;
    expect(r.sales.slOutbound).toBe(q[iV]);
    for (const p of r.sc.products) {
      const st = d.supplyChain.productStock.find((x) => x.sku === p.sku)!;
      expect(p.slPiecesEst).toBe(st.slPieces);
      expect(p.sheet.slOrderLines.value).toBe(st.slOrderLines);
    }
  });
  it('kiểm chứng R0: contracted + penalty (tab 2) = revenue tab 6 (đúng tuyệt đối); contracted × (1 − attained CI ÷ CI) ≈ penalty (< 1%)', () => {
    const hk = rows6.findIndex((x) => String(x?.[0] ?? '').trim() === 'Khách hàng' && /Contract index/.test(H6.join('|')) && String(x?.[4] ?? '').trim() === 'Contract index');
    for (const k of d.sales.contracts) {
      const row = rows6.slice(h6 + 1).find((y) => String(y?.[0] ?? '').trim() === k.customer)!;
      const con = v2(`Contracted sales – ${k.customer}`), pen = v2(`Penalty service level – ${k.customer}`);
      expect(con + pen, k.customer).toBe(row[c6(/^Revenue \(€/)]);
      const ci = hk >= 0 ? (rows6.slice(hk + 1).find((y) => String(y?.[0] ?? '').trim() === k.customer)![4] as number) : k.contractIndex;
      const idPen = -con * (1 - (row[c6(/^Attained contract index$/)] as number) / ci);
      expect(Math.abs(idPen / pen - 1), k.customer).toBeLessThan(0.01);
    }
  });
});

describe('Sửa sau rà soát: tank yard 2 nguồn; tab 6 cột mới; cột tiêu đề không mơ hồ', () => {
  it('usage tank yard trong ghi chú tab 5 (vd 5,85) = đúng chuỗi trong file; tab 10 (6) vẫn là số app neo', () => {
    const rows5 = rowsOf('5_Operations');
    const note = rows5.map((r) => (r ?? []).map((c) => String(c ?? '')).join(' ')).find((t) => /usage TB\s*[\d.,]+\s*tank/i.test(t));
    const v = note ? Number(note.match(/usage TB\s*([\d.,]+)\s*tank/i)![1].replace(',', '.')) : null;
    expect(d.ops.results.tankYard.usageNoteTab5).toBe(v);
    expect(simulate(baselineInputs(d), d).ops.tankYard.avgTanks).toBe(d.ops.results.tankYard.usage);
  });
  it('bảng nguyên văn tab 6 có đủ cột mới (Carbon footprint, Revenue/tuần, MAPE, Distributor)', () => {
    const hs = (id: string) => d.rawTables.find((t) => t.id === id)?.headers ?? [];
    expect(hs('sales-cust')).toContain('Carbon footprint');
    expect(hs('sales-cust')).toContain('Revenue/tuần (€)');
    expect(hs('sales-prod')).toContain('Forecast error (MAPE)');
    expect(hs('sales-dist')[0]).toBe('Distributor');
  });
  it('revenue khách đọc từ cột cả round, không phải "Revenue/tuần (€)"; nhu cầu khách × SKU đọc cột đơn vị, không phải (€)', () => {
    const t = d.rawTables.find((x) => x.id === 'sales-cust')!;
    const iRound = t.headers.findIndex((h) => /^Revenue \(€/.test(h));
    for (const c of d.sales.customerResults) expect(c.revenue).toBe(t.rows.find((r) => r[0] === c.customer)![iRound]);
    const cp = d.rawTables.find((x) => x.id === 'sales-cp')!;
    const iU = cp.headers.findIndex((h) => /^Nhu cầu\/tuần \(đv\)/.test(h));
    d.sales.customerProduct.forEach((x, k) => expect(x.demandPerWeek).toBe(cp.rows[k][iU]));
  });
});
