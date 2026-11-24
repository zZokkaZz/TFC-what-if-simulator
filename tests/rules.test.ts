// Đối chiếu định mức trong code (rules.ts) với chuỗi định mức trong Excel (tab 5_Operations).
import { describe, expect, it } from 'vitest';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import { parseVN } from '../scripts/lib/parse';

const d = data as unknown as Round0Data;
const norm = (task: RegExp) => d.ops.norms.find((n) => task.test(n.task))?.norm ?? '';

describe('Định mức Excel ↔ rules.ts', () => {
  it.each([
    [/Nhận hàng/, ['1 giờ/dòng đơn', '6 phút/pallet']],
    [/Cấp cho sản xuất/, ['6 phút/pallet', '12 phút/tank']],
    [/Raw materials inspection/, ['2 giờ/dòng đơn']],
    [/Nhập hàng từ sản xuất/, ['6 phút/pallet']],
    [/Soạn hàng/, ['10 phút/dòng đơn', '6 phút/pallet', '3 phút/thùng']],
    [/Phân phối/, ['€31/pallet']],
    [/Vượt 168/, ['gấp 2']],
    [/Thời vụ/, ['€42/giờ']],
    [/^Overflow$/, ['€3/pallet/ngày']],
    [/Pallet location/, ['€200/năm']],
  ])('%s', (task, parts) => {
    for (const p of parts) expect(norm(task)).toContain(p);
  });
  it('tank yard', () => {
    expect(d.ops.norms.find((n) => /Tank yard/i.test(n.area))?.norm).toMatch(/€25\/tank\/ngày.*€10\/lần nhận.*€100\/lần giao/);
  });
});

describe('parseVN (số kiểu Việt Nam)', () => {
  it.each([
    ['17.280', 17280], ['0,95', 0.95], ['93,4%', 0.934], ['3.989.513', 3989513], ['-7,68%', -0.0768], ['1.234,5', 1234.5], [42, 42], ['', null],
  ])('%s → %s', (s, v) => expect(parseVN(s)).toBe(v));
});
