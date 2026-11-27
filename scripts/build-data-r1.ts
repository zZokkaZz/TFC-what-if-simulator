/**
 * Đọc data/TFC_Round1.xlsx (tab R1_*, người dùng trích từ game) → sinh src/data/round1.json.
 * Nguyên tắc như build-data.ts: tìm bảng theo dòng tiêu đề / nhãn, không hard-code tọa độ ô, thiếu thì dừng (không đoán).
 * Chạy: npm run data
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseVN } from './lib/parse';
import type { ComponentKey, SkuKey } from '../src/data/types';
import type { R1FinanceRow, Round1Data } from '../src/data/round1Types';

const XLSX: typeof import('xlsx') = createRequire(import.meta.url)('xlsx');
const SRC = resolve('data/TFC_Round1.xlsx');
const OUT = resolve('src/data/round1.json');
if (!existsSync(SRC)) { console.log('ℹ build-data-r1: chưa có data/TFC_Round1.xlsx — bỏ qua'); process.exit(0); }

type Cell = string | number | boolean | null;
type Rows = Cell[][];
function fail(msg: string): never { console.error(`\n✖ build-data-r1: ${msg}\n`); process.exit(1); }
const wb = XLSX.readFile(SRC);
const str = (v: unknown) => String(v ?? '').normalize('NFC').trim();
function sheet(name: string): Rows {
  const n = wb.SheetNames.find((s) => s.normalize('NFC').toLowerCase() === name.toLowerCase());
  if (!n) fail(`Thiếu tab ${name}. Có: ${wb.SheetNames.join(', ')}`);
  return XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false });
}
const num = (v: Cell, what: string): number => { const x = parseVN(v); if (x === null) fail(`${what}: "${v}" không phải số`); return x; };
const pct = (v: Cell, what: string): number => { const x = num(v, what); return x > 1.5 ? x / 100 : x; };
const bool = (v: Cell): boolean => /true|✓|^yes/i.test(str(v));
/** Bảng có dòng tiêu đề mà ô đầu khớp `head` → { cols, rows } (dừng ở dòng có ô đầu trống hoặc bắt đầu bảng khác). */
function table(rows: Rows, head: RegExp, what: string) {
  const i = rows.findIndex((r) => head.test(str(r[0])));
  if (i < 0) fail(`${what}: không thấy dòng tiêu đề ${head}`);
  const cols = rows[i].map(str);
  const body: Rows = [];
  for (let k = i + 1; k < rows.length; k++) {
    const r = rows[k];
    if (!str(r[0]) || /^(popup|bóng đèn|ghi chú|biểu đồ|cột|nhận xét|thiếu)/i.test(str(r[0]))) break;
    body.push(r);
  }
  const c = (re: RegExp) => { const j = cols.findIndex((h) => re.test(h)); if (j < 0) fail(`${what}: thiếu cột ${re}. Có: ${cols.join(' | ')}`); return j; };
  return { cols, body, c };
}

// Tên SKU / NL trong game → khóa của simulator (đọc từ round0.json, không gõ lại)
const r0 = JSON.parse(readFileSync(resolve('src/data/round0.json'), 'utf8')) as { products: { key: SkuKey; name: string }[]; components: { key: ComponentKey }[] };
const skuOf = (name: string): SkuKey => {
  const n = str(name).toLowerCase();
  const p = r0.products.find((x) => x.name.toLowerCase() === n);
  if (!p) fail(`SKU "${name}" không khớp tên sản phẩm R0`);
  return p.key;
};
const compOf = (name: string): ComponentKey => {
  const n = str(name).toLowerCase();
  const map: [RegExp, ComponentKey][] = [[/^pack/, 'Pack'], [/^pet/, 'PET'], [/^orange/, 'Orange'], [/^mango/, 'Mango'], [/^vitamin/, 'Vitamin C']];
  const hit = map.find(([re]) => re.test(n));
  if (!hit) fail(`Nguyên liệu "${name}" không nhận ra`);
  return hit[1];
};

