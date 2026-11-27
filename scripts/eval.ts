/**
 * Đánh giá nhanh kịch bản Round 2 bằng simulator (dùng cho thương lượng giữa các phòng).
 * Gốc = bộ quyết định Round 1 đã nộp (round1Inputs, số NCC thật của game).
 * Chạy: npx tsx scripts/eval.ts '[{"name":"A","patch":{...}}, ...]'   (hoặc đường dẫn file .json)
 * patch = phần ghi đè lên Inputs (merge sâu). Đổi NCC mà không ghi "terms" → điều kiện mặc định của NCC mới.
 * In: ROI, ROI thận trọng, OP, Investment, điểm 4 phòng (luật tab luật), KPI chính, cảnh báo chéo phòng.
 */
import { readFileSync, existsSync } from 'node:fs';
import data from '../src/data/round0.json';
import r1j from '../src/data/round1.json';
import type { Round0Data } from '../src/data/types';
import type { Round1Data } from '../src/data/round1Types';
import type { Inputs, Results } from '../src/model/types';
import { simulate, baselineInputs } from '../src/model/simulate';
import { round1Inputs } from '../src/model/round1';
import { defaultTerms } from '../src/model/purchasing';
import { roleScores, buildKpis } from '../src/model/kpi';
import { crossWarnings } from '../src/model/warnings';

const d = data as unknown as Round0Data;
const r1 = r1j as unknown as Round1Data;
export const R1 = round1Inputs(d, r1);
const baseRes = simulate(R1, d);
const r0Res = simulate(baselineInputs(d), d); // KPI / điểm phòng neo theo R0 (số sheet) như trên web

function merge(a: any, b: any): any {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const o = { ...(a ?? {}) };
  for (const k of Object.keys(b)) o[k] = merge(a?.[k], b[k]);
  return o;
}
export function apply(patch: any): Inputs {
  const i: Inputs = merge(structuredClone(R1), patch);
  for (const c of Object.keys(patch?.purchasing?.suppliers ?? {})) {
    if (!patch?.purchasing?.terms?.[c]) (i.purchasing.terms as any)[c] = defaultTerms(d, c as any, (i.purchasing.suppliers as any)[c]);
    else (i.purchasing.terms as any)[c] = { ...defaultTerms(d, c as any, (i.purchasing.suppliers as any)[c]), ...patch.purchasing.terms[c] };
  }
  return i;
}
const pct = (x: number) => (x * 100).toFixed(2) + '%';
const eur = (x: number) => Math.round(x).toLocaleString('vi-VN');
export function report(name: string, i: Inputs, r: Results = simulate(i, d)): string {
  const rs = roleScores(d, r, r0Res), rs0 = roleScores(d, baseRes, r0Res);
  const k = (l: string) => buildKpis(d, r, r0Res).find((x) => x.label === l)?.scenario ?? NaN;
  const scores = rs.map((s, j) => {
    const v = s.scenario, v0 = rs0[j].scenario;
    const f = s.unit === 'eur' ? eur : s.unit === 'pct' ? pct : (x: number) => x.toFixed(4);
    const better = s.good === 'up' ? v > v0 + 1e-9 : v < v0 - 1e-9, worse = s.good === 'up' ? v < v0 - 1e-9 : v > v0 + 1e-9;
    return `${s.dept} ${f(v)} (${better ? 'tốt hơn' : worse ? 'XẤU HƠN' : '='} R1)`;
  }).join(' | ');
  const w = crossWarnings(d, R1, i, r, baseRes).filter((x: any) => x.severity === 'high' || x.level === 'red' || x.level === 'high').map((x: any) => x.title);
  return [
    `=== ${name}`,
    `ROI ${pct(r.finance.roi)} (thận trọng ${pct(r.conservative.roi)}) | ΔROI vs R1-model ${((r.finance.roi - baseRes.finance.roi) * 100).toFixed(2)} điểm | OP ${eur(r.finance.operatingProfit)} | Investment ${eur(r.finance.investment)} | Revenue ${eur(r.finance.realizedRevenue)}`,
    `Điểm phòng: ${scores}`,
    `SL khách (order lines): ${r.sales.customers.map((c) => `${c.customer} ${pct(c.slOrderLines)} (hứa ${pct(c.promised)}, ${c.penalty >= 0 ? 'thưởng' : 'phạt'} ${eur(c.penalty)})`).join('; ')}`,
    `Adherence ${pct(k('Production plan adherence'))} | Obsolete ${pct(k('Obsolete products (%)'))} | Cube NL ${pct(k('Cube utilization raw materials warehouse'))} TP ${pct(k('Cube utilization finished goods warehouse'))} | Availability NL ${pct(k('Availability components (%)'))} | Tăng ca ${r.ops.line.overtime.toFixed(1)} h/tuần | Overflow NL ${eur(r.ops.rm.overflowCost)} TP ${eur(r.ops.fg.overflowCost)} | Thời vụ kho NL ${eur(r.ops.rm.flexCost)} TP ${eur(r.ops.fg.flexCost)}`,
    `Tuổi tồn TP tối đa: ${r.sc.products.map((p) => `${p.sku} ${p.maxAgeWeeks.toFixed(1)}/${(p.allowedAgeWeeks ?? NaN).toFixed(1)}`).join(', ')} | Mẻ trộn C-power PET ${Math.round(r.ops.production.find((p) => p.sku === 'C-power PET')!.batchLiters)} L`,
    w.length ? `Cảnh báo đỏ: ${w.join(' / ')}` : 'Cảnh báo đỏ: không',
  ].join('\n');
}
if (process.argv[1]?.endsWith("eval.ts") && process.argv[2]) {
  const arg = process.argv[2];
  const list = JSON.parse(existsSync(arg) ? readFileSync(arg, 'utf8') : arg);
  console.log(report('GỐC = quyết định Round 1 (model)', R1, baseRes));
  for (const s of Array.isArray(list) ? list : [list]) console.log(report(s.name ?? 'kịch bản', apply(s.patch ?? s)));
}
