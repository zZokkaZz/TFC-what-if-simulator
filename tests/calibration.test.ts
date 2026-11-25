// TEST HIỆU CHỈNH (CLAUDE.md mục 7): quyết định Round 0 → chỉ số Ops phải nằm trong sai số.
import { describe, expect, it } from 'vitest';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { allowed, opsChecks } from '../src/model/acceptance';

const d = data as unknown as Round0Data;
const res = simulate(baselineInputs(d), d);
const checks = opsChecks(d, res);

describe('Hiệu chỉnh Ops theo Round 0', () => {
  it.each(checks.map((c) => [c.label, c] as const))('%s nằm trong sai số', (_label, c) => {
    const tol = allowed(c);
    expect(Math.abs(c.model - c.r0), `${c.label}: model ${c.model} vs R0 ${c.r0}`).toBeLessThanOrEqual(tol + 1e-9);
  });

  it('chi phí Ops theo luật khớp P&L R0 (dòng cố định)', () => {
    const row = (re: RegExp) => res.finance.rows.find((r) => re.test(r.label))!;
    for (const re of [/^Bottling line fixed/, /^Permanent employees \(bottling\)/, /^Mixer fixed/, /^Pallet locations raw/, /^Pallet locations finished/, /^Inbound permanent/, /^Outbound permanent/, /^Machines$/]) {
      expect(row(re).value).toBeCloseTo(row(re).r0 as number, 0);
    }
  });

  it('mixer variable cost (€135/giờ chạy kể cả vệ sinh) trong ±5%', () => {
    const r = res.finance.rows.find((x) => /^Mixer variable/.test(x.label))!;
    expect(Math.abs(r.value / (r.r0 as number) - 1)).toBeLessThan(0.05);
  });

  it('nhìn ra vấn đề R0: kho NL tràn, kho TP thừa chỗ, dây chuyền quá tải', () => {
    expect(res.ops.rm.avgOverflowPallets).toBeGreaterThan(30);
    expect(res.ops.fg.utilization).toBeLessThan(0.8);
    expect(res.ops.line.bottleneck).toBe(true);
    expect(res.ops.rm.daysAboveFixed).toBeGreaterThan(0);
    const cpower = res.ops.production.filter((p) => p.sku.startsWith('C-power'));
    for (const p of cpower) expect(p.adherence).toBeLessThan(0.75);
  });
});
