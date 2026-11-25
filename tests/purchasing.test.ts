// M3 Purchasing: hướng tác động, ô số game, nhãn ước lượng, cảnh báo (delivery window / quality nước ép chỉ cảnh báo).
import { describe, expect, it } from 'vitest';
import data from '../src/data/round0.json';
import type { ComponentKey, Round0Data } from '../src/data/types';
import type { Inputs, PurchasingTerms } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { activeSupplier, avgReliabilityGap, defaultTerms } from '../src/model/purchasing';
import { crossWarnings } from '../src/model/warnings';
import { makeSanitizer } from '../src/sync/sanitize';
import { describePath } from '../src/ui/trace';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const run = (f: (i: Inputs) => void) => { const i: Inputs = structuredClone(base); f(i); return { i, r: simulate(i, d) }; };
const terms = (i: Inputs, c: ComponentKey, patch: Partial<PurchasingTerms>) => { i.purchasing.terms[c] = { ...i.purchasing.terms[c], ...patch }; };
const pick = (r: ReturnType<typeof simulate>, c: ComponentKey) => r.purchasing.components.find((x) => x.key === c)!;
const finRow = (r: ReturnType<typeof simulate>, re: RegExp) => r.finance.rows.find((x) => re.test(x.label))!.value;
const swap = (i: Inputs, c: ComponentKey, supplier: string) => { i.purchasing.suppliers[c] = supplier; i.purchasing.terms[c] = defaultTerms(d, c, supplier); };

describe('Ô quyết định mặc định = hợp đồng tab 4', () => {
  it('baseline terms = điều kiện hợp đồng R0; ô số game bỏ trống', () => {
    for (const k of d.purchasing.contracts) {
      const t = base.purchasing.terms[k.component];
      expect(t).toMatchObject({ transport: k.transport, tradeUnit: k.tradeUnit, quality: k.quality, deliveryWindow: k.deliveryWindow, paymentTermWeeks: k.paymentTermWeeks, agreedReliability: k.agreedReliability });
      expect([t.ciGame, t.reliabilityActual, t.rejectionActual]).toEqual([null, null, null]);
    }
  });
  it('lựa chọn trade unit / quality / window đúng bảng "Lựa chọn khi đàm phán" và chứa giá trị R0', () => {
    for (const k of d.purchasing.contracts) {
      const n = d.purchasing.negotiation.find((x) => x.component === k.component)!;
      expect(n.tradeUnits).toContain(k.tradeUnit);
      expect(n.qualities).toContain(k.quality);
      expect(n.deliveryWindows).toContain(k.deliveryWindow);
    }
  });
});

describe('Giá NL → purchase value', () => {
  it('nhập CI game thấp hơn → tiền hàng giảm đúng tỷ lệ CI, phí vận chuyển giữ nguyên, ROI tăng', () => {
    const { r } = run((i) => terms(i, 'Orange', { ciGame: 0.95 }));
    const o = pick(r, 'Orange'), ob = pick(b, 'Orange');
    expect(o.ciBasis).toBe('game');
    expect(o.goodsValue).toBeCloseTo(ob.goodsValue * (0.95 / 1.004), 6);
    expect(o.transportCost).toBeCloseTo(ob.transportCost, 6);
    expect(r.finance.operatingProfit).toBeGreaterThan(b.finance.operatingProfit);
    expect(finRow(r, /\(Orange\)/)).toBeCloseTo(o.purchaseValue, 6);
  });
  it('đổi NCC: giá theo giá cơ bản × CI niêm yết của NCC mới; dòng P&L ghi tên NCC mới', () => {
    const { r } = run((i) => swap(i, 'PET', 'Plantin PET'));
    const p = pick(r, 'PET'), pb = pick(b, 'PET');
    expect(p.contractIndex).toBe(d.purchasing.market.find((m) => m.supplier === 'Plantin PET')!.contractIndex);
    expect(p.goodsValue).toBeCloseTo(pb.goodsValue * (0.988 / 0.962), 6);
    expect(p.ciBasis).toBe('estimate');
    expect(r.finance.rows.some((x) => /Plantin PET \(PET\) — thay Trio PET PLC/.test(x.label))).toBe(true);
  });
  it('rejection thực tế cao hơn → phải mua nhiều hơn → purchase value tăng', () => {
    const { r } = run((i) => terms(i, 'Orange', { rejectionActual: 0.05 }));
    expect(pick(r, 'Orange').amountPurchased).toBeGreaterThan(pick(b, 'Orange').amountPurchased);
    expect(pick(r, 'Orange').purchaseValue).toBeGreaterThan(pick(b, 'Orange').purchaseValue);
    expect(pick(r, 'Orange').rejectionBasis).toBe('game');
  });
});

