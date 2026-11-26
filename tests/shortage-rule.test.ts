// Ô Shortage rule + thứ tự ưu tiên khách (ord.mgmt, 26/11): ghi nhận & đồng bộ — CHƯA MÔ HÌNH (không đổi số).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import type { Inputs } from '../src/model/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { salesOption } from '../src/model/sales';
import { crossWarnings } from '../src/model/warnings';
import { makeSanitizer } from '../src/sync/sanitize';
import { SALES_CUSTOMERS, SALES_SHORTAGE_MAX, validateDept } from '../src/sync/limits';
import { describePath } from '../src/ui/trace';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const b = simulate(base, d);
const opt = salesOption(d, 'shortageRule')!;
const prio = opt.choices!.find((x) => /priority/i.test(x))!;

describe('Shortage rule (ord.mgmt)', () => {
  it('baseline = giá trị R0 của sheet; lựa chọn đọc từ sheet; thứ tự khách = bảng hợp đồng', () => {
    expect(base.sales.shortageRule).toBe(Object.values(opt.r0).find((v) => typeof v === 'string'));
    expect(opt.choices).toContain(base.sales.shortageRule);
    expect(base.sales.customerPriority).toEqual(d.sales.contracts.map((c) => c.customer));
    for (const x of opt.choices!) expect(x.length).toBeLessThanOrEqual(SALES_SHORTAGE_MAX);
  });
  it('CHƯA MÔ HÌNH: đổi sang Customer priority (F&G đầu) không đổi số nào; có cảnh báo ghi rõ "CHƯA MÔ HÌNH"', () => {
    const i: Inputs = structuredClone(base);
    i.sales.shortageRule = prio;
    i.sales.customerPriority = ['Food & Groceries', "Dominick's", 'LAND Market'];
    const r = simulate(i, d);
    expect(r.finance.roi).toBe(b.finance.roi);
    expect(r.sales.penaltyTotal).toBe(b.sales.penaltyTotal);
    const w = crossWarnings(d, base, i, r, b).find((x) => x.id === 'sales-shortage')!;
    expect(w.detail).toContain('CHƯA MÔ HÌNH');
    expect(w.title).toContain('Food & Groceries > Dominick');
    expect(crossWarnings(d, base, base, b, b).some((x) => x.id === 'sales-shortage')).toBe(false);
  });
  it('sanitize: nhận rule + hoán vị khách; bỏ danh sách lạ/thiếu; bản lưu cũ (chưa có ô) → baseline', () => {
    const s = makeSanitizer(base);
    const ok = s('sales', { ...base.sales, shortageRule: prio, customerPriority: ["Dominick's", 'Food & Groceries', 'LAND Market'] }) as Inputs['sales'];
    expect(ok.shortageRule).toBe(prio);
    expect(ok.customerPriority).toEqual(["Dominick's", 'Food & Groceries', 'LAND Market']);
    expect((s('sales', { ...base.sales, customerPriority: ['Hacker', 'LAND Market', "Dominick's"] }) as Inputs['sales']).customerPriority).toEqual(base.sales.customerPriority);
    expect((s('sales', { ...base.sales, customerPriority: ['LAND Market'] }) as Inputs['sales']).customerPriority).toEqual(base.sales.customerPriority);
    const old = s('sales', { customers: base.sales.customers }) as Inputs['sales'];
    expect(old.shortageRule).toBe(base.sales.shortageRule);
    expect(Array.isArray(old.customerPriority)).toBe(true);
  });
  it('validateDept + nhật ký + rules', () => {
    expect(validateDept('sales', base.sales)).toEqual([]);
    expect(validateDept('sales', { ...base.sales, shortageRule: 'x'.repeat(SALES_SHORTAGE_MAX + 1) })[0].path).toBe('sales.shortageRule');
    expect(validateDept('sales', { ...base.sales, customerPriority: ['Hacker'] })[0].path).toBe('sales.customerPriority');
    expect(describePath('sales.shortageRule')).toEqual({ dept: 'Sales', label: 'shortage rule' });
    expect(describePath('sales.customerPriority.0')).toEqual({ dept: 'Sales', label: 'thứ tự ưu tiên khách (hạng 1)' });
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    expect(rules).toContain(`d.shortageRule.size() <= ${SALES_SHORTAGE_MAX}`);
    expect(rules).toContain(`d.customerPriority.size() <= ${SALES_CUSTOMERS.length}`);
  });
});
