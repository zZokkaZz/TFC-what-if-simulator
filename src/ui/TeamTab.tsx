// Tab "Nhóm": trạng thái đồng bộ, nhật ký ai sửa gì, bản chụp có tên + so sánh.
import { useState } from 'preact/hooks';
import type { Round0Data } from '../data/types';
import type { Est } from '../model/assumptions';
import type { Results } from '../model/types';
import { simulate } from '../model/simulate';
import type { SyncController, SyncState } from '../sync/controller';
import { DEPTS, DEPT_SHORT, ROLE_LABEL } from '../sync/types';
import { Card, Table } from './components';
import { eur, num, pct } from './format';

export function ago(ms: number | null, now = Date.now()): string {
  if (!ms) return 'đang gửi…';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'vừa xong';
  if (s < 60) return `${s} giây trước`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return new Date(ms).toLocaleString('vi-VN');
}

const STATUS_TEXT = { connecting: 'Đang kết nối…', synced: 'Đã đồng bộ', pending: 'Đang gửi thay đổi…', offline: 'Offline — dùng số đã lưu, có mạng sẽ tự đồng bộ', error: 'Lỗi đồng bộ' } as const;
export const statusText = (s: SyncState) => (s.status === 'error' && s.error ? `Lỗi: ${s.error}` : STATUS_TEXT[s.status]);

interface Props {
  data: Round0Data;
  est: Est;
  ctl: SyncController;
  state: SyncState;
  res: Results;
}

function copyErrors(state: SyncState) {
  const lines = [
    `TFC What-if — lỗi đồng bộ (${new Date().toLocaleString('vi-VN')})`,
    `Vai trò: ${ROLE_LABEL[state.role]} · trạng thái: ${state.status}${state.error ? ' · ' + state.error : ''}`,
    ...DEPTS.map((d) => `Lưu ${DEPT_SHORT[d]}: ${state.saves[d].state}${state.saves[d].message ? ' — ' + state.saves[d].message : ''}`),
    '',
    ...state.errors.map((e) => `[${new Date(e.at).toLocaleString('vi-VN')}] ${e.dept ? DEPT_SHORT[e.dept] + ': ' : ''}${e.text}${e.detail ? ' | ' + e.detail : ''}`),
  ];
  const text = lines.join('\n');
  try { void navigator.clipboard.writeText(text).then(() => alert('Đã copy chi tiết lỗi.')); } catch { prompt('Copy đoạn sau:', text); }
}

