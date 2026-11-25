// Các tab chưa có quyết định trong M1: hiển thị dữ liệu Round 0 thô (M0) + P&L + giả định.
import type { Round0Data } from '../data/types';
import type { Results, RoiNode } from '../model/types';
import { dataChecks } from '../model/dataChecks';
import { ASSUMPTIONS, EDITABLE_EST, EST } from '../model/assumptions';
import { getCalibration } from '../model/simulate';
import { Badge, Card, Table } from './components';
import { eur, num, pct, signed } from './format';
import { R0_SOURCE_NOTE, r0TwoSources } from './r0Sources';



const STATUS_BADGE: Record<RoiNode['status'], [string, string, string]> = {
  modeled: ['mô hình', 'badge-model', 'Tính từ quyết định trong app'],
  r0: ['số R0', 'badge-r0', 'Giữ nguyên số Round 0 — chưa mô hình hóa (M2–M4)'],
  mixed: ['một phần', 'badge-calibrated', 'Có dòng tính từ model, có dòng giữ số R0'],
  missing: ['thiếu dữ liệu', 'badge-estimate', 'File Excel không có số này'],
};

function RoiRows({ n, base, depth, upGood }: { n: RoiNode; base: Map<string, number | null>; depth: number; upGood: boolean }) {
  const b = base.get(n.id) ?? null;
  const d = n.value !== null && b !== null ? n.value - b : 0;
  const [txt, cls, title] = STATUS_BADGE[n.status];
  return (
    <>
      <tr class={depth === 0 ? 'total' : depth === 1 ? 'sub' : ''}>
        <td style={{ paddingLeft: `${8 + depth * 18}px` }}>{n.label} <span class={`badge ${cls}`} title={title}>{txt}</span>{n.note && <div class="small-text">{n.note}</div>}</td>
        <td>{n.r0 === null ? '—' : eur(n.r0)}</td>
        <td>{n.value === null ? '—' : eur(n.value)}</td>
        <td>{Math.abs(d) > 0.5 ? <span class={(d > 0) === upGood ? 'good' : 'bad'}>{signed(d, 'eur')}</span> : ''}</td>
      </tr>
      {n.children && (depth < 2 || n.id === "pt") && n.children.map((c) => <RoiRows n={c} base={base} depth={depth + 1} upGood={upGood} />)}
    </>
  );
}

function flatNodes(n: RoiNode, out = new Map<string, number | null>()) { out.set(n.id, n.value); n.children?.forEach((c) => flatNodes(c, out)); return out; }

export function RoiBreakdownCard({ res, baseRes, roiR0 }: { res: Results; baseRes: Results; roiR0: number }) {
  const b = res.finance.breakdown, bb = baseRes.finance.breakdown;
  const base = flatNodes(bb.investment, flatNodes(bb.operatingProfit));
  return (
    <Card title="Phân rã ROI = Operating profit ÷ Investment">
      <div class="roi-formula">
        <span class="big">{pct(b.roi, 2)}</span> = <span>{eur(res.finance.operatingProfit)}</span> ÷ <span>{eur(res.finance.investment)}</span>
        <span class="muted"> · R0 đề bài {pct(roiR0, 2)}</span>
      </div>
      <div class="tbl-wrap">
        <table class="pnl">
          <thead><tr><th>Khoản mục</th><th>R0 thật</th><th>Kịch bản</th><th>Δ vs baseline</th></tr></thead>
          <tbody>
            <RoiRows n={b.operatingProfit} base={base} depth={0} upGood />
            <RoiRows n={b.investment} base={base} depth={0} upGood={false} />
          </tbody>
        </table>
      </div>
      <p class="muted">Chi phí ghi dấu âm trong cây (COGS, operating expense) để cộng thẳng ra Operating profit. Nhãn <b>số R0</b> = chưa phụ thuộc quyết định nào trong app (contracted sales, overhead, phí phân phối, AR… sẽ mô hình ở M3 Sales (hợp đồng) / M4; đã nối: Ops, tồn kho SC, Purchasing, penalty service level); <b>thiếu dữ liệu</b> = file không có số tách riêng.</p>
    </Card>
  );
}