describe('Reliability / lead time → availability NL', () => {
  it('Vitamin C: NCC SYI (lead time 4 ngày, cam kết 98%) → availability tăng, NCC mới ước lượng reliability = cam kết − chênh lệch TB R0', () => {
    const { r } = run((i) => swap(i, 'Vitamin C', 'SYI'));
    const vc = r.sc.components.find((x) => x.key === 'Vitamin C')!;
    expect(vc.leadTimeWeeks).toBeLessThan(b.sc.components.find((x) => x.key === 'Vitamin C')!.leadTimeWeeks);
    expect(vc.availability).toBeGreaterThan(0.843);
    expect(pick(r, 'Vitamin C').reliability).toBeCloseTo(0.98 - avgReliabilityGap(d), 12);
    expect(pick(r, 'Vitamin C').reliabilityBasis).toBe('estimate');
  });
  it('nhập reliability thực tế thấp hơn → availability giảm; cao hơn → tăng', () => {
    const lo = run((i) => terms(i, 'Vitamin C', { reliabilityActual: 0.7 })).r.sc.components.find((x) => x.key === 'Vitamin C')!.availability;
    const hi = run((i) => terms(i, 'Vitamin C', { reliabilityActual: 0.95 })).r.sc.components.find((x) => x.key === 'Vitamin C')!.availability;
    expect(lo).toBeLessThan(0.843);
    expect(hi).toBeGreaterThan(0.843);
  });
  it('Mango NO8DO: Truck → Boat → lead time 10 → 25 ngày (tab 4), availability giảm', () => {
    const { r } = run((i) => terms(i, 'Mango', { transport: 'Boat' }));
    expect(pick(r, 'Mango').leadTimeDays).toBe(25);
    expect(r.sc.components.find((x) => x.key === 'Mango')!.availability).toBeLessThanOrEqual(1);
    expect(r.sc.components.find((x) => x.key === 'Mango')!.leadTimeWeeks).toBeGreaterThan(b.sc.components.find((x) => x.key === 'Mango')!.leadTimeWeeks);
  });
});

describe('Quality bao bì → hỏng dây chuyền (ước lượng); quality nước ép & delivery window chỉ cảnh báo', () => {
  it('PET Poor → High: breakdown giảm, flexible manpower bottling giảm', () => {
    const { r } = run((i) => terms(i, 'PET', { quality: 'High' }));
    expect(r.ops.line.breakdown).toBeLessThan(b.ops.line.breakdown);
    expect(finRow(r, /^Flexible manpower \(bottling\)/)).toBeLessThan(finRow(b, /^Flexible manpower \(bottling\)/));
  });
  it('Orange quality Poor: có cảnh báo, KHÔNG đổi số nào (ROI, purchase value giữ nguyên)', () => {
    const { i, r } = run((x) => terms(x, 'Orange', { quality: 'Poor' }));
    expect(r.finance.roi).toBeCloseTo(b.finance.roi, 12);
    expect(crossWarnings(d, base, i, r, b).some((w) => w.id === 'pur-juice-Orange')).toBe(true);
  });
  it('delivery window rộng hơn: có cảnh báo, KHÔNG đổi số nào', () => {
    const { i, r } = run((x) => terms(x, 'Pack', { deliveryWindow: '1 week' }));
    expect(r.finance.roi).toBeCloseTo(b.finance.roi, 12);
    expect(r.sc.components.find((x) => x.key === 'Pack')!.availability).toBeCloseTo(b.sc.components.find((x) => x.key === 'Pack')!.availability, 12);
    const w = crossWarnings(d, base, i, r, b).find((x) => x.id === 'pur-window-Pack')!;
    expect(w.severity).toBe('warn');
    expect(w.detail).toMatch(/CHƯA đưa vào số/);
  });
  it('đổi điều kiện mà chưa nhập CI game → ciStale + cảnh báo "Chưa nhập số game"; nhập CI → hết', () => {
    const a = run((x) => terms(x, 'Pack', { deliveryWindow: '1 week' }));
    expect(pick(a.r, 'Pack').ciStale).toBe(true);
    expect(crossWarnings(d, base, a.i, a.r, b).find((w) => w.id === 'pur-Pack')!.detail).toMatch(/Chưa nhập số game: contract index/);
    const c = run((x) => terms(x, 'Pack', { deliveryWindow: '1 week', ciGame: 0.97 }));
    expect(pick(c.r, 'Pack').ciStale).toBe(false);
    expect(crossWarnings(d, base, c.i, c.r, b).find((w) => w.id === 'pur-Pack')!.detail).not.toMatch(/contract index/);
  });
});

