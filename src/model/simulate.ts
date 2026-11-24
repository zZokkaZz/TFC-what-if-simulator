// Điểm vào duy nhất của model: simulate(inputs, data, est?) → results. Hàm thuần.
import type { Round0Data } from '../data/types';
import type { Inputs, Results } from './types';
import { calibrate, type Calibration } from './calibration';
import { EST, type Est } from './assumptions';
import { simulateOps } from './ops';
import { simulateFinance } from './finance';
import { simulateSupplyChain } from './supplyChain';
import { baselineInputs } from './baseline';

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
  const ops = simulateOps(inputs, data, cal, est);
  const sc = simulateSupplyChain(inputs, data, ops, baseOps(data, est));
  const finance = simulateFinance(data, ops, sc);
  return { ops, sc, finance };
}
