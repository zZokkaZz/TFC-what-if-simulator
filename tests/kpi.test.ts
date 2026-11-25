// Dashboard KPI: chỉ dùng số trong sheet; baseline = đúng số sheet; ô thiếu = null (không tự điền).
import { describe, expect, it } from 'vitest';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import { baselineInputs, simulate } from '../src/model/simulate';
import { buildKpis, roleScores } from '../src/model/kpi';

const d = data as unknown as Round0Data;
const b = simulate(baselineInputs(d), d);
const k = buildKpis(d, b, b);
const get = (id: string) => k.find((x) => x.id === id)!;

describe('KPI dashboard', () => {
  it('baseline: mọi KPI kịch bản = đúng R0 trong sheet', () => {
    for (const x of k) if (x.scenario !== null && x.r0.value !== null) expect(x.scenario, x.label).toBeCloseTo(x.r0.value, 9);
  });
  it('số R0 đúng như dashboard game / sheet', () => {
    expect(get('roi').r0.value).toBe(d.finance.totals.roi);
    expect(get('roi').rMinus2.value).toBe(-0.0667);
    expect(get('pur-rej').r0.value).toBeCloseTo(0.029, 9);
    expect(get('pur-rmcost').r0.value).toBeCloseTo(0.395, 9);
    expect(get('pur-rel').r0.value).toBeCloseTo(0.921, 9);
    expect(get('ops-rm').r0.value).toBe(0.934);
    expect(get('ops-rm').rMinus2.value).toBe(0.954);
    expect(get('ops-fg').rMinus2.value).toBe(0.729);
    expect(get('ops-adh').rMinus2.value).toBe(0.783);
    expect(get('sal-gm').r0.value).toBe(903148);
    expect(get('sal-obs').r0.value).toBe(0.081);
    expect(get('sal-sl').r0.value).toBe(0.92);
    expect(get('sc-av').r0.value).toBe(0.9941);
    expect(get('sc-stc').r0.value).toBe(4.36);
    expect(get('sc-stp').r0.value).toBe(3.18);
  });
  it('số không có trong sheet → null + ghi "Thiếu dữ liệu", không tự điền', () => {
    for (const id of ['pur-rej', 'pur-rmcost', 'pur-rel', 'sal-gm', 'sal-obs', 'sal-sl']) {
      expect(get(id).rMinus2.value).toBeNull();
      expect(get(id).rMinus2.source).toMatch(/^Thiếu dữ liệu/);
    }
  });
  it('đổi quyết định Ops → KPI Ops & điểm phòng Ops đổi; KPI chưa mô hình đứng yên', () => {
    const i = baselineInputs(d); i.ops.shifts = 3; i.ops.fgPalletLocations = 1200;
    const r = simulate(i, d);
    const k2 = buildKpis(d, r, b);
    expect(k2.find((x) => x.id === 'ops-adh')!.scenario!).toBeGreaterThan(0.787);
    expect(k2.find((x) => x.id === 'ops-fg')!.scenario!).toBeGreaterThan(0.707);
    expect(k2.find((x) => x.id === 'pur-rej')!.scenario).toBe(get('pur-rej').scenario);
    const s = roleScores(d, r, b).find((x) => x.dept === 'Operations')!;
    expect(s.scenario).not.toBeCloseTo(s.r0, 6);
  });
});
