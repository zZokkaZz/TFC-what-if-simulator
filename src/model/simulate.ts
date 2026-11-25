// Điểm vào duy nhất của model: simulate(inputs, data, est?) → results. Hàm thuần.
import type { Round0Data } from '../data/types';
import type { Inputs, Results } from './types';
import { calibrate, type Calibration } from './calibration';
import { EST, type Est } from './assumptions';
import { simulateOps } from './ops';
import { simulateFinance } from './finance';
import { simulateSupplyChain } from './supplyChain';
import { simulateSales } from './sales';
import { baselineInputs } from './baseline';
import { anchorOps } from './anchor';
import { activeSupplier, COMPONENTS, simulatePurchasing, type ActiveSupplier } from './purchasing';
import type { ComponentKey } from '../data/types';

export { baselineInputs } from './baseline';

const calCache = new WeakMap<Round0Data, Calibration>();
export function getCalibration(data: Round0Data): Calibration {
  let c = calCache.get(data);
  if (!c) { c = calibrate(data); calCache.set(data, c); }
  return c;
}

/** `est`: bộ giả định ước lượng (mặc định EST). Truyền cùng một object để dùng cache baseline. */
const baseOpsCache = new WeakMap<Round0Data, Map<Est, ReturnType<typeof simulateOps>>>();
function baseOps(data: Round0Data, est: Est) {
  let m = baseOpsCache.get(data);
  if (!m) { m = new Map(); baseOpsCache.set(data, m); }
  let b = m.get(est);
  if (!b) { b = simulateOps(baselineInputs(data), data, getCalibration(data), est); m.set(est, b); }
  return b;
}

export function simulate(inputs: Inputs, data: Round0Data, est: Est = EST): Results {
  const cal = getCalibration(data);
  const opsRaw = simulateOps(inputs, data, cal, est);
  const base = baseOps(data, est);
  // Số hiển thị neo vào số đề bài: R0 + (mô hình − mô hình baseline)
  const ops = anchorOps(opsRaw, base, data);
  const sc = simulateSupplyChain(inputs, data, opsRaw, base);
  // M3 Sales: service level TP → penalty → realized revenue
  const sales = simulateSales(data, sc, inputs);
  const rev = sales.realizedRevenue;
  const rev0 = data.finance.totals.realizedRevenue;
  const supOf = (i: Inputs) => Object.fromEntries(COMPONENTS.map((c) => [c, activeSupplier(i, data, c)])) as Record<ComponentKey, ActiveSupplier>;
  const purchasing = simulatePurchasing(data, supOf(inputs), opsRaw.components, supOf(baselineInputs(data)), base.components, rev, rev0);
  const finance = simulateFinance(data, ops, sc, purchasing, sales);
  // V1 "thận trọng": SL = min(phương án B, C) từng SKU → doanh thu thấp hơn hoặc bằng; chỉ doanh thu đổi (Investment giữ nguyên)
  const salesCons = simulateSales(data, { ...sc, products: sc.products.map((p) => ({ ...p, slPiecesEst: p.slPiecesEstCons })) }, inputs);
  const opCons = finance.operatingProfit - (sales.realizedRevenue - salesCons.realizedRevenue);
  const conservative = { sales: salesCons, realizedRevenue: salesCons.realizedRevenue, operatingProfit: opCons, roi: opCons / finance.investment };
  return { ops, opsRaw, sc, purchasing, sales, finance, conservative };
}