// ---------- Finance ----------
const finRows = sheet('R1_Finance');
const fh = finRows.findIndex((r) => /^round$/i.test(str(r[0])));
if (fh < 0) fail('R1_Finance: thiếu dòng "Round"');
const rows: R1FinanceRow[] = [];
for (const r of finRows.slice(fh + 1)) {
  const r1 = parseVN(r[1]), r0v = parseVN(r[2]), lv = parseVN(r[4]);
  if (r1 === null || r0v === null || lv === null) continue;
  rows.push({ label: str(r[0]), r1, r0: r0v, level: lv });
}
const CUSTOMERS = ['Food & Groceries', 'LAND Market', "Dominick's"];
const custRows = (c: string) => rows.filter((x) => x.label === c);
const contracted: Record<string, number> = {}, penaltyBonus: Record<string, number> = {};
for (const c of CUSTOMERS) {
  const rr = custRows(c);
  const k = rr.find((x) => x.level === 4), p = rr.find((x) => x.level === 6);
  if (!k || !p) fail(`R1_Finance: thiếu dòng contracted / penalty của ${c}`);
  contracted[c] = k.r1; penaltyBonus[c] = p.r1;
}
const byLabel = (re: RegExp) => rows.find((x) => re.test(x.label)) ?? fail(`R1_Finance: thiếu dòng ${re}`);
const roiRow = byLabel(/^ROI$/);
const opIdx = rows.findIndex((x) => /^Operating profit$/i.test(x.label));
if (opIdx < 0 || !rows[opIdx + 1] || rows[opIdx + 1].level !== 1) fail('R1_Finance: không thấy Investment ngay sau Operating profit');
const revenueRow = rows[rows.indexOf(roiRow) + 1];
const realizedRevenue = revenueRow.r1;
const sumK = CUSTOMERS.reduce((s, c) => s + contracted[c] + penaltyBonus[c], 0);
if (Math.abs(sumK - realizedRevenue) > 2) fail(`R1_Finance: realized revenue ${realizedRevenue} ≠ Σ contracted + penalty ${sumK}`);
const payRow = byLabel(/^Payment terms$/);

// ---------- Quyết định ----------
const opsDec = sheet('R1_Ops_decisions');
const od = (group: RegExp, label: RegExp) => opsDec.find((r) => group.test(str(r[0])) && label.test(str(r[1])))?.[2] ?? fail(`R1_Ops_decisions: thiếu ${group} / ${label}`);
const rmInspection: Record<string, boolean> = {};
for (const r of opsDec.filter((r) => /^per supplier$/i.test(str(r[0])) && !/tiêu đề/i.test(str(r[1])))) rmInspection[str(r[1])] = bool(r[2]);

const scDec = sheet('R1_SC_decisions');
const scC = table(scDec, /^Component$/, 'R1_SC_decisions (NL)');
const scComponents = {} as Round1Data['decisions']['sc']['components'];
for (const r of scC.body.filter((_x, i, a) => a.slice(0, i + 1).every((y) => parseVN(y[1]) !== null))) scComponents[compOf(str(r[0]))] = { safetyStockWeeks: num(r[scC.c(/Safety stock/)], 'SS NL'), lotSizeWeeks: num(r[scC.c(/Lot size/)], 'Lot NL') };
const frozenRow = scDec.find((r) => /^Frozen period/i.test(str(r[0]))) ?? fail('R1_SC_decisions: thiếu Frozen period');
const scP = table(scDec, /^Product$/, 'R1_SC_decisions (TP)');
const scProducts = {} as Round1Data['decisions']['sc']['products'];
for (const r of scP.body.filter((_x, i, a) => a.slice(0, i + 1).every((y) => parseVN(y[1]) !== null))) scProducts[skuOf(str(r[0]))] = { productionIntervalDays: num(r[scP.c(/interval/i)], 'interval'), safetyStockWeeks: num(r[scP.c(/Safety stock/)], 'SS TP') };