export function TeamTab({ data, est, ctl, state, res }: Props) {
  const [name, setName] = useState('');
  const snaps = state.snapshots.slice(0, 6);
  const sims = snaps.map((s) => simulate(ctl.snapshotInputs(s), data, est));
  const sharedRes = state.local ? simulate(state.shared, data, est) : res;
  const cols = [{ label: 'Bản chung hiện tại', r: sharedRes }, ...snaps.map((s, i) => ({ label: s.name, r: sims[i] }))];
  const rows: [string, (r: Results) => string][] = [
    ['ROI', (r) => pct(r.finance.roi, 2)],
    ['Operating profit', (r) => eur(r.finance.operatingProfit)],
    ['Investment', (r) => eur(r.finance.investment)],
    ['Chi phí Ops', (r) => eur(r.ops.productionCost + r.ops.warehouseCost)],
    ['Số ca / overtime', (r) => `${r.ops.line.regularHours} giờ / ${num(r.ops.line.overtime, 1)}`],
    ['Plan adherence', (r) => pct(r.ops.line.planAdherence)],
    ['Overflow kho NL', (r) => eur(r.ops.rm.overflowCost)],
    ['Thời vụ 2 kho', (r) => eur(r.ops.rm.flexCost + r.ops.fg.flexCost)],
  ];

  return (
    <div class="single">
      <Card title="Trạng thái nhóm">
        <div class="metrics">
          <div class="metric"><div class="m-label">Vai trò của bạn</div><div class="m-value">{ROLE_LABEL[state.role]}</div></div>
          <div class="metric"><div class="m-label">Mã đội</div><div class="m-value">{state.team.slice(0, 3)}•••{state.team.slice(-2)}</div></div>
          <div class={`metric${state.status === 'error' ? ' alert' : ''}`}><div class="m-label">Kết nối</div><div class="m-value small">{statusText(state)}</div></div>
          {DEPTS.map((d) => (
            <div class="metric"><div class="m-label">Phần {DEPT_SHORT[d]}</div><div class="m-value small">{state.meta[d] ? `cập nhật ${ago(state.meta[d]!.updatedAt)}` : 'chưa ai sửa (= R0)'}</div></div>
          ))}
        </div>
      </Card>

      <Card title={`Lỗi gần đây (${state.errors.length})`} alert={DEPTS.some((d) => state.saves[d].state === 'error')}
        extra={<span class="row gap">
          <button class="btn small" disabled={!state.errors.length} onClick={() => copyErrors(state)}>Copy chi tiết lỗi</button>
          <button class="btn small" disabled={!state.errors.length} onClick={() => ctl.clearErrors()}>Xóa danh sách</button>
        </span>}>
        <div class="metrics">
          {DEPTS.map((d) => {
            const sv = state.saves[d];
            return (
              <div class={`metric${sv.state === 'error' ? ' alert' : ''}`}>
                <div class="m-label">Lưu phần {DEPT_SHORT[d]}</div>
                <div class="m-value small">{sv.state === 'saved' ? `✔ đã lưu ${ago(sv.at)}` : sv.state === 'pending' ? 'đang gửi…' : sv.state === 'error' ? '✖ chưa lưu' : 'chưa ai sửa (= R0)'}</div>
                {sv.state === 'error' && state.role === d && <button class="btn small" onClick={() => ctl.revertDept(d)}>Bỏ thay đổi chưa lưu</button>}
              </div>
            );
          })}
        </div>
        {state.errors.length === 0 ? <p class="muted">Chưa có lỗi nào trên máy này.</p> : (
          <Table head={['Lúc', 'Phần', 'Lỗi']} rows={state.errors.map((e) => [ago(e.at), e.dept ? DEPT_SHORT[e.dept] : '—', <span title={e.detail ?? ''}>{e.text}</span>])} />
        )}
        <p class="muted">Danh sách chỉ lưu trên máy này (tối đa 30 dòng). Gặp lỗi lạ: bấm "Copy chi tiết lỗi" rồi gửi cho người sửa app.</p>
      </Card>

      <Card title="Bản chụp có tên (snapshot)">
        <div class="row gap">
          <input class="text" value={name} maxLength={80} placeholder="vd: R1 – phương án 1" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
          <button class="btn primary" onClick={() => { void ctl.takeSnapshot(name); setName(''); }}>Chụp lại bản chung</button>
        </div>
        <p class="muted">Bản chụp lưu toàn bộ quyết định của 4 phòng. "Mở" đưa bản chụp vào kịch bản riêng của bạn; muốn khôi phục thì mỗi người bấm "Đẩy lên bản chung" cho phần của mình.</p>
        {snaps.length > 0 && (
          <div class="tbl-wrap">
            <table class="compact">
              <thead><tr><th></th>{cols.map((c) => <th>{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.map(([l, f]) => <tr><td>{l}</td>{cols.map((c) => <td>{f(c.r)}</td>)}</tr>)}
                <tr><td>Chụp lúc</td><td>—</td>{snaps.map((s) => <td>{ago(s.at)} · {ROLE_LABEL[s.role] ?? s.role}</td>)}</tr>
                <tr><td></td><td></td>{snaps.map((s) => (
                  <td class="row gap">
                    <button class="btn small" onClick={() => ctl.openSnapshotLocal(s.id)}>Mở</button>
                    <button class="btn small" onClick={() => { if (confirm(`Xóa bản chụp "${s.name}"?`)) void ctl.deleteSnapshot(s.id); }}>Xóa</button>
                  </td>
                ))}</tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Nhật ký (${state.log.length} dòng gần nhất)`}>
        {state.log.length === 0 ? <p class="muted">Chưa có thay đổi nào.</p> : (
          <Table head={['Lúc', 'Ai', 'Thay đổi']} rows={state.log.map((e) => [ago(e.at), ROLE_LABEL[e.role] ?? e.role, <span title={e.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('\n')}>{e.summary}</span>])} />
        )}
      </Card>

      <Card title="Thử đồng bộ với 2 tab">
        <ol class="muted">
          <li>Mở app ở 2 tab (hoặc 2 máy), cùng mã đội; tab 1 chọn vai trò Operations, tab 2 chọn Supply Chain hoặc Xem.</li>
          <li>Tab 1 đổi "Number of shifts" → sau khoảng 1 giây tab 2 thấy ROI, giờ dây chuyền đổi theo, nhật ký có dòng "Ops đổi số ca 2 → 3".</li>
          <li>Không muốn đụng Firebase: thêm <code>?mock=1</code> vào cuối link (vd <code>index.html?mock=1</code>) → đồng bộ giữa các tab trên cùng máy bằng bộ nhớ trình duyệt.</li>
        </ol>
      </Card>
    </div>
  );
}