export function FinanceTab({ data, res, baseRes, roiR0 }: { data: Round0Data; res: Results; baseRes: Results; roiR0: number }) {
  const f = res.finance;
  const baseById = new Map(baseRes.finance.rows.map((r) => [r.id, r.value]));
  const gameOf = (label: string): number | null | undefined =>
    label === 'Operating profit' ? data.finance.gamePrinted?.operatingProfit ?? null : label === 'Indirect cost' ? data.finance.gamePrinted?.indirectCost ?? null : undefined;
  return (
    <div class="single">
      <RoiBreakdownCard res={res} baseRes={baseRes} roiR0={roiR0} />
      <Card title="Nguồn số R0: Operating profit & Indirect cost">
        <ul class="r0-sources">
          <li>Operating profit — {r0TwoSources(data, 'operatingProfit')}</li>
          <li>Indirect cost — {r0TwoSources(data, 'indirectCost')}</li>
        </ul>
        <p class="muted">{R0_SOURCE_NOTE}</p>
      </Card>
      <Card title="P&L Round 0 → kịch bản">
        <p class="muted">Dòng có nhãn <b>mô hình</b> tính từ quyết định Ops (M1), Supply Chain (M2: Stock, Interest), Purchasing (M3: mua NL, Inbound orders, Payment terms) và Sales (M3: Penalty service level — ước lượng theo SL dự kiến); dòng <Badge basis="r0" /> giữ nguyên số Round 0 (contracted sales, overhead, phân phối… — M3 hợp đồng Sales / M4). Cột "R0 thật" của dòng TỔNG là tổng dòng sheet; dòng nhỏ bên dưới là số game in. Dòng đổi so với baseline được tô vàng.</p>
        <div class="tbl-wrap">
          <table class="pnl">
            <thead><tr><th>Nhóm</th><th>Dòng</th><th>R0 thật</th><th>Baseline mô hình</th><th>Kịch bản</th><th>Δ vs baseline</th></tr></thead>
            <tbody>
              {f.rows.map((r) => {
                const bv = baseById.get(r.id) ?? 0;
                const d = r.value - bv;
                const changed = Math.abs(d) > 0.5;
                return (
                  <tr class={`${r.isTotal ? 'total' : ''} ${changed ? 'changed' : ''}`}>
                    <td>{r.group}</td>
                    <td>{r.label} {!r.isTotal && (r.modeled ? <span class="badge badge-model">mô hình</span> : <Badge basis="r0" />)}</td>
                    <td>{r.r0 === null ? '' : eur(r.r0)}{r.isTotal && gameOf(r.label) !== undefined && <div class="m-r0" title={R0_SOURCE_NOTE}>game in: {gameOf(r.label) === null ? 'thiếu dữ liệu' : eur(gameOf(r.label)!)}</div>}</td>
                    <td>{eur(bv)}</td>
                    <td>{eur(r.value)}</td>
                    <td>{changed ? <span class={(d < 0) === /revenue|margin|profit/i.test(r.label) ? 'bad' : 'good'}>{signed(d, 'eur')}</span> : ''}</td>
                  </tr>
                );
              })}
              <tr class="total"><td>TỔNG</td><td>ROI</td><td>{pct(roiR0, 2)}</td><td>{pct(baseRes.finance.roi, 2)}</td><td>{pct(f.roi, 2)}</td><td>{signed(f.roi - baseRes.finance.roi, 'pt', 2)}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const estDefault = (path: string): number => {
  const [a, b] = path.split('.');
  const v = (EST as unknown as Record<string, unknown>)[a];
  return b ? (v as Record<string, number>)[b] : (v as number);
};

export function AssumptionsTab({ data, estOver, setEstOver }: { data: Round0Data; estOver: Record<string, number>; setEstOver: (f: (o: Record<string, number>) => Record<string, number>) => void }) {
  const cal = getCalibration(data);
  const anyOver = Object.keys(estOver).length > 0;
  return (
    <div class="single">
      <Card title="Chỉnh giả định ước lượng (chỉ trên máy bạn)" extra={<button class="btn small" disabled={!anyOver} onClick={() => setEstOver(() => ({}))}>Về mặc định</button>}>
        <p class="muted">Các hệ số này không có trong luật game. Đổi ở đây chỉ ảnh hưởng máy của bạn (đồng đội vẫn dùng mặc định) và chỉ đổi độ nhạy khi thử kịch bản — baseline R0 không đổi.</p>
        <div class="est-grid">
          {EDITABLE_EST.map((e) => {
            const def = estDefault(e.path);
            const v = estOver[e.path] ?? def;
            return (
              <label class={`field${estOver[e.path] !== undefined ? ' changed' : ''}`}>
                <span class="f-label">{e.label}</span>
                <input type="number" value={v} min={e.min} max={e.max} step={e.step}
                  onInput={(ev) => {
                    const x = Number((ev.currentTarget as HTMLInputElement).value);
                    if (!Number.isFinite(x)) return;
                    const c = Math.min(e.max, Math.max(e.min, x));
                    setEstOver((o) => { const n = { ...o }; if (Math.abs(c - def) < 1e-12) delete n[e.path]; else n[e.path] = c; return n; });
                  }} />
                <span class="f-hint">Mặc định {num(def, 2)}</span>
              </label>
            );
          })}
        </div>
      </Card>
      <DataCheckCard data={data} />
      <Card title="Hệ số hiệu chỉnh (tự tính từ số Round 0)">
        <Table head={['Hệ số', 'Giá trị', 'Cách tính', 'Chỉ số khớp R0 do cấu tạo']} rows={cal.notes.map((n) => [n.label, n.value, n.derivation, n.matchesByConstruction.join(', ') || '—'])} />
      </Card>
      <Card title="Giả định ước lượng (không có trong luật game)">
        <Table head={['Giả định', 'Đang dùng', 'Vì sao là ước lượng']} rows={ASSUMPTIONS.map((a) => [a.label, a.value, a.why])} />
        <p class="muted">Chi tiết đầy đủ: file ASSUMPTIONS.md trong repo.</p>
      </Card>
      <Card title="Vấn đề Round 0 (tab 1)">
        <Table head={['#', 'Vấn đề', 'Bằng chứng', 'Phòng', 'Liên quan Ops']} rows={data.issues.map((i) => [i.no, i.issue, i.evidence, i.owner, i.opsLink ?? ''])} />
      </Card>
      <Card title="Luật game (Info Center)">
        <Table head={['Chủ đề', 'Luật', 'Ảnh hưởng tới Ops']} rows={data.rules.map((r) => [r.topic, r.rule, r.opsImpact ?? ''])} />
      </Card>
      <Card title="Định mức Operations">
        <Table head={['Khu vực', 'Công việc', 'Định mức']} rows={data.ops.norms.map((n) => [n.area, n.task, n.norm])} />
      </Card>
      <Card title="Viết tắt">
        <Table head={['Thuật ngữ', 'Đầy đủ', 'Giải thích']} rows={data.glossary.map((g) => [g.term, g.full, g.explain])} />
      </Card>
      <p class="muted">Dữ liệu: {data.meta.source} · sinh lúc {new Date(data.meta.generatedAt).toLocaleString('vi-VN')} · tab: {data.meta.sheets.join(', ')}</p>
    </div>
  );
}

export function DataCheckCard({ data }: { data: Round0Data }) {
  const checks = dataChecks(data);
  const bad = checks.filter((c) => !c.ok).length;
  const f = (c: { unit: string }, v: number) => (c.unit === '%' ? pct(v, 2) : c.unit === '€' ? eur(v) : num(v));
  return (
    <Card title={`Kiểm tra dữ liệu Excel (${checks.length - bad}/${checks.length} khớp)`} alert={bad > 0}>
      <p class="muted">Đối chiếu các tổng <b>trong chính file Excel</b> với nhau (chưa dùng model). Sau khi thay file vòng mới, mọi dòng phải ✔ trước khi tin kết quả của app. Dữ liệu: {data.meta.source}, đọc lúc {new Date(data.meta.generatedAt).toLocaleString('vi-VN')}.</p>
      <Table head={['Kiểm tra', 'Vế 1', 'Vế 2', '']} rows={checks.map((c) => [
        c.label,
        <span>{c.a.name}: <b>{f(c, c.a.value)}</b></span>,
        <span>{c.b.name}: <b>{f(c, c.b.value)}</b></span>,
        c.ok ? <span class="ok">✔</span> : <span class="ko">✖ lệch {f(c, c.a.value - c.b.value)}</span>,
      ])} />
    </Card>
  );
}