const purDec = table(sheet('R1_Pur_decisions'), /^Component$/, 'R1_Pur_decisions');
const purchasing = {} as Round1Data['decisions']['purchasing'];
for (const r of purDec.body) {
  const c = purDec.c;
  purchasing[compOf(str(r[0]))] = {
    supplier: str(r[c(/^Supplier$/)]), contractIndex: num(r[c(/Contract index/)], 'CI NCC'), quality: str(r[c(/^Quality/)]),
    leadTimeDays: num(r[c(/Lead time/)], 'lead time'), certified: bool(r[c(/Certification/)]), transport: str(r[c(/Transport mode/)]),
    freeCapacity: pct(r[c(/Free capacity/)], 'free capacity'), paymentTermWeeks: num(r[c(/Payment term/)], 'payment term NCC'),
    tradeUnit: str(r[c(/Trade unit/)]), agreedReliability: pct(r[c(/Agreed delivery/)], 'agreed reliability'), deliveryWindow: str(r[c(/Delivery window/)]),
  };
}

const salesDecRows = sheet('R1_Sales_decisions');
const sd = table(salesDecRows, /^Customer$/, 'R1_Sales_decisions');
const salesCustomers: Round1Data['decisions']['sales']['customers'] = {};
for (const r of sd.body) {
  if (!CUSTOMERS.includes(str(r[0]))) break;
  const c = sd.c;
  salesCustomers[str(r[0])] = {
    contractIndex: num(r[c(/Contract index/)], 'CI khách'), serviceLevelType: str(r[c(/Service level type/)]), serviceLevel: pct(r[c(/^Service level \(%\)/)], 'SL'),
    shelfLife: pct(r[c(/Shelf life/)], 'shelf life'), orderDeadline: str(r[c(/Order deadline/)]), tradeUnit: str(r[c(/Trade unit/)]),
    paymentTermWeeks: num(r[c(/Payment term/)], 'payment term khách'), promotionalPressure: str(r[c(/Promotional pressure/)]), promotionHorizon: str(r[c(/Promotion horizon/)]),
  };
}
const shortRow = salesDecRows.find((r) => /^Order management/i.test(str(r[0]))) ?? fail('R1_Sales_decisions: thiếu Shortage rule');
const customerPriority = salesDecRows.filter((r) => /^Customer priority$/i.test(str(r[0])) && str(r[2])).sort((a, b) => num(a[1], 'priority') - num(b[1], 'priority')).map((r) => str(r[2]));

// ---------- Kết quả ----------
const mb = table(sheet('R1_Ops_mixing_bottling'), /^Line$/, 'R1_Ops_mixing_bottling');
const L = mb.body[0];
const mixRow = sheet('R1_Ops_mixing_bottling').find((r) => /^Mixer$/i.test(str(r[0]))) ?? fail('R1_Ops_mixing_bottling: thiếu dòng Mixer');

const whRows = sheet('R1_Ops_warehousing');
const wh = table(whRows, /^Inbound\/Outbound$/, 'R1_Ops_warehousing');
const whOf = (re: RegExp) => {
  const r = whRows.find((x) => re.test(str(x[0]))) ?? fail(`R1_Ops_warehousing: thiếu ${re}`);
  const c = wh.c;
  return {
    capacity: num(r[c(/^Capacity/)], 'capacity'), usage: num(r[c(/^Usage/)], 'usage'), utilization: pct(r[c(/Cube/)], 'cube'), overflow: pct(r[c(/^Overflow/)], 'overflow'),
    orderLinesPerWeek: num(r[c(/Order lines/)], 'order lines'), palletsPerWeek: num(r[c(/Pallets\/tanks/)], 'pallets'), hoursPerWeek: num(r[c(/Hours per week/)], 'hours'), flexFte: num(r[c(/Flexible/)], 'flex'),
  };
};
const tankRow = whRows.find((x) => /^Outsourcing tank yard$/i.test(str(x[0]))) ?? fail('thiếu tank yard');
const dayStart = whRows.findIndex((r) => /^days/i.test(str(r[0])));
const days = whRows.slice(dayStart + 1).filter((r) => parseVN(r[0]) !== null && parseVN(r[1]) !== null);
// x = 0 và x = 1 trùng giá trị (biểu đồ 131 điểm cho 130 ngày) → bỏ điểm x = 0
const dayVals = days.filter((r) => num(r[0], 'ngày') >= 1);
if (dayVals.length !== 130) fail(`R1_Ops_warehousing: cần 130 ngày, đọc được ${dayVals.length}`);

