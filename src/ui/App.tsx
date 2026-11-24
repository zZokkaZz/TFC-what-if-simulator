import { useEffect, useMemo, useState } from 'preact/hooks';
import rawData from '../data/round0.json';
import type { Round0Data } from '../data/types';
import type { Inputs, OpsInputs } from '../model/types';
import { baselineInputs, simulate } from '../model/simulate';
import { loadInputs, loadTab, saveInputs, saveTab } from './state';
import { changedPaths } from './trace';
import { eur, pct, signed } from './format';
import { OpsTab } from './OpsTab';
import { AssumptionsTab, FinanceTab, PurchasingTab, SalesTab, SupplyChainTab } from './OtherTabs';

const data = rawData as unknown as Round0Data;
const BASE = baselineInputs(data);
const BASE_RES = simulate(BASE, data);

const TABS = [
  { id: 'ops', label: 'Ops' },
  { id: 'sc', label: 'Supply Chain' },
  { id: 'pur', label: 'Purchasing' },
  { id: 'sales', label: 'Sales' },
  { id: 'fin', label: 'Finance' },
  { id: 'info', label: 'Giả định & R0' },
] as const;

function Kpi({ label, value, delta, cls, sub }: { label: string; value: string; delta?: string; cls?: string; sub?: string }) {
  return (
    <div class="kpi">
      <div class="kpi-l">{label}</div>
      <div class="kpi-v">{value}{delta && <span class={`delta ${cls}`}>{delta}</span>}</div>
      {sub && <div class="kpi-s">{sub}</div>}
    </div>
  );
}

export function App() {
  const [inputs, setInputs] = useState<Inputs>(() => loadInputs(BASE));
  const [tab, setTab] = useState<string>(() => loadTab('ops'));
  useEffect(() => saveInputs(inputs), [inputs]);
  useEffect(() => saveTab(tab), [tab]);

  const res = useMemo(() => simulate(inputs, data), [inputs]);
  const changed = useMemo(() => changedPaths(BASE, inputs), [inputs]);
  const f = res.finance, fb = BASE_RES.finance;
  const dRoi = f.roi - fb.roi, dOp = f.operatingProfit - fb.operatingProfit, dInv = f.investment - fb.investment;
  const cls = (x: number, upGood = true) => (Math.abs(x) < 1e-9 ? 'neutral' : (x > 0) === upGood ? 'good' : 'bad');

  const setOps = (patch: Partial<OpsInputs>) => setInputs((i) => ({ ...i, ops: { ...i.ops, ...patch } }));

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <b>TFC What-if</b>
          <span>Round 0 baseline · M1 (Ops)</span>
        </div>
        <Kpi label="ROI (mô hình)" value={pct(f.roi, 2)} delta={Math.abs(dRoi) > 1e-9 ? signed(dRoi, 'pt', 2) : undefined} cls={cls(dRoi)} sub={`R0 thật ${pct(data.finance.totals.roi, 2)} · baseline mô hình ${pct(fb.roi, 2)}`} />
        <Kpi label="Operating profit" value={eur(f.operatingProfit)} delta={Math.abs(dOp) > 0.5 ? signed(dOp, 'eur') : undefined} cls={cls(dOp)} />
        <Kpi label="Investment" value={eur(f.investment)} delta={Math.abs(dInv) > 0.5 ? signed(dInv, 'eur') : undefined} cls={cls(dInv, false)} />
        <div class="top-actions">
          {changed.length > 0 && <span class="chg">{changed.length} quyết định khác R0</span>}
          <button class="btn" disabled={changed.length === 0} onClick={() => setInputs(BASE)}>Reset về Round 0</button>
        </div>
      </header>
      <nav class="tabs" role="tablist">
        {TABS.map((t) => (
          <button role="tab" aria-selected={tab === t.id} class={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      <main>
        {tab === 'ops' && <OpsTab data={data} inputs={inputs} base={BASE} res={res} baseRes={BASE_RES} changed={changed} setOps={setOps} resetOps={() => setInputs((i) => ({ ...i, ops: structuredClone(BASE.ops) }))} />}
        {tab === 'sc' && <SupplyChainTab data={data} />}
        {tab === 'pur' && <PurchasingTab data={data} />}
        {tab === 'sales' && <SalesTab data={data} />}
        {tab === 'fin' && <FinanceTab res={res} baseRes={BASE_RES} roiR0={data.finance.totals.roi} />}
        {tab === 'info' && <AssumptionsTab data={data} />}
      </main>
      <footer class="foot">Simulator để thử quyết định, không phải engine của game. Số có nhãn <i>ước lượng</i> / <i>hiệu chỉnh R0</i> là giả định — xem tab "Giả định & R0". Dữ liệu: {data.meta.source}.</footer>
    </div>
  );
}
