import { useEffect, useMemo, useState } from 'preact/hooks';
import rawData from '../data/round0.json';
import type { Round0Data } from '../data/types';
import type { Inputs, OpsInputs } from '../model/types';
import { baselineInputs, simulate } from '../model/simulate';
import { withEst } from '../model/assumptions';
import type { Dept } from '../sync/types';
import { DEPTS, DEPT_SHORT, ROLE_LABEL } from '../sync/types';
import { loadInputs, loadTab, saveInputs, saveTab } from './state';
import { loadEst, loadSession, saveEst, saveSession, useMockBackend, type Session } from './session';
import { useSync } from './useSync';
import { changedPaths } from './trace';
import { eur, pct, signed } from './format';
import { R0_SOURCE_NOTE, r0TwoSources } from './r0Sources';
import { OpsTab } from './OpsTab';
import { AssumptionsTab, FinanceTab } from './OtherTabs';
import { SalesTab } from './SalesTab';
import { PurchasingTab } from './PurchasingTab';
import { SupplyChainTab } from './SupplyChainTab';
import { DashboardTab } from './DashboardTab';
import { crossWarnings } from '../model/warnings';
import { TeamTab, statusText, ago } from './TeamTab';
import { Gate } from './Gate';

const data = rawData as unknown as Round0Data;
const BASE = baselineInputs(data);

const TABS = [
  { id: 'dash', label: 'Dashboard KPI' },
  { id: 'ops', label: 'Ops' },
  { id: 'sc', label: 'Supply Chain' },
  { id: 'pur', label: 'Purchasing' },
  { id: 'sales', label: 'Sales' },
  { id: 'fin', label: 'Finance' },
  { id: 'team', label: 'Nhóm' },
  { id: 'info', label: 'Giả định & R0' },
] as const;