const comp = table(sheet('R1_SC_component'), /^Component$/, 'R1_SC_component');
const components = {} as Round1Data['components'];
for (const r of comp.body) {
  const c = comp.c;
  components[compOf(str(r[0]))] = {
    reliability: pct(r[c(/Delivery reliability/)], 'rel'), stockUnits: num(r[c(/^Stock \(pieces/)], 'stock'), stockWeeks: num(r[c(/^Stock \(weeks/)], 'weeks'), stockValue: num(r[c(/^Stock value/)], 'value'),
    demandPerWeek: num(r[c(/Demand per week/)], 'demand'), availability: pct(r[c(/availability/i)], 'avail'), amountPurchased: num(r[c(/Amount purchased/)], 'purchased'), orderSize: num(r[c(/Order size/)], 'order'),
  };
}
const prod = table(sheet('R1_SC_product'), /^Warehouse$/, 'R1_SC_product');
const products = {} as Round1Data['products'];
for (const r of prod.body) {
  const c = prod.c;
  products[skuOf(str(r[c(/^Product$/)]))] = {
    demandPerWeek: num(r[c(/Demand per week/)], 'demand'), slPieces: pct(r[c(/Service level \(pieces/)], 'sl'), slOrderLines: pct(r[c(/Service level \(order/)], 'sl ol'),
    stockWeeks: num(r[c(/^Stock \(weeks/)], 'weeks'), stockValue: num(r[c(/^Stock value/)], 'value'), obsoletes: pct(r[c(/^Obsoletes \(%/)], 'obs'), obsoleteValuePerWeek: num(r[c(/Obsoletes value/)], 'obs value'),
    batches: num(r[c(/Production batches/)], 'batches'), startupLossPerBatch: num(r[c(/Start up/)], 'startup'), rejects: num(r[c(/Rejects/)], 'rejects'), planAdherence: pct(r[c(/plan adherence/i)], 'adh'),
  };
}
const sup = table(sheet('R1_Pur_supplier'), /^Supplier\/Component$/, 'R1_Pur_supplier');
const suppliers = {} as Round1Data['suppliers'];
for (let i = 0; i + 1 < sup.body.length; i += 2) {
  const s = sup.body[i], k = sup.body[i + 1], c = sup.c;
  suppliers[compOf(str(k[0]))] = {
    supplier: str(s[0]), reliability: pct(s[c(/Delivery reliability/)], 'rel'), rejection: pct(s[c(/Rejection/)], 'rej'), deliveries: num(s[c(/^Deliveries/)], 'deliveries'),
    purchaseValue: num(s[c(/Purchase value/)], 'pv'), transportCosts: num(s[c(/Transport costs/)], 'transport'), amountPurchased: num(k[c(/Amount purchased/)], 'amount'),
    pricePaid: num(k[c(/Purchase price/)], 'price'), orderSize: num(k[c(/Order size/)], 'order'),
  };
}
const cust = table(sheet('R1_Sales_customer'), /^Customer$/, 'R1_Sales_customer');
const customers: Round1Data['customers'] = {};
for (const r of cust.body) {
  const c = cust.c;
  customers[str(r[0])] = {
    attainedContractIndex: num(r[c(/Attained contract/)], 'att ci'), slPieces: pct(r[c(/\(pieces\)/)], 'sl p'), slOrderLines: pct(r[c(/\(order lines\)/)], 'sl ol'), slOrders: pct(r[c(/\(orders\)/)], 'sl o'),
    revenue: num(r[c(/^Revenue/)], 'revenue'), palletsPerWeek: num(r[c(/Pallets per week/)], 'pallets'), distributionCost: num(r[c(/Distribution/)], 'dist'),
  };
}
// KPI dashboard: dòng Round = 1 của 4 dashboard
const kpi: Record<string, number> = {};
for (const tab of ['R1_Ops_dashboard', 'R1_SC_dashboard', 'R1_Sales_dashboard', 'R1_Pur_dashboard']) {
  for (const r of sheet(tab)) {
    if (parseVN(r[1]) !== 1 || parseVN(r[2]) === null) continue;
    const label = str(r[0]);
    const v = num(r[2], label);
    kpi[label] = /weeks|Gross margin/i.test(label) ? v : v / 100;
  }
}

const out: Round1Data = {
  meta: { source: 'data/TFC_Round1.xlsx', generatedAt: new Date().toISOString(), sheets: wb.SheetNames },
  finance: { rows, roi: roiRow.r1, realizedRevenue, contracted, penaltyBonus, operatingProfit: rows[opIdx].r1, investment: rows[opIdx + 1].r1, paymentTerms: { r1: payRow.r1, r0: payRow.r0 }, stock: byLabel(/^Stock$/).r1 },
  decisions: {
    ops: {
      rmPalletLocations: num(od(/^Raw materials/i, /pallet locations/i), 'RM pallet'), rmFte: num(od(/^Raw materials/i, /FTE/), 'RM FTE'), intakeDays: num(od(/^Raw materials/i, /Intake/), 'intake'),
      preventiveMaintenance: str(od(/^General/i, /Preventive/)), breakdownTraining: bool(od(/^General/i, /training/i)), bottlingLine: str(od(/^Line/i, /Bottling line/)),
      shifts: num(od(/^Line/i, /shifts/), 'shifts'), smed: bool(od(/^Line/i, /SMED/)), increaseSpeed: bool(od(/^Line/i, /speed/i)),
      fgPalletLocations: num(od(/^Finished/i, /pallet locations/i), 'FG pallet'), fgFte: num(od(/^Finished/i, /FTE/), 'FG FTE'), rmInspection,
    },
    sc: { components: scComponents, frozenPeriodWeeks: num(frozenRow[1], 'frozen'), products: scProducts },
    purchasing,
    sales: { customers: salesCustomers, shortageRule: str(shortRow[2]), customerPriority },
  },
  line: {
    name: str(L[0]), run: num(L[mb.c(/^Run time \(hours/)], 'run'), changeover: num(L[mb.c(/^Changeover time \(hours/)], 'co'), breakdown: num(L[mb.c(/^Breakdown time \(hours/)], 'bd'),
    unused: num(L[mb.c(/^Unused capacity \(hours/)], 'unused'), overtime: num(L[mb.c(/^Overtime \(hours/)], 'ot'), startupLossEur: num(L[mb.c(/Start up/)], 'startup'), planAdherence: pct(L[mb.c(/plan adherence/i)], 'adh'),
  },
  mixer: { cleaningShare: pct(mixRow[1], 'cleaning'), avgLotL: num(mixRow[2], 'lot') },
  warehouse: {
    rm: whOf(/^Raw materials warehouse$/i), fg: whOf(/^Finished goods warehouse$/i), tankDaysPerWeek: num(tankRow[wh.c(/tank-days/)], 'tank-days'),
    dailyHours: { rm: dayVals.map((r) => num(r[1], 'giờ NL')), fg: dayVals.map((r) => num(r[2], 'giờ TP')) },
  },
  components, products, suppliers, customers, kpi,
};
for (const [k, v] of [['NL', Object.keys(components).length], ['SKU', Object.keys(products).length], ['NCC', Object.keys(suppliers).length], ['khách', Object.keys(customers).length]] as const) {
  if (v !== (k === 'SKU' ? 6 : k === 'khách' ? 3 : 5)) fail(`đọc được ${v} ${k}`);
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`✔ Đã ghi ${OUT} · ROI R1 = ${(out.finance.roi * 100).toFixed(2)}% · OP ${out.finance.operatingProfit} · Investment ${out.finance.investment}`);
