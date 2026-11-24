/**
 * Đọc data/TFC_Round0.xlsx → sinh src/data/round0.json
 *
 * Nguyên tắc:
 *  - Tìm tab theo tên (chấp nhận biến thể, vd tab luật "8_Luật game" hoặc "Luật for ops…").
 *  - Tìm bảng theo DÒNG TIÊU ĐỀ CỘT (không hard-code tọa độ ô). Bảng kết thúc ở dòng trống.
 *  - Bảng dạng "Thông số | Giá trị" thì tra theo nhãn (khớp một phần, không phân biệt hoa thường).
 *  - Số dạng chuỗi kiểu Việt Nam ("17.280", "0,95", "93,4%") được chuyển đúng.
 *  - Thiếu bảng/cột → dừng với thông báo rõ ràng (không đoán).
 *
 * Chạy: npm run data
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseVN } from './lib/parse';
import type {
  Round0Data, SkuKey, ComponentKey, Product, Component, SupplierTerms, SupplierResult, Mixer, BottlingLine,
  OpsDecisionsR0, OpsResultsR0, FinanceLine, DailyRow, Quality,
} from '../src/data/types';

// SheetJS bản CJS có sẵn readFile (bản ESM thì không)
const XLSX: typeof import('xlsx') = createRequire(import.meta.url)('xlsx');

const SRC = resolve('data/TFC_Round0.xlsx');
const OUT = resolve('src/data/round0.json');

type Cell = string | number | boolean | null;
type Rows = Cell[][];

// ---------- tiện ích chung ----------
const norm = (s: unknown) => String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Lấy số đầu tiên trong chuỗi mô tả, vd "17.280 cái/pallet" → 17280 */
function numIn(text: string, re: RegExp): number | null {
  const m = text.match(re);
  return m ? parseVN(m[1]) : null;
}

function fail(msg: string): never {
  console.error(`\n✖ build-data: ${msg}\n`);
  process.exit(1);
}

const wb = XLSX.readFile(SRC);
const sheetNames = wb.SheetNames;

function sheet(label: string, ...patterns: RegExp[]): Rows {
  const name = sheetNames.find((n) => patterns.some((p) => p.test(n.normalize('NFC'))));
  if (!name) fail(`Không tìm thấy tab "${label}". Các tab hiện có: ${sheetNames.join(', ')}`);
  return XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
}

class Table {
  constructor(public title: string, public headers: string[], public rows: Cell[][]) {}
  col(pattern: RegExp | string, required = true): number {
    const i = this.headers.findIndex((h) => (typeof pattern === 'string' ? norm(h) === norm(pattern) : pattern.test(h)));
    if (i < 0 && required) fail(`Bảng "${this.title}": thiếu cột ${pattern}. Cột hiện có: ${this.headers.join(' | ')}`);
    return i;
  }
  str(r: Cell[], pattern: RegExp | string): string {
    const i = this.col(pattern);
    return r[i] === null || r[i] === undefined ? '' : String(r[i]).trim();
  }
  num(r: Cell[], pattern: RegExp | string): number {
    const n = parseVN(r[this.col(pattern)]);
    if (n === null) fail(`Bảng "${this.title}": ô cột ${pattern} dòng "${r[0]}" không phải số (${r[this.col(pattern)]})`);
    return n;
  }
  numOpt(r: Cell[], pattern: RegExp | string): number | null {
    const i = this.col(pattern, false);
    return i < 0 ? null : parseVN(r[i]);
  }
  /** Bảng key-value: tìm dòng có cột `keyCol` khớp `label` */
  find(keyCol: RegExp | string, label: RegExp): Cell[] {
    const i = this.col(keyCol);
    const r = this.rows.find((row) => label.test(String(row[i] ?? '').normalize('NFC')));
    if (!r) fail(`Bảng "${this.title}": không có dòng ${label}`);
    return r;
  }
}

/**
 * Tìm bảng: dòng tiêu đề phải chứa TẤT CẢ các tiêu đề `required` (regex trên từng ô).
 * `nth` để chọn bảng thứ n nếu nhiều bảng cùng bộ tiêu đề.
 * Dữ liệu chạy đến dòng trống đầu tiên; bỏ dòng TỔNG.
 */
function table(rows: Rows, title: string, required: RegExp[], nth = 0): Table {
  let found = -1;
  for (let i = 0, k = 0; i < rows.length; i++) {
    const cells = (rows[i] ?? []).map((c) => (c === null ? '' : String(c).normalize('NFC').trim()));
    if (required.every((re) => cells.some((c) => re.test(c)))) {
      if (k === nth) { found = i; break; }
      k++;
    }
  }
  if (found < 0) fail(`Không tìm thấy bảng "${title}" (cần tiêu đề: ${required.map(String).join(', ')})`);
  const headers = (rows[found] ?? []).map((c) => (c === null ? '' : String(c).normalize('NFC').trim()));
  const data: Cell[][] = [];
  for (let i = found + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.every((c) => c === null || c === '')) break;
    if (/^tổng$/i.test(String(r[0] ?? '').normalize('NFC').trim())) continue;
    data.push(r);
  }
  return new Table(title, headers, data);
}

// ---------- chuẩn hóa tên SKU / component ----------
function skuKey(name: string): SkuKey {
  const s = norm(name);
  const flavor = s.includes('c-power') ? 'C-power' : s.includes('mango') ? 'Mango' : 'Orange';
  const size = s.includes('pet') ? 'PET' : '1L';
  return `${flavor} ${size}` as SkuKey;
}
function compKey(name: string): ComponentKey {
  const s = norm(name);
  if (s.includes('pack')) return 'Pack';
  if (s.includes('pet')) return 'PET';
  if (s.includes('orange')) return 'Orange';
  if (s.includes('mango')) return 'Mango';
  if (s.includes('vitamin')) return 'Vitamin C';
  fail(`Không nhận ra nguyên liệu "${name}"`);
}
const COMPONENTS: ComponentKey[] = ['Pack', 'PET', 'Orange', 'Mango', 'Vitamin C'];
const yes = (v: string) => /^(có|co|yes|true|x|đang dùng)/i.test(v.trim());

