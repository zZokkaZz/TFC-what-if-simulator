// Round 1 thật (data/TFC_Round1.xlsx → src/data/round1.json): dựng bộ quyết định R1 để chạy lại model (backtest).
// "Biết trước NCC": nhập CI, reliability, rejection THẬT của game cho từng NCC (như đội nhập ô "số game" sau Calculate),
// nên phần lệch còn lại là lỗi cấu trúc của model, không phải do đoán NCC mới.
import type { ComponentKey, Round0Data } from '../data/types';
import type { Round1Data } from '../data/round1Types';
import type { Inputs, PM } from './types';
import { baselineInputs } from './baseline';
import { defaultTerms } from './purchasing';

const PM_OF: Record<string, PM> = { none: 'None', 'a little': 'Minimal', minimal: 'Minimal', extensive: 'Extensive' };
const hour = (s: string) => Number((s.match(/\d{1,2}/) ?? ['NaN'])[0]);

export function round1Inputs(data: Round0Data, r1: Round1Data, opts: { gameSupplierActuals: boolean } = { gameSupplierActuals: true }): Inputs {
  const i = structuredClone(baselineInputs(data));
  const o = r1.decisions.ops;
  const pm = PM_OF[o.preventiveMaintenance.toLowerCase()];
  if (!pm) throw new Error(`PM "${o.preventiveMaintenance}" chưa ánh xạ`);
  Object.assign(i.ops, {
    rmPalletLocations: o.rmPalletLocations, rmFte: o.rmFte, intakeDays: o.intakeDays, preventiveMaintenance: pm, breakdownTraining: o.breakdownTraining,
    bottlingLine: o.bottlingLine, shifts: o.shifts, smed: o.smed, increaseSpeed: o.increaseSpeed, fgPalletLocations: o.fgPalletLocations, fgFte: o.fgFte,
  });
  for (const [sup, on] of Object.entries(o.rmInspection)) {
    const c = (Object.keys(r1.decisions.purchasing) as ComponentKey[]).find((k) => r1.decisions.purchasing[k].supplier === sup);
    if (c) i.ops.rmInspection[c] = on;
  }
  i.sc = structuredClone(r1.decisions.sc);
  for (const c of Object.keys(r1.decisions.purchasing) as ComponentKey[]) {
    const d = r1.decisions.purchasing[c];
    i.purchasing.suppliers[c] = d.supplier;
    const t = defaultTerms(data, c, d.supplier);
    i.purchasing.terms[c] = {
      ...t, transport: d.transport, tradeUnit: d.tradeUnit, quality: d.quality, deliveryWindow: d.deliveryWindow, paymentTermWeeks: d.paymentTermWeeks, agreedReliability: d.agreedReliability,
      ciGame: opts.gameSupplierActuals ? d.contractIndex : null,
      reliabilityActual: opts.gameSupplierActuals ? r1.suppliers[c].reliability : null,
      rejectionActual: opts.gameSupplierActuals ? r1.suppliers[c].rejection : null,
    };
  }
  for (const [name, d] of Object.entries(r1.decisions.sales.customers)) {
    const t = i.sales.customers[name];
    if (!t) throw new Error(`Khách "${name}" không có trong R0`);
    Object.assign(t, {
      serviceLevelType: d.serviceLevelType, serviceLevel: d.serviceLevel, shelfLife: d.shelfLife, paymentTermWeeks: d.paymentTermWeeks,
      promotionalPressure: d.promotionalPressure, promotionHorizon: d.promotionHorizon, tradeUnit: d.tradeUnit,
      orderDeadline: hour(d.orderDeadline) === hour(t.orderDeadline) ? t.orderDeadline : d.orderDeadline,
      ciGame: Math.abs(d.contractIndex - (data.sales.contracts.find((k) => k.customer === name)?.contractIndex ?? NaN)) < 1e-9 ? null : d.contractIndex,
    });
  }
  i.sales.shortageRule = r1.decisions.sales.shortageRule;
  if (r1.decisions.sales.customerPriority.length === i.sales.customerPriority.length) i.sales.customerPriority = [...r1.decisions.sales.customerPriority];
  return i;
}
