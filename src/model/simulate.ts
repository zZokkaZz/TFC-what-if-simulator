// Điểm vào duy nhất của model: simulate(inputs, data, est?) → results. Hàm thuần.
import type { Round0Data } from '../data/types';
import type { Inputs, Results } from './types';
import { calibrate, type Calibration } from './calibration';
import { EST, type Est } from './assumptions';
import { simulateOps } from './ops';
import { simulateFinance } from './finance';

export { baselineInputs } from './baseline';

const calCache = new WeakMap<Round0Data, Calibration>();
export function getCalibration(data: Round0Data): Calibration {
  let c = calCache.get(data);
  if (!c) { c = calibrate(data); calCache.set(data, c); }
  return c;
}

/** `est`: bộ giả định ước lượng (mặc định EST). Truyền cùng một object để dùng cache baseline. */
export function simulate(inputs: Inputs, data: Round0Data, est: Est = EST): Results {
  const cal = getCalibration(data);
  const ops = simulateOps(inputs, data, cal, est);
  const finance = simulateFinance(data, ops);
  return { ops, finance };
}
