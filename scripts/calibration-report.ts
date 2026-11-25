// In bảng so sánh model vs Round 0 (npm run report)
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import { baselineInputs, getCalibration, simulate } from '../src/model/simulate';
import { opsChecks, opsCostChecks } from '../src/model/acceptance';

const d = data as unknown as Round0Data;
const res = simulate(baselineInputs(d), d);
const f = (c: { unit: string }, x: number) => (c.unit === '%' ? `${(x * 100).toFixed(1)}%` : x.toLocaleString('en-US', { maximumFractionDigits: 1 }));

console.log('\nCHỈ SỐ OPS (mục 7)');
for (const c of opsChecks(d, res)) {
  console.log(`${c.ok ? '✔' : '✖'} ${c.label.padEnd(30)} R0 ${f(c, c.r0).padStart(10)}  model ${f(c, c.model).padStart(10)}  ${c.calibrated ? '(hiệu chỉnh)' : ''}`);
}
console.log('\nCHI PHÍ OPS vs P&L R0');
for (const c of opsCostChecks(d, res)) {
  const isRoi = c.label.includes('ROI');
  console.log(`  ${c.label.padEnd(44)} R0 ${isRoi ? (c.r0 * 100).toFixed(2) + '%' : Math.round(c.r0).toLocaleString('en-US').padStart(10)}  model ${isRoi ? (c.model * 100).toFixed(2) + '%' : Math.round(c.model).toLocaleString('en-US').padStart(10)}  ${isRoi ? '' : (c.rel * 100).toFixed(1) + '%'}`);
}
const cal = getCalibration(d);
console.log('\nHỆ SỐ HIỆU CHỈNH');
for (const n of cal.notes) console.log(`  ${n.label}: ${n.value}`);
console.log('\nKHÁC');
const o = res.ops;
console.log(`  Kho NL: avg ${o.rm.avgPallets.toFixed(0)} pallet, peak ${o.rm.peakPallets.toFixed(0)}, overflow avg ${o.rm.avgOverflowPallets.toFixed(1)}, flex ${o.rm.flexHours.toFixed(0)} h (€${o.rm.flexCost.toFixed(0)}), ngày vượt ${o.rm.daysAboveFixed}, đỉnh ${o.rm.peakDayHours.toFixed(1)} h/ngày`);
console.log('   breakdown', JSON.stringify(Object.fromEntries(Object.entries(o.rm.hoursBreakdown).map(([k, v]) => [k, +v.toFixed(1)]))), 'pallets in/wk', o.rm.palletsInPerWeek.toFixed(1), 'lines/wk', o.rm.orderLinesPerWeek.toFixed(2));
console.log(`  Kho TP: avg ${o.fg.avgPallets.toFixed(0)} pallet, peak ${o.fg.peakPallets.toFixed(0)}, flex ${o.fg.flexHours.toFixed(0)} h (€${o.fg.flexCost.toFixed(0)}), ngày vượt ${o.fg.daysAboveFixed}, đỉnh ${o.fg.peakDayHours.toFixed(1)}`);
console.log('   breakdown', JSON.stringify(Object.fromEntries(Object.entries(o.fg.hoursBreakdown).map(([k, v]) => [k, +v.toFixed(1)]))));
console.log(`  Tank yard: avg ${o.tankYard.avgTanks.toFixed(2)} tank, peak ${o.tankYard.peakTanks}, receipts ${o.tankYard.receipts}, deliveries ${o.tankYard.deliveries.toFixed(1)}, cost €${o.tankYard.cost.toFixed(0)}`);
console.log(`  Line: need ${o.line.needHours.toFixed(1)} σ ${o.line.sigmaHours.toFixed(1)}, capAdh ${o.line.capacityAdherence.toFixed(3)}, mixer util ${(o.mixer.utilization * 100).toFixed(0)}%, mix ${o.mixer.mixHours.toFixed(1)}h clean ${o.mixer.cleanHours.toFixed(1)}h`);
for (const c of o.components) console.log(`   ${c.key.padEnd(10)} order ${c.orderUnits.toFixed(0)} deliveries ${c.deliveriesPerRound.toFixed(1)} avg ${c.avgStockWeeks.toFixed(2)} wk, ${c.avgLocations.toFixed(1)} ${c.storage}`);