function Kpi({ label, value, delta, cls, sub, subTitle }: { label: string; value: string; delta?: string; cls?: string; sub?: string; subTitle?: string }) {
  return (
    <div class="kpi">
      <div class="kpi-l">{label}</div>
      <div class="kpi-v">{value}{delta && <span class={`delta ${cls}`}>{delta}</span>}</div>
      {sub && <div class="kpi-s" title={subTitle}>{sub}</div>}
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [gateOpen, setGateOpen] = useState(() => !loadSession());
  const [tab, setTab] = useState<string>(() => loadTab('ops'));
  const [estOver, setEstOver] = useState<Record<string, number>>(() => loadEst());
  const [solo, setSolo] = useState<Inputs>(() => loadInputs(BASE));
  const [statusOpen, setStatusOpen] = useState(false);
  useEffect(() => saveTab(tab), [tab]);
  useEffect(() => saveInputs(solo), [solo]);
  useEffect(() => saveEst(estOver), [estOver]);

  const { ctl, state } = useSync(session, BASE);
  const team = ctl && state ? { ctl, state } : null;
  // Thông báo loại "info" tự ẩn sau 6 giây
  const infoIds = (state?.notices ?? []).filter((n) => n.kind === 'info').map((n) => n.id).join(',');
  useEffect(() => {
    if (!ctl || !infoIds) return;
    const t = setTimeout(() => infoIds.split(',').forEach((id) => ctl.dismissNotice(Number(id))), 6000);
    return () => clearTimeout(t);
  }, [ctl, infoIds]);
  const est = useMemo(() => withEst(estOver), [estOver]);
  const baseRes = useMemo(() => simulate(BASE, data, est), [est]);
  const inputs: Inputs = team ? team.state.local ?? team.state.shared : solo;
  const res = useMemo(() => simulate(inputs, data, est), [inputs, est]);
  const changed = useMemo(() => changedPaths(BASE, inputs), [inputs]);
  const warnings = useMemo(() => crossWarnings(data, BASE, inputs, res, baseRes), [inputs, res, baseRes]);

  const isLocal = !!team?.state.local;
  const editable = (dept: Dept) => !team || isLocal || team.state.role === dept;
  const setDept = (dept: Dept, value: unknown) => {
    if (!team) { setSolo((i) => ({ ...i, [dept]: value }) as Inputs); return; }
    if (team.state.local) team.ctl.editLocal({ ...team.state.local, [dept]: value } as Inputs);
    else team.ctl.editShared(dept, value);
  };
  const setOps = (patch: Partial<OpsInputs>) => setDept('ops', { ...inputs.ops, ...patch });

  const resetAll = () => {
    if (!team) { setSolo(BASE); return; }
    if (isLocal) { team.ctl.editLocal(BASE); return; }
    const role = team.state.role;
    if (role === 'viewer') return;
    if (confirm(`Đưa phần ${DEPT_SHORT[role]} trên BẢN CHUNG về Round 0? Cả nhóm sẽ thấy thay đổi này.`)) team.ctl.editShared(role, structuredClone(BASE[role]));
  };
  const push = async () => {
    if (!team) return;
    const skipped = team.ctl.localDiffDepts().filter((d) => d !== team.state.role);
    if (skipped.length && !confirm(`Chỉ đẩy được phần ${DEPT_SHORT[team.state.role as Dept] ?? ''} của bạn. Số bạn thử ở ${skipped.map((d) => DEPT_SHORT[d]).join(', ')} sẽ bị bỏ. Tiếp tục?`)) return;
    await team.ctl.pushLocal();
  };

  const f = res.finance, fb = baseRes.finance;
  const dRoi = f.roi - fb.roi, dOp = f.operatingProfit - fb.operatingProfit, dInv = f.investment - fb.investment;
  const cls = (x: number, upGood = true) => (Math.abs(x) < 1e-9 ? 'neutral' : (x > 0) === upGood ? 'good' : 'bad');
  const canReset = team ? (isLocal ? changed.length > 0 : team.state.role !== 'viewer' && changedPaths(BASE, inputs).some((p) => p.startsWith(`${team.state.role}.`))) : changed.length > 0;

  if (gateOpen) {
    return <Gate initial={session} onDone={(s) => { saveSession(s); setSession(s); setGateOpen(false); }} onCancel={session ? () => setGateOpen(false) : undefined} />;
  }

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <b>TFC What-if</b>
          <span>Ops + SC + Purchasing + Sales (SL) · {team ? `nhóm${useMockBackend() ? ' (giả lập)' : ''}` : 'một mình'}</span>
        </div>
        <Kpi label="ROI" value={pct(f.roi, 2)} delta={Math.abs(dRoi) > 1e-9 ? signed(dRoi, 'pt', 2) : undefined} cls={cls(dRoi)} sub={`R0 đề bài ${pct(data.finance.totals.roi, 2)}`} />
        <Kpi label="Operating profit" value={eur(f.operatingProfit)} delta={Math.abs(dOp) > 0.5 ? signed(dOp, 'eur') : undefined} cls={cls(dOp)} sub={r0TwoSources(data, 'operatingProfit')} subTitle={R0_SOURCE_NOTE} />
        <Kpi label="Investment" value={eur(f.investment)} delta={Math.abs(dInv) > 0.5 ? signed(dInv, 'eur') : undefined} cls={cls(dInv, false)} />
        <div class="top-actions">
          {team && (
            <>
              {(() => {
                const unsaved = DEPTS.filter((d) => team.state.saves[d].state === 'error');
                const cls = unsaved.length ? 'error' : team.state.status;
                const label = unsaved.length ? `Chưa lưu: ${unsaved.map((d) => DEPT_SHORT[d]).join(', ')}` : statusText(team.state).split(' — ')[0];
                return (
                  <button class={`conn conn-${cls}`} title="Bấm để xem trạng thái lưu và lỗi" onClick={() => setStatusOpen(!statusOpen)}><i />{label} ▾</button>
                );
              })()}
              <button class="chip" title="Đổi vai trò hoặc mã đội" onClick={() => setGateOpen(true)}>{ROLE_LABEL[team.state.role]} ▾</button>
              {isLocal ? (
                <>
                  <span class="chg">Kịch bản riêng{team.state.sharedChangedWhileLocal && ' · bản chung vừa đổi'}</span>
                  <button class="btn primary" disabled={team.state.role === 'viewer'} onClick={() => void push()}>Đẩy lên bản chung</button>
                  <button class="btn" onClick={() => team.ctl.discardLocal()}>Lấy lại bản chung</button>
                </>
              ) : (
                <button class="btn" onClick={() => team.ctl.enterLocal()} title="Thử số trên máy mình, không đổi bản chung">Tách kịch bản riêng</button>
              )}
            </>
          )}
          {!team && <button class="chip" onClick={() => setGateOpen(true)}>Vào nhóm…</button>}
          {changed.length > 0 && <span class="chg">{changed.length} ô khác R0</span>}
          <button class="btn" disabled={!canReset} onClick={resetAll} title={team && !isLocal ? 'Chỉ đặt lại phần của vai trò bạn' : 'Đặt lại mọi quyết định'}>Reset về R0</button>
        </div>
      </header>
      <nav class="tabs" role="tablist">
        {TABS.filter((t) => t.id !== 'team' || team).map((t) => (
          <button role="tab" aria-selected={tab === t.id} class={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      {team && team.state.notices.length > 0 && (
        <div class="toasts" aria-live="polite">
          {team.state.notices.map((n) => (
            <div class={`toast toast-${n.kind}`}>
              <span>{n.text}{n.count > 1 && <b> (×{n.count})</b>}</span>
              <button class="x" aria-label="Đóng" onClick={() => team.ctl.dismissNotice(n.id)}>×</button>
            </div>
          ))}
        </div>
      )}
      {team && statusOpen && (
        <div class="status-panel" role="dialog" aria-label="Trạng thái lưu">
          <div class="sp-head"><b>Trạng thái lưu lên bản chung</b><button class="x" aria-label="Đóng" onClick={() => setStatusOpen(false)}>×</button></div>
          <p class="muted">{statusText(team.state)}</p>
          <table class="compact">
            <tbody>
              {DEPTS.map((d) => {
                const sv = team.state.saves[d];
                return (
                  <tr>
                    <td>{DEPT_SHORT[d]}</td>
                    <td class={sv.state === 'error' ? 'ko' : sv.state === 'saved' ? 'ok' : ''}>
                      {sv.state === 'saved' ? `✔ đã lưu ${ago(sv.at)}` : sv.state === 'pending' ? 'đang gửi…' : sv.state === 'error' ? '✖ chưa lưu' : 'chưa ai sửa (= R0)'}
                    </td>
                    <td>{sv.state === 'error' && <><span class="small-text">{sv.message}</span> {team.state.role === d && <button class="btn small" onClick={() => team.ctl.revertDept(d)}>Bỏ thay đổi chưa lưu</button>}</>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p class="muted">Lỗi gần đây: {team.state.errors.length ? `${team.state.errors.length} lỗi — xem tab Nhóm` : 'không có'}.</p>
          <button class="btn small" onClick={() => { setTab('team'); setStatusOpen(false); }}>Mở tab Nhóm</button>
        </div>
      )}
      <main>
        {tab === 'dash' && <DashboardTab data={data} res={res} baseRes={baseRes} />}
        {tab === 'ops' && <OpsTab data={data} inputs={inputs} base={BASE} res={res} baseRes={baseRes} changed={changed} setOps={setOps} resetOps={() => setDept('ops', structuredClone(BASE.ops))} editable={editable('ops')} lockReason={team && !editable('ops') ? `Bạn đang ở vai trò ${ROLE_LABEL[team.state.role]}: ô của Ops chỉ xem. Bấm "Tách kịch bản riêng" để thử số trên máy mình.` : undefined} est={est} warnings={warnings} />}
        {tab === 'sc' && <SupplyChainTab data={data} inputs={inputs} base={BASE} res={res} baseRes={baseRes} changed={changed} setSc={(v) => setDept('sc', v)} editable={editable('sc')} lockReason={team && !editable('sc') ? `Bạn đang ở vai trò ${ROLE_LABEL[team.state.role]}: ô của Supply Chain chỉ xem. Bấm "Tách kịch bản riêng" để thử số trên máy mình.` : undefined} warnings={warnings} />}
        {tab === 'pur' && <PurchasingTab data={data} inputs={inputs} base={BASE} res={res} baseRes={baseRes} changed={changed} setPur={(v) => setDept('purchasing', v)} editable={editable('purchasing')} lockReason={team && !editable('purchasing') ? `Bạn đang ở vai trò ${ROLE_LABEL[team.state.role]}: ô của Purchasing chỉ xem. Bấm "Tách kịch bản riêng" để thử số trên máy mình.` : undefined} warnings={warnings} />}
        {tab === 'sales' && <SalesTab data={data} res={res} baseRes={baseRes} changed={changed} warnings={warnings} />}
        {tab === 'fin' && <FinanceTab data={data} res={res} baseRes={baseRes} roiR0={data.finance.totals.roi} />}
        {tab === 'team' && team && <TeamTab data={data} est={est} ctl={team.ctl} state={team.state} res={res} />}
        {tab === 'info' && <AssumptionsTab data={data} estOver={estOver} setEstOver={setEstOver} />}
      </main>
      <footer class="foot">Simulator để thử quyết định, không phải engine của game. Số có nhãn <i>ước lượng</i> / <i>hiệu chỉnh R0</i> là giả định — xem tab "Giả định & R0". Dữ liệu: {data.meta.source}.</footer>
    </div>
  );
}