describe('Phí vận chuyển & phí đơn hàng theo lot size / trade unit (ước lượng, neo R0)', () => {
  it('lot size ↓ → số chuyến ↑ → phí vận chuyển ↑, phí đơn hàng ↑', () => {
    const { r } = run((i) => { i.sc.components.Pack.lotSizeWeeks = 1; });
    expect(pick(r, 'Pack').deliveriesPerRound).toBeGreaterThan(pick(b, 'Pack').deliveriesPerRound);
    expect(pick(r, 'Pack').transportCost).toBeGreaterThan(pick(b, 'Pack').transportCost);
    expect(r.purchasing.inboundOrders).toBeGreaterThan(b.purchasing.inboundOrders);
    expect(r.purchasing.inboundOrderLines).toBeGreaterThan(b.purchasing.inboundOrderLines);
  });
  it('Pack FTL: ~30 pallet/chuyến (lot 3,3 tuần) → 1 xe €500 rẻ hơn 30 pallet lẻ; ~36 pallet/chuyến (lot 4) → 2 xe, đắt hơn', () => {
    const at = (lot: number, tu: string) => pick(run((i) => { i.sc.components.Pack.lotSizeWeeks = lot; terms(i, 'Pack', { tradeUnit: tu }); }).r, 'Pack').transportCost;
    expect(at(3.3, 'FTL')).toBeLessThan(at(3.3, 'Pallet'));
    expect(at(4, 'FTL')).toBeGreaterThan(at(4, 'Pallet'));
  });
});

describe('Payment term NCC → Investment (ước lượng)', () => {
  it('payment term dài hơn → phải trả ↑ → Investment: Payment terms ↓ → Investment ↓', () => {
    const { r } = run((i) => terms(i, 'Orange', { paymentTermWeeks: 8 }));
    expect(finRow(r, /^Payment terms$/)).toBeCloseTo(finRow(b, /^Payment terms$/) - (pick(b, 'Orange').purchaseValue / 26) * 4, 6);
    expect(r.finance.investment).toBeLessThan(b.finance.investment);
  });
});

describe('Đồng bộ & nhãn', () => {
  it('sanitizer nhận số / null cho ô bỏ trống được, bỏ chuỗi lạ', () => {
    const s = makeSanitizer(base);
    const got = s('purchasing', { ...base.purchasing, terms: { ...base.purchasing.terms, PET: { ...base.purchasing.terms.PET, ciGame: 1.01, reliabilityActual: 'x' } } }) as Inputs['purchasing'];
    expect(got.terms.PET.ciGame).toBe(1.01);
    expect(got.terms.PET.reliabilityActual).toBeNull();
    const old = s('purchasing', { suppliers: { PET: 'Plantin PET' } }) as Inputs['purchasing'];
    expect(old.suppliers.PET).toBe('Plantin PET');
    expect(old.terms.PET).toEqual(base.purchasing.terms.PET);
  });
  it('nhãn truy vết / nhật ký cho ô Purchasing', () => {
    expect(describePath('purchasing.terms.PET.quality')).toEqual({ dept: 'Purchasing', label: 'quality NL (PET)' });
    expect(describePath('purchasing.terms.Vitamin C.ciGame')).toEqual({ dept: 'Purchasing', label: 'CI game (Vitamin C)' });
  });
  it('dữ liệu cũ không có "terms" (bản trước M3) vẫn chạy: dùng điều kiện niêm yết của NCC', () => {
    const i = structuredClone(base) as Inputs;
    delete (i.purchasing as Partial<Inputs['purchasing']>).terms;
    expect(activeSupplier(i, d, 'PET').contractIndex).toBe(0.962);
  });
});
