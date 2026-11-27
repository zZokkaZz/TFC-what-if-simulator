/**
 * Quét có hệ thống (chống bias của agent): leo đồi theo từng ô quanh bộ quyết định R1, giữ ràng buộc của đội.
 * Không quét điều khoản Sales (CI khi đổi điều khoản chưa mô hình — hệ số = 0, quét sẽ ra kết quả ảo).
 * Chạy: npx tsx scripts/sweep.ts
 */
import data from '../src/data/round0.json';
import type { Round0Data, ComponentKey, SkuKey } from '../src/data/types';
import type { Inputs } from '../src/model/types';
import { simulate } from '../src/model/simulate';
import { R1, report } from './eval';
import { defaultTerms } from '../src/model/purchasing';

const d = data as unknown as Round0Data;
const C: ComponentKey[] = ['Pack', 'PET', 'Orange', 'Mango', 'Vitamin C'];
const S: SkuKey[] = ['Orange 1L', 'C-power 1L', 'Mango 1L', 'Orange PET', 'C-power PET', 'Mango PET'];
function ok(i: Inputs) {
  const r = simulate(i, d);
  if (r.sc.products.some((p) => p.allowedAgeWeeks !== null && p.maxAgeWeeks > p.allowedAgeWeeks + 1e-9)) return null;
  if (r.ops.production.find((p) => p.sku === 'C-power PET')!.batchLiters < 8000) return null;
  if (/tank/i.test(i.purchasing.terms['Vitamin C'].tradeUnit)) return null;
  return r;
}
type Move = [string, (i: Inputs) => void];
const moves: Move[] = [];
for (const c of C) {
  for (const v of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) moves.push([`SS NL ${c}=${v}`, (i) => { i.sc.components[c].safetyStockWeeks = v; }]);
  for (const v of [0.5, 1, 1.5, 2, 3, 4, 6]) moves.push([`lot NL ${c}=${v}`, (i) => { i.sc.components[c].lotSizeWeeks = v; }]);
  for (const s of d.purchasing.market.filter((m) => m.component === c)) moves.push([`NCC ${c}=${s.supplier}`, (i) => { i.purchasing.suppliers[c] = s.supplier; i.purchasing.terms[c] = defaultTerms(d, c, s.supplier); }]);
}
for (const s of S) {
  for (const v of [1.5, 2, 2.5, 3, 3.5]) moves.push([`SS TP ${s}=${v}`, (i) => { i.sc.products[s].safetyStockWeeks = v; }]);
  for (const v of [5, 7, 10, 13, 15]) moves.push([`interval ${s}=${v}`, (i) => { i.sc.products[s].productionIntervalDays = v; }]);
}
for (const v of [500, 550, 600, 650, 700, 750, 800, 850]) moves.push([`kho NL ${v}`, (i) => { i.ops.rmPalletLocations = v; }]);
for (const v of [1, 2, 3, 4]) moves.push([`FTE NL ${v}`, (i) => { i.ops.rmFte = v; }]);
for (const v of [1100, 1150, 1200, 1250, 1300, 1350, 1400]) moves.push([`kho TP ${v}`, (i) => { i.ops.fgPalletLocations = v; }]);
for (const v of [2, 3, 4]) moves.push([`FTE TP ${v}`, (i) => { i.ops.fgFte = v; }]);
for (const v of ['None', 'Minimal', 'Extensive'] as const) moves.push([`PM ${v}`, (i) => { i.ops.preventiveMaintenance = v; }]);
moves.push(['speed on', (i) => { i.ops.increaseSpeed = true; }], ['speed off', (i) => { i.ops.increaseSpeed = false; }]);
for (const v of [1, 2, 3]) moves.push([`ca ${v}`, (i) => { i.ops.shifts = v; }]);
for (const c of ['Pack', 'PET'] as ComponentKey[]) moves.push([`inspection ${c} on`, (i) => { i.ops.rmInspection[c] = true; }]);
for (const m of d.ops.mixers) moves.push([`máy trộn ${m.name}`, (i) => { i.ops.mixer = m.name; }]);
for (const l of d.ops.lines) moves.push([`dây chuyền ${l.name}`, (i) => { i.ops.bottlingLine = l.name; }]);
// Không quét payment term NCC: đổi điều khoản mà chưa có CI game thì model giữ CI cũ (lợi ảo).

let cur: Inputs = structuredClone(R1), best = ok(cur)!.finance.roi;
const log: string[] = [];
for (let pass = 0; pass < 4; pass++) {
  let improved = false;
  for (const [name, f] of moves) {
    const t = structuredClone(cur); f(t);
    if (JSON.stringify(t) === JSON.stringify(cur)) continue;
    const r = ok(t);
    if (r && r.finance.roi > best + 1e-5) { log.push(`${name}: ${(best * 100).toFixed(2)} → ${(r.finance.roi * 100).toFixed(2)}`); best = r.finance.roi; cur = t; improved = true; }
  }
  if (!improved) break;
}
console.log('Leo đồi (thứ tự chấp nhận):\n' + log.join('\n'));
console.log(report('KẾT QUẢ QUÉT', cur));
console.log('PATCH=' + JSON.stringify(diff(R1, cur)));
function diff(a: any, b: any): any {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b) ? undefined : b;
  const o: any = {};
  for (const k of Object.keys(b)) { const v = diff(a?.[k], b[k]); if (v !== undefined) o[k] = v; }
  return Object.keys(o).length ? o : undefined;
}