// ================= 1_Vấn đề R0 =================
const issuesRows = sheet('1_Vấn đề R0', /^1_/);
const tIssues = table(issuesRows, 'Vấn đề R0', [/^#$/, /^Vấn đề$/, /^Bằng chứng/]);
const issues = tIssues.rows
  .filter((r) => parseVN(r[tIssues.col(/^#$/)]) !== null)
  .map((r) => ({
    no: tIssues.num(r, /^#$/),
    issue: tIssues.str(r, /^Vấn đề$/),
    evidence: tIssues.str(r, /^Bằng chứng/),
    owner: tIssues.str(r, /^Phòng chính/),
    opsLink: tIssues.str(r, /Ops/) || null,
  }));

// ================= 2_Finance =================
const finRows = sheet('2_Finance', /^2_/);
const tFin = table(finRows, 'P&L', [/^Nhóm$/, /^Dòng$/, /Round 0/]);
const finLines: FinanceLine[] = tFin.rows
  .filter((r) => parseVN(r[tFin.col(/Round 0/)]) !== null)
  .map((r) => ({ group: tFin.str(r, /^Nhóm$/), label: tFin.str(r, /^Dòng$/), value: tFin.num(r, /Round 0/), note: tFin.str(r, /Ghi chú/) || null }));
// Dòng TỔNG bị bỏ khỏi `rows`, nên đọc lại theo nhãn trên toàn bộ vùng bảng
const finAll = (label: RegExp): number => {
  const iL = tFin.col(/^Dòng$/), iV = tFin.col(/Round 0/);
  const r = finRows.find((row) => label.test(String(row?.[iL] ?? '').normalize('NFC')));
  const v = r ? parseVN(r[iV]) : null;
  if (v === null) fail(`2_Finance: thiếu dòng ${label}`);
  return v;
};
const financeTotals = {
  roi: finAll(/^ROI$/),
  realizedRevenue: finAll(/^Realized revenue$/i),
  purchaseValue: finAll(/^Purchase value$/i),
  productionCosts: finAll(/^Production costs$/i),
  cogs: finAll(/^Cost of goods sold/i),
  grossMargin: finAll(/^Gross margin$/i),
  indirectCost: finAll(/^Indirect cost$/i),
  operatingProfit: finAll(/^Operating profit$/i),
  investment: finAll(/^Investment$/i),
};
const finDetail = finLines.filter((l) => !/^(TỔNG|Tổng|Tổng phụ)$/i.test(l.group));

// ================= 3_Sản phẩm =================
const prodRows = sheet('3_Sản phẩm', /^3_/);
const tProd = table(prodRows, 'Sản phẩm', [/^SKU$/, /^Bao bì$/, /Lít\/đơn vị/, /Đv\/pallet/]);
const products: Product[] = tProd.rows.map((r) => {
  const name = tProd.str(r, /^SKU$/);
  const packaging = /pet/i.test(tProd.str(r, /^Bao bì$/)) ? 'PET' : 'Pack';
  const packQty = tProd.num(r, /BOM: Pack/);
  return {
    key: skuKey(name),
    name,
    packaging,
    litersPerUnit: tProd.num(r, /Lít\/đơn vị/),
    unitsPerCase: tProd.num(r, /Đv\/thùng/),
    unitsPerLayer: tProd.num(r, /Đv\/layer/),
    unitsPerPallet: tProd.num(r, /Đv\/pallet/),
    basePrice: tProd.num(r, /Giá cơ bản/),
    bom: {
      Pack: packaging === 'Pack' ? packQty : 0,
      PET: packaging === 'PET' ? packQty : 0,
      Orange: tProd.num(r, /BOM: Orange/),
      'Vitamin C': tProd.num(r, /BOM: Vitamin C/),
      Mango: tProd.num(r, /BOM: Mango/),
    },
    demandPerWeek: tProd.num(r, /Nhu cầu\/tuần/),
  };
});
const tComp = table(prodRows, 'Nguyên liệu', [/^Component$/, /^Đơn vị$/, /Quy cách/]);
const components: Component[] = tComp.rows.map((r) => {
  const spec = tComp.str(r, /Quy cách/);
  const isLiquid = /drum|ibc|tank/i.test(spec);
  return {
    key: compKey(tComp.str(r, /^Component$/)),
    name: tComp.str(r, /^Component$/),
    unit: tComp.str(r, /^Đơn vị$/),
    basePrice: tComp.num(r, /Giá cơ bản/),
    spec,
    unitsPerPallet: isLiquid ? null : numIn(spec, /([\d.,]+)\s*cái\/pallet/i),
    unitsPerLayer: isLiquid ? null : numIn(spec, /([\d.,]+)\s*cái\/layer/i),
    liquidUnits: isLiquid
      ? {
          drum: numIn(spec, /drum\s*([\d.,]+)/i) ?? fail(`Không đọc được lít/drum trong "${spec}"`),
          ibc: numIn(spec, /ibc\s*([\d.,]+)/i) ?? fail(`Không đọc được lít/IBC trong "${spec}"`),
          tank: numIn(spec, /tank\s*([\d.,]+)/i) ?? fail(`Không đọc được lít/tank trong "${spec}"`),
        }
      : null,
    shelfLifeWeeks: tComp.numOpt(r, /Hạn dùng/),
  };
});
for (const c of components) if (!c.liquidUnits && !c.unitsPerPallet) fail(`Thiếu quy cách pallet cho ${c.name}`);

// ================= 4_Purchasing =================
const purRows = sheet('4_Purchasing', /^4_/);
function supplierTerms(t: Table, r: Cell[], inUse: boolean): SupplierTerms {
  return {
    component: compKey(t.str(r, /^Component$/)),
    supplier: t.str(r, /^Nhà cung cấp$/),
    inUse,
    contractIndex: t.num(r, /Contract index/),
    quality: t.str(r, /^Quality$/) as Quality,
    leadTimeDays: t.num(r, /Lead time/),
    certified: yes(t.str(r, /Certification/)),
    country: t.str(r, /Quốc gia/),
    transport: t.str(r, /Vận chuyển/),
    freeCapacity: t.num(r, /Free capacity/),
    paymentTermWeeks: t.num(r, /Payment term/),
    tradeUnit: t.str(r, /Trade unit/),
    agreedReliability: t.num(r, /Agreed delivery reliability/),
    deliveryWindow: t.str(r, /Delivery window/),
  };
}
const tContracts = table(purRows, 'Hợp đồng NCC hiện tại', [/^Component$/, /^Nhà cung cấp$/, /Contract index/, /Trade unit/]);
const contracts = tContracts.rows.map((r) => supplierTerms(tContracts, r, true));
const tMarket = table(purRows, 'Thị trường NCC', [/^Component$/, /^Nhà cung cấp$/, /^Đang dùng$/, /Contract index/]);
const market = tMarket.rows.map((r) => supplierTerms(tMarket, r, yes(tMarket.str(r, /^Đang dùng$/))));
const tSupRes = table(purRows, 'Kết quả NCC R0', [/^Nhà cung cấp$/, /Reliability thực tế$/, /^Rejection$/, /Purchase value/]);
const supplierResults: SupplierResult[] = tSupRes.rows.map((r) => {
  const supplier = tSupRes.str(r, /^Nhà cung cấp$/);
  const c = contracts.find((k) => k.supplier === supplier);
  if (!c) fail(`Kết quả NCC: "${supplier}" không có trong hợp đồng hiện tại`);
  return {
    supplier,
    component: c.component,
    reliability: tSupRes.num(r, /Reliability thực tế$/),
    rejection: tSupRes.num(r, /^Rejection$/),
    purchaseValue: tSupRes.num(r, /Purchase value/),
    transportCost: tSupRes.num(r, /Transport cost/),
    demandPerWeek: tSupRes.num(r, /Nhu cầu\/tuần/),
    pricePaid: tSupRes.num(r, /Giá thực trả/),
    orderSize: tSupRes.num(r, /Cỡ đơn hàng/),
    // Cột mới (bản 25/11). Tiêu đề ghi "/tuần" nhưng giá trị (5,7…) trùng "Deliveries/round" ở tab 10 → lưu nguyên số, ghi chú ở ASSUMPTIONS
    deliveriesCol: tSupRes.numOpt(r, /Số lần giao/),
    orderLinesCol: tSupRes.numOpt(r, /^Order lines/),
    purchasedInRound: tSupRes.numOpt(r, /Đã mua trong round/),
  };
});

// Thông số chi tiết 23 NCC (popup Specifications) — chỉ có ở bản mới. Ô dạng "Truck 10 · Boat 25" tách theo phương tiện.
const byTransport = (v: unknown, modes: string[]): Record<string, number> | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseVN(v);
  if (n !== null) return Object.fromEntries(modes.map((m) => [m, n]));
  const out: Record<string, number> = {};
  for (const part of String(v).split(/[·|,;]/)) {
    const m = part.trim().match(/^(Truck|Boat)\s+([\d.,]+)$/i);
    if (!m) fail(`4_Purchasing thông số NCC: không đọc được "${v}"`);
    out[m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()] = parseVN(m[2]) ?? fail(`số lỗi trong "${v}"`);
  }
  return out;
};
const hasSpecs = purRows.some((r) => (r ?? []).some((c) => /^Basic contract index$/.test(String(c ?? '').trim())));
const supplierSpecs = hasSpecs ? (() => {
  const t = table(purRows, 'Thông số chi tiết NCC', [/^Component$/, /^Nhà cung cấp$/, /^Basic contract index$/, /Phí mỗi chuyến/]);
  return t.rows.map((r) => {
    const modes = t.str(r, /^Vận chuyển$/).split('/').map((x) => x.trim()).filter(Boolean);
    return {
      component: compKey(t.str(r, /^Component$/)),
      supplier: t.str(r, /^Nhà cung cấp$/),
      inUse: yes(t.str(r, /^Đang dùng$/)),
      basicContractIndex: t.num(r, /^Basic contract index$/),
      marketContractIndex: t.num(r, /^Contract index \(thị trường/),
      basePrice: t.num(r, /^Giá cơ bản/),
      transportModes: modes,
      leadTimeDays: byTransport(r[t.col(/^Lead time/)], modes) ?? fail(`Thiếu lead time NCC ${t.str(r, /^Nhà cung cấp$/)}`),
      costPerShipment: byTransport(r[t.col(/Phí mỗi chuyến/)], modes) ?? fail('Thiếu phí mỗi chuyến'),
      costPerSmallUnit: byTransport(r[t.col(/Pallet-Drum-IBC/)], modes) ?? fail('Thiếu phí vận chuyển / pallet-drum-IBC'),
      costPerFull: byTransport(r[t.col(/FTL-Tank/)], modes) ?? fail('Thiếu phí vận chuyển / FTL-tank'),
      freeCapacityExclTfc: t.num(r, /Free capacity \(không tính/),
      freeCapacityInclTfc: t.num(r, /Free capacity \(tính cả/),
      startPaymentTerm: t.str(r, /Start payment term/),
      worldShare: t.num(r, /Thị phần thế giới/),
      certified: yes(t.str(r, /^Certification$/)),
    };
  });
})() : [];
const hasNeg = purRows.some((r) => (r ?? []).some((c) => /^Trade unit chọn được$/.test(String(c ?? '').trim())));
const negotiationOptions = hasNeg ? (() => {
  const t = table(purRows, 'Lựa chọn khi đàm phán', [/^Component$/, /^Trade unit chọn được$/]);
  // Bỏ dòng ghi chú cuối bảng ("Đọc nhanh"…): chỉ giữ dòng có tên nguyên liệu
  return t.rows.filter((r) => /pack|pet|orange|mango|vitamin/i.test(String(r[0] ?? ''))).map((r) => ({
    component: compKey(t.str(r, /^Component$/)),
    tradeUnits: t.str(r, /^Trade unit chọn được$/).split('/').map((x) => x.trim()).filter(Boolean),
    qualities: t.str(r, /^Quality$/).split('/').map((x) => x.trim()).filter(Boolean),
    deliveryWindows: t.str(r, /^Delivery window$/).split('/').map((x) => x.trim()).filter(Boolean),
    paymentTerm: t.str(r, /^Payment term/),
    reliability: t.str(r, /reliability/i),
    transport: t.str(r, /^Vận chuyển$/),
  }));
})() : [];
const contractTransportChoice = Object.fromEntries(tContracts.rows.map((r) => [compKey(tContracts.str(r, /^Component$/)), tContracts.col(/Vận chuyển chọn được/, false) >= 0 ? tContracts.str(r, /Vận chuyển chọn được/) : null]));

// ================= 5_Operations =================
const opsRows = sheet('5_Operations', /^5_/);
const tDec = table(opsRows, 'Quyết định Ops', [/^Khu vực$/, /^Thông số$/, /^Giá trị$/]);
const dv = (label: RegExp) => tDec.find(/^Thông số$/, label)[tDec.col(/^Giá trị$/)];
const dnum = (label: RegExp) => parseVN(dv(label)) ?? fail(`Quyết định Ops ${label} không phải số`);
const dstr = (label: RegExp) => String(dv(label) ?? '').trim();
const inspectionText = dstr(/inspection/i);
const inspAllOff = /tắt|off|no|không/i.test(inspectionText);
const pm = dstr(/Preventive maintenance/i);
const opsDecisions: OpsDecisionsR0 = {
  rmInspection: Object.fromEntries(COMPONENTS.map((c) => [c, !inspAllOff])) as Record<ComponentKey, boolean>,
  rmPalletLocations: dnum(/Pallet locations kho NL/i),
  rmFte: dnum(/cố định kho NL/i),
  intakeDays: dnum(/Intake time/i),
  mixer: dstr(/^Máy trộn$/i),
  preventiveMaintenance: (/minimal/i.test(pm) ? 'Minimal' : /extensive/i.test(pm) ? 'Extensive' : 'None'),
  breakdownTraining: yes(dstr(/training/i)),
  bottlingLine: dstr(/^Dây chuyền$/i),
  shifts: dnum(/^Số ca$/i),
  smed: yes(dstr(/SMED/i)),
  increaseSpeed: yes(dstr(/Increase speed/i)),
  fgPalletLocations: dnum(/Pallet locations kho TP/i),
  fgFte: dnum(/cố định kho TP/i),
};
if (!inspAllOff && !/bật|on|có/i.test(inspectionText)) fail(`Không hiểu giá trị RM inspection: "${inspectionText}"`);

const tRes = table(opsRows, 'Kết quả Ops R0', [/^Khu vực$/, /^Chỉ số$/, /^Giá trị$/]);
const rv = (area: RegExp, metric: RegExp): number => {
  const iA = tRes.col(/^Khu vực$/), iM = tRes.col(/^Chỉ số$/), iV = tRes.col(/^Giá trị$/);
  const r = tRes.rows.find((row) => area.test(String(row[iA] ?? '')) && metric.test(String(row[iM] ?? '')));
  const v = r ? parseVN(r[iV]) : null;
  if (v === null) fail(`Kết quả Ops R0: thiếu ${area} / ${metric}`);
  return v;
};
const rvOpt = (area: RegExp, metric: RegExp): number | null => {
  const iA = tRes.col(/^Khu vực$/), iM = tRes.col(/^Chỉ số$/), iV = tRes.col(/^Giá trị$/);
  const r = tRes.rows.find((row) => area.test(String(row[iA] ?? '')) && metric.test(String(row[iM] ?? '')));
  return r ? parseVN(r[iV]) : null;
};

const tMix = table(opsRows, 'Máy trộn', [/^Máy$/, /Mẻ tối thiểu/, /Mẻ tối đa/]);
const mixers: Mixer[] = tMix.rows.map((r) => ({
  name: tMix.str(r, /^Máy$/),
  inUse: yes(tMix.str(r, /^Đang dùng$/)),
  minBatchL: tMix.num(r, /Mẻ tối thiểu/),
  maxBatchL: tMix.num(r, /Mẻ tối đa/),
  annualFee: tMix.num(r, /Phí\/năm/),
  costPerRunHour: tMix.num(r, /Phí\/giờ/),
  investment: tMix.num(r, /Đầu tư/),
  mixHoursPerBatch: tMix.num(r, /Trộn\/mẻ/),
  cleanHours: tMix.num(r, /Vệ sinh/),
}));
const tLine = table(opsRows, 'Dây chuyền', [/^Dây chuyền$/, /Tốc độ/, /Formula changeover/]);
const lines: BottlingLine[] = tLine.rows.map((r) => ({
  name: tLine.str(r, /^Dây chuyền$/),
  inUse: yes(tLine.str(r, /^Đang dùng$/)),
  speedLph: tLine.num(r, /Tốc độ/),
  workersPerShift: tLine.num(r, /Công nhân\/ca/),
  annualFee: tLine.num(r, /Phí\/năm/),
  investment: tLine.num(r, /Đầu tư/),
  formulaChangeoverH: tLine.num(r, /Formula changeover/),
  sizeChangeoverH: tLine.num(r, /Size changeover/),
  tolerance: tLine.str(r, /Tolerance/),
  startupLoss: tLine.num(r, /Start-up loss/),
}));
const tNorm = table(opsRows, 'Định mức', [/^Khu vực$/, /^Công việc$/, /^Định mức$/]);
const norms = tNorm.rows.map((r) => ({ area: tNorm.str(r, /^Khu vực$/), task: tNorm.str(r, /^Công việc$/), norm: tNorm.str(r, /^Định mức$/) }));

// Bảng Analysis có thêm tank yard, breakdown 11,0 …
const anRows = sheet('10_R0 Analysis', /^10_/);
const tWh = table(anRows, 'Warehouse', [/^Warehouse$/, /^Capacity$/, /^Usage$/, /Cube utilization/]);
const whRow = (re: RegExp) => tWh.find(/^Warehouse$/, re);
const tankRow = whRow(/tank yard/i);
const tBot = table(anRows, 'Bottling line', [/^Bottling line$/, /^Run time/, /^Changeover/]);
const botR = tBot.rows[0];

const lineName = opsDecisions.bottlingLine;
const mixerName = opsDecisions.mixer;
const opsResults: OpsResultsR0 = {
  rm: {
    capacity: rv(/Kho NL/, /Capacity/),
    usage: rv(/Kho NL/, /Usage/),
    utilization: rv(/Kho NL/, /Utilization/),
    overflow: rv(/Kho NL/, /^Overflow/),
    orderLinesPerWeek: rv(/Kho NL/, /Order lines/),
    palletsPerWeek: rv(/Kho NL/, /Pallet nhận/),
    hoursPerWeek: rv(/Kho NL/, /Giờ công cần/),
    flexFte: rv(/Kho NL/, /Thời vụ/),
  },
  tankYard: {
    tankDaysPerWeek: rv(/Tank yard/, /Tank-days/),
    capacity: parseVN(tankRow[tWh.col(/^Capacity$/)]),
    usage: parseVN(tankRow[tWh.col(/^Usage$/)]),
    tanksPerWeek: parseVN(tankRow[tWh.col(/Pallets hoặc tanks/)]),
  },
  fg: {
    capacity: rv(/Kho TP/, /Capacity/),
    usage: rv(/Kho TP/, /Usage/),
    utilization: rv(/Kho TP/, /Utilization/),
    overflow: rv(/Kho TP/, /^Overflow/),
    orderLinesPerWeek: rv(/Kho TP/, /Order lines/),
    palletsPerWeek: rv(/Kho TP/, /Pallet\/tuần/),
    hoursPerWeek: rv(/Kho TP/, /Giờ công cần/),
    flexFte: rv(/Kho TP/, /Thời vụ/),
  },
  line: {
    name: lineName,
    run: rv(new RegExp(lineName), /Run time/),
    changeover: rv(new RegExp(lineName), /Changeover/),
    breakdown: rv(new RegExp(lineName), /Breakdown/),
    unused: rv(new RegExp(lineName), /Unused/),
    overtime: rv(new RegExp(lineName), /Overtime/),
    planAdherence: rv(new RegExp(lineName), /plan adherence/i),
    startupLossEur: rv(new RegExp(lineName), /Start-up/),
    outsourcedH: parseVN(botR[tBot.col(/^Outsourced \(giờ\)/)]) ?? 0,
  },
  mixer: {
    name: mixerName,
    cleaningShare: rv(new RegExp(mixerName), /Cleaning/),
    avgLotL: rv(new RegExp(mixerName), /Lô trung bình/),
  },
};
void rvOpt;

// ================= 6_Sales =================
const salesRows = sheet('6_Sales', /^6_/);
const tCC = table(salesRows, 'Hợp đồng KH', [/^Khách hàng$/, /Số cửa hàng/, /Service level hứa/]);
const customerContracts = tCC.rows.map((r) => ({
  customer: tCC.str(r, /^Khách hàng$/),
  stores: tCC.num(r, /Số cửa hàng/),
  marketShare: tCC.num(r, /Thị phần/),
  valueForMoney: yes(tCC.str(r, /Value for money/)),
  contractIndex: tCC.num(r, /Contract index/),
  serviceLevelType: tCC.str(r, /Service level type/),
  serviceLevel: tCC.num(r, /Service level hứa/),
  shelfLife: tCC.num(r, /Shelf life/),
  orderDeadline: (() => { const v = r[tCC.col(/Order deadline/)]; return typeof v === 'number' ? `${Math.round(v * 24)}:00` : String(v ?? ''); })(),
  tradeUnit: tCC.str(r, /Trade unit/),
  paymentTermWeeks: tCC.num(r, /Payment term/),
  promotionalPressure: tCC.str(r, /Promotional pressure/),
  promotionHorizon: tCC.str(r, /Promotion horizon/),
  skus: tCC.str(r, /SKU mua/),
}));
const tCR = table(salesRows, 'Kết quả theo KH', [/^Khách hàng$/, /Attained contract index/, /^Revenue/]);
const customerResults = tCR.rows.map((r) => ({
  customer: tCR.str(r, /^Khách hàng$/),
  attainedContractIndex: tCR.num(r, /Attained contract index/),
  slPieces: tCR.num(r, /SL pieces/),
  slOrderLines: tCR.num(r, /SL order lines/),
  slOrders: tCR.num(r, /SL orders/),
  osa: tCR.num(r, /On-shelf/),
  revenue: tCR.num(r, /^Revenue/),
  grossMarginPerWeek: tCR.num(r, /Gross margin/),
  shipmentsPerWeek: tCR.num(r, /Shipments/),
  orderLinesPerWeek: tCR.num(r, /Order lines/),
  palletsPerWeek: tCR.num(r, /Pallet\/tuần/),
  daysInWarehouse: tCR.num(r, /Days in warehouse/),
  attainedShelfLife: tCR.num(r, /Attained shelf life/),
  distributionCost: tCR.num(r, /Distribution cost/),
}));
const tPR = table(salesRows, 'Kết quả theo SP', [/^SKU$/, /Giá bán TB/, /Gross margin\/đv/]);
const productResults = tPR.rows.map((r) => ({
  sku: skuKey(tPR.str(r, /^SKU$/)),
  demandPerWeek: tPR.num(r, /Nhu cầu\/tuần/),
  demandValuePerWeek: tPR.num(r, /Giá trị nhu cầu/),
  avgPrice: tPR.num(r, /Giá bán TB/),
  gmPerUnit: tPR.num(r, /Gross margin\/đv/),
  slPieces: tPR.num(r, /SL pieces/),
  slOrderLines: tPR.num(r, /SL order lines/),
  osa: tPR.num(r, /On-shelf/),
  orderLinesPerWeek: tPR.num(r, /Order lines/),
  obsolete: tPR.num(r, /^Obsolete$/),
  obsoletePerWeekEur: tPR.num(r, /Obsolete\/tuần/),
}));
const tCP = table(salesRows, 'KH × SP', [/^Khách hàng$/, /^SKU$/, /Giá bán/, /khuyến mãi/]);
const customerProduct = tCP.rows.map((r) => ({
  customer: tCP.str(r, /^Khách hàng$/),
  sku: skuKey(tCP.str(r, /^SKU$/)),
  demandPerWeek: tCP.num(r, /Nhu cầu\/tuần/),
  price: tCP.num(r, /Giá bán/),
  attainedShelfLife: tCP.num(r, /Attained shelf life/),
  slPieces: tCP.num(r, /SL pieces/),
  slOrderLines: tCP.num(r, /SL order lines/),
  osa: tCP.num(r, /On-shelf/),
  promoUplift: tCP.num(r, /khuyến mãi/),
}));
const salesNotes = salesRows
  .filter((r) => r && /order management/i.test(String(r[0] ?? '')))
  .map((r) => String(r[1] ?? ''));

// ================= 7_Supply Chain =================
const scRows = sheet('7_Supply Chain', /^7_/);
const tSCc = table(scRows, 'Quyết định NL', [/^Component$/, /^Safety stock/, /^Lot size/]);
const scComponents = tSCc.rows.map((r) => ({
  component: compKey(tSCc.str(r, /^Component$/)),
  safetyStockWeeks: tSCc.num(r, /^Safety stock/),
  lotSizeWeeks: tSCc.num(r, /^Lot size/),
}));
const tSCp = table(scRows, 'Quyết định TP', [/^SKU$/, /Production interval/, /^Safety stock/]);
const scProducts = tSCp.rows.map((r) => ({
  sku: skuKey(tSCp.str(r, /^SKU$/)),
  productionIntervalDays: tSCp.num(r, /Production interval/),
  safetyStockWeeks: tSCp.num(r, /^Safety stock/),
}));
const tPlan = table(scRows, 'Lập kế hoạch', [/^Thông số$/, /^Giá trị$/]);
const frozen = parseVN(tPlan.find(/^Thông số$/, /Frozen period/i)[tPlan.col(/^Giá trị$/)]) ?? fail('Thiếu frozen period');
// Tiêu đề tab 7 có 2 kiểu: bản cũ tiếng Việt, bản mới tên gốc tiếng Anh của game → nhận cả hai.
const tCS = table(scRows, 'Tồn kho NL', [/^Component$/, /^(Reliability NCC|Delivery reliability)/, /^(Tồn|Stock) \((tuần|weeks)\)$/]);
const componentStock = tCS.rows.map((r) => ({
  component: compKey(tCS.str(r, /^Component$/)),
  supplierReliability: tCS.num(r, /^(Reliability NCC|Delivery reliability)/),
  stockUnits: tCS.num(r, /^(Tồn \(cái hoặc L\)|Stock \(pieces)/),
  stockWeeks: tCS.num(r, /^(Tồn|Stock) \((tuần|weeks)\)$/),
  stockValue: tCS.num(r, /^(Giá trị tồn|Stock value)/),
  economicWeeks: tCS.num(r, /Economic inventory/),
  demandPerWeek: tCS.num(r, /^(Nhu cầu\/tuần|Demand per week)/),
  availability: tCS.num(r, /^(Availability|Component availability)/),
  purchasedInRound: tCS.num(r, /^(Đã mua|Amount purchased)/),
  orderSize: tCS.num(r, /^(Cỡ đơn hàng|Order size)/),
  obsoletes: tCS.numOpt(r, /^Obsoletes/),
  bias: tCS.numOpt(r, /^Bias$/),
}));
const tPS = table(scRows, 'Tồn kho TP', [/^(SKU|Product)$/, /^(SL pieces|Service level \(pieces\))/, /^(Tồn|Stock) \((tuần|weeks)\)$/, /plan adherence/i]);
const productStock = tPS.rows.map((r) => ({
  sku: skuKey(tPS.str(r, /^(SKU|Product)$/)),
  slPieces: tPS.num(r, /^(SL pieces|Service level \(pieces\))/),
  slOrderLines: tPS.num(r, /^(SL order lines|Service level \(order lines\))/),
  stockWeeks: tPS.num(r, /^(Tồn|Stock) \((tuần|weeks)\)$/),
  stockValue: tPS.num(r, /^(Giá trị tồn|Stock value)/),
  obsolete: tPS.num(r, /^Obsolete(s)?( \(%\))?$/),
  mape: tPS.num(r, /MAPE/),
  batches: tPS.num(r, /^(Số mẻ|Production batches)/),
  // Game ghi "per batch" nhưng 6 SKU cộng lại = 8.434 ≈ tổng start-up loss cả round → là TỔNG/SKU
  startupLossEur: tPS.num(r, /(Start-up loss|Start up productivity loss)/i),
  planAdherence: tPS.num(r, /plan adherence/i),
  demandPerWeek: tPS.numOpt(r, /^Demand per week/),
  floatingStockValue: tPS.numOpt(r, /^Floating Stock value/),
  obsoleteValuePerWeek: tPS.numOpt(r, /^(Obsolete\/tuần|Obsoletes value per week)/),
  bias: tPS.numOpt(r, /^Bias$/),
  rejectsEur: tPS.numOpt(r, /^Rejects/),
}));
// Dashboard SC (R-2 / R-1 / R0) — chỉ có ở bản mới
const dashTable = (() => {
  const found = scRows.some((r) => (r ?? []).some((c) => /^Round -2$/.test(String(c ?? ''))));
  if (!found) return [] as { kpi: string; rMinus2: number | null; rMinus1: number | null; r0: number | null; comment: string | null }[];
  const t = table(scRows, 'Dashboard SC', [/^KPI$/, /^Round -2$/, /^Round 0$/]);
  return t.rows.map((r) => ({ kpi: t.str(r, /^KPI$/), rMinus2: t.numOpt(r, /^Round -2$/), rMinus1: t.numOpt(r, /^Round -1$/), r0: t.numOpt(r, /^Round 0$/), comment: t.str(r, /Nhận xét/) || null }));
})();
const tChk = table(scRows, 'Kiểm tra', [/^Mục$/, /Giá trị \(€\)/]);
const totalStockValue = parseVN(tChk.find(/^Mục$/, /Tổng giá trị tồn/i)[tChk.col(/Giá trị \(€\)/)]) ?? fail('Thiếu tổng giá trị tồn');

// ================= 10_R0 Analysis (phần chưa có ở tab khác) =================
const tAC = table(anRows, 'Component (Analysis)', [/^Component$/, /Order lines\/round/, /^Obsoletes$/]);
const anComponents = tAC.rows.map((r) => ({
  component: compKey(tAC.str(r, /^Component$/)),
  orderLinesPerRound: tAC.num(r, /Order lines\/round/),
  obsoletes: tAC.num(r, /^Obsoletes$/),
}));
const tAP = table(anRows, 'Product (Analysis)', [/^Product$/, /Rejects/, /GM\/week/]);
const anProducts = tAP.rows.map((r) => ({ sku: skuKey(tAP.str(r, /^Product$/)), rejectsEur: tAP.num(r, /Rejects/), gmPerWeek: tAP.num(r, /GM\/week/) }));
const tDist = table(anRows, 'Distributor', [/^Distributor$/, /Distribution costs/]);
const dr = tDist.rows[0];
const distributor = dr
  ? {
      name: tDist.str(dr, /^Distributor$/),
      cost: tDist.num(dr, /Distribution costs/),
      serviceLevel: tDist.num(dr, /Service level/),
      smallPallets: tDist.num(dr, /small/),
      mediumPallets: tDist.num(dr, /medium/),
      largePallets: tDist.num(dr, /large/),
    }
  : null;

// ================= 11_R0 Theo ngày =================
const dayRows = sheet('11_R0 Theo ngày', /^11_/);
const tDay = table(dayRows, 'Theo ngày', [/^Ngày$/, /^Pack/, /^Orange 1L$/, /^Kho NL$/]);
const SKUS: SkuKey[] = ['Orange 1L', 'C-power 1L', 'Mango 1L', 'Orange PET', 'C-power PET', 'Mango PET'];
const daily: DailyRow[] = tDay.rows
  .filter((r) => parseVN(r[0]) !== null)
  .map((r) => ({
    day: tDay.num(r, /^Ngày$/),
    rmWeeks: Object.fromEntries(COMPONENTS.map((c) => [c, tDay.num(r, c === 'Pack' ? /^Pack/ : new RegExp(`^${c}$`))])) as Record<ComponentKey, number>,
    fgWeeks: Object.fromEntries(SKUS.map((s) => [s, tDay.num(r, new RegExp(`^${s}$`))])) as Record<SkuKey, number>,
    rmHours: tDay.num(r, /^Kho NL$/),
    fgHours: tDay.num(r, /^Kho TP/),
  }));
const statRow = (label: RegExp) => dayRows.find((r) => label.test(String(r?.[0] ?? '').normalize('NFC')));
const so = statRow(/hết hàng/i), fx = statRow(/Giờ công cố định/i), ab = statRow(/vượt giờ công/i);
if (!so || !fx || !ab) fail('11_R0 Theo ngày: thiếu dòng thống kê (hết hàng / giờ công cố định / số ngày vượt)');
const iRM = tDay.col(/^Kho NL$/), iFG = tDay.col(/^Kho TP/);
const stockoutDays: Record<string, number> = {};
[...COMPONENTS, ...SKUS].forEach((k) => {
  const i = tDay.col(k === 'Pack' ? /^Pack/ : new RegExp(`^${k}$`));
  stockoutDays[k] = parseVN(so[i]) ?? 0;
});
const dailyStats = {
  rmFixedHoursPerDay: parseVN(fx[iRM]) ?? fail('thiếu giờ cố định kho NL'),
  fgFixedHoursPerDay: parseVN(fx[iFG]) ?? fail('thiếu giờ cố định kho TP'),
  rmDaysAboveFixed: parseVN(ab[iRM]) ?? 0,
  fgDaysAboveFixed: parseVN(ab[iFG]) ?? 0,
  stockoutDays,
};

// ================= 12_R0 Theo tuần =================
const wkRows = sheet('12_R0 Theo tuần', /^12_/);
const tWk = table(wkRows, 'Theo tuần', [/^Tuần$/, /^Orange 1L$/, /^Mango PET$/]);
const weeks = tWk.rows
  .filter((r) => parseVN(r[0]) !== null)
  .map((r) => ({ week: tWk.num(r, /^Tuần$/), demand: Object.fromEntries(SKUS.map((s) => [s, tWk.num(r, new RegExp(`^${s}$`))])) as Record<SkuKey, number> }));
const wkStat = (label: RegExp) => {
  const r = wkRows.find((row) => label.test(String(row?.[0] ?? '').normalize('NFC')));
  if (!r) fail(`12_R0 Theo tuần: thiếu dòng ${label}`);
  return Object.fromEntries(SKUS.map((s) => [s, parseVN(r[tWk.col(new RegExp(`^${s}$`))]) ?? 0])) as Record<SkuKey, number>;
};

// ================= Luật & viết tắt =================
const ruleRows = sheet('Luật game', /^8_/, /^Luật/i);
const tRule = table(ruleRows, 'Luật', [/^Chủ đề$/, /^Luật$/]);
const rules = tRule.rows.map((r) => ({ topic: tRule.str(r, /^Chủ đề$/), rule: tRule.str(r, /^Luật$/), opsImpact: tRule.str(r, /Ops/) || null }));
const glRows = sheet('9_Viết tắt', /^9_/);
const tGl = table(glRows, 'Viết tắt', [/Viết tắt/, /^Đầy đủ$/]);
const glossary = tGl.rows.map((r) => ({ term: tGl.str(r, /Viết tắt/), full: tGl.str(r, /^Đầy đủ$/), explain: tGl.str(r, /Giải thích/) }));

// ================= 13_Lịch sử R-2 vs R0 (chỉ bản mới) =================
const histName = sheetNames.find((n) => /^13_/.test(n.normalize('NFC')));
const history = histName ? (() => {
  const rows = sheet('13_Lịch sử', /^13_/);
  const t = table(rows, 'Lịch sử R-2 vs R0', [/^Nhóm$/, /^Đối tượng$/, /^Chỉ số/, /^Round -2$/, /^Round 0$/]);
  return t.rows.map((r) => ({ group: t.str(r, /^Nhóm$/), object: t.str(r, /^Đối tượng$/), metric: t.str(r, /^Chỉ số/), rMinus2: t.numOpt(r, /^Round -2$/), r0: t.numOpt(r, /^Round 0$/) }));
})() : [];

// ================= kiểm tra chéo =================
if (products.length !== 6) fail(`Cần 6 SKU, đọc được ${products.length}`);
if (components.length !== 5) fail(`Cần 5 nguyên liệu, đọc được ${components.length}`);
if (!mixers.some((m) => m.name === mixerName)) fail(`Máy trộn đang dùng "${mixerName}" không có trong bảng máy trộn`);
if (!lines.some((l) => l.name === lineName)) fail(`Dây chuyền đang dùng "${lineName}" không có trong bảng dây chuyền`);
if (daily.length < 100) fail(`Tab theo ngày chỉ có ${daily.length} dòng`);

const out: Round0Data = {
  meta: { source: 'data/TFC_Round0.xlsx', generatedAt: new Date().toISOString(), sheets: sheetNames },
  issues,
  finance: { lines: finDetail, totals: financeTotals },
  products,
  components,
  purchasing: { contracts, results: supplierResults, market, specs: supplierSpecs, negotiation: negotiationOptions, contractTransportChoice },
  ops: { decisions: opsDecisions, results: opsResults, mixers, lines, norms },
  sales: { contracts: customerContracts, customerResults, productResults, customerProduct, notes: salesNotes },
  supplyChain: { components: scComponents, products: scProducts, frozenPeriodWeeks: frozen, componentStock, productStock, totalStockValue, dashboard: dashTable },
  history,
  analysis: { components: anComponents, products: anProducts, distributor },
  daily,
  dailyStats,
  weekly: { weeks, mean: wkStat(/^Trung bình/i), std: wkStat(/Độ lệch chuẩn/i), cv: wkStat(/Hệ số biến thiên/i) },
  rules,
  glossary,
};

writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`✔ Đã ghi ${OUT}`);
console.log(`  ${products.length} SKU · ${components.length} NL · ${market.length} NCC thị trường · ${mixers.length} máy trộn · ${lines.length} dây chuyền · ${daily.length} ngày · ${weeks.length} tuần`);
console.log(`  ROI R0 = ${(financeTotals.roi * 100).toFixed(2)}% · Revenue ${financeTotals.realizedRevenue} · Investment ${financeTotals.investment}`);
