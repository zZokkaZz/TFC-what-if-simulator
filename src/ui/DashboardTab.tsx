// Dashboard KPI từng phòng (giống dashboard trong game) — số to, chạy khi đổi, mũi tên/màu tốt-xấu,
// xu hướng R-2 → R-1 → R0 → kịch bản. Chỉ số không có trong sheet ghi "thiếu dữ liệu".
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Round0Data } from '../data/types';
import type { Results } from '../model/types';
import { buildKpis, roleScores, type Kpi, type KpiDept } from '../model/kpi';
import { eur, num, pct, signed } from './format';
import { CONSERVATIVE_NOTE, conservativeRoiText } from './conservative';

const fmt = (u: Kpi['unit'], v: number, big = false) => (u === 'pct' ? pct(v, 1) : u === 'eur' ? eur(v) : u === 'weeks' ? `${num(v, 2)}${big ? '' : ' tuần'}` : num(v, 4));

/** Số chạy từ giá trị cũ tới giá trị mới (~600 ms) + nháy màu khi đổi. */
function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('');
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current, to = value;
    if (Math.abs(to - from) < 1e-12) return;
    setFlash(to > from ? 'up' : 'down');
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step); else { prev.current = to; setTimeout(() => setFlash(''), 500); }
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); prev.current = to; };
  }, [value]);
  return <span class={`anum ${flash ? `flash-${flash}` : ''}`}>{format(shown)}</span>;
}

function Spark({ k }: { k: Kpi }) {
  const pts = [k.rMinus2.value, k.rMinus1.value, k.r0.value, k.scenario];
  const vals = pts.filter((x): x is number => x !== null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || Math.abs(hi) * 0.05 || 1;
  const W = 150, H = 40, x = (i: number) => 8 + i * ((W - 16) / 3), y = (v: number) => 6 + (H - 12) * (1 - (v - (lo - span * 0.15)) / (span * 1.3));
  const path = pts.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
  return (
    <svg class="spark" viewBox={`0 0 ${W} ${H + 12}`} aria-label="Xu hướng R-2, R-1, R0, kịch bản">
      <polyline points={path.join(' ')} fill="none" class="sp-line" />
      {pts.map((v, i) => (v === null ? <text x={x(i)} y={H / 2} class="sp-miss" text-anchor="middle">?</text> : <circle cx={x(i)} cy={y(v)} r={i === 3 ? 4.5 : 3} class={i === 3 ? 'sp-now' : 'sp-dot'} />))}
      {['R-2', 'R-1', 'R0', 'Mới'].map((l, i) => <text x={x(i)} y={H + 10} class="sp-lbl" text-anchor="middle">{l}</text>)}
    </svg>
  );
}

function Tile({ k }: { k: Kpi }) {
  const r0 = k.r0.value;
  const v = k.scenario;
  const d = v !== null && r0 !== null ? v - r0 : 0;
  const moved = Math.abs(d) > (k.unit === 'eur' ? 0.5 : 1e-6);
  const better = k.good === 'none' ? null : (d > 0) === (k.good === 'up');
  const cls = !moved ? 'same' : better === null ? 'neutral' : better ? 'better' : 'worse';
  const vsTarget = k.target && v !== null ? v >= k.target.value : null;
  return (
    <div class={`kpi-tile ${cls}`}>
      <div class="kt-label">{k.label}</div>
      <div class="kt-value">
        {v === null ? <span class="missing">thiếu dữ liệu</span> : <AnimatedNumber value={v} format={(x) => fmt(k.unit, x, true)} />}
        {k.unit === 'weeks' && v !== null && <span class="kt-unit">tuần</span>}
      </div>
      <div class="kt-delta">
        {moved ? (() => {
          const txt = k.unit === 'pct' ? signed(d, 'pt') : k.unit === 'eur' ? signed(d, 'eur') : signed(d, 'num', 2);
          // Chênh lệch làm tròn về 0 → không vẽ mũi tên (tránh "▲ ±0,0")
          return <span class={`arrow ${txt.startsWith('±') ? 'neutral' : cls}`}>{txt.startsWith('±') ? '≈' : d > 0 ? '▲' : '▼'} {txt}</span>;
        })() : <span class="muted">= R0 (chưa đổi)</span>}
        {k.scenarioBasis !== 'model' && <span class={`badge ${k.scenarioBasis === 'estimate' ? 'badge-estimate' : 'badge-r0'}`} title={k.scenarioBasis === 'estimate' ? 'Thay đổi theo kịch bản là ước lượng' : 'Chưa mô hình — giữ số R0'}>{k.scenarioBasis === 'estimate' ? 'ước lượng' : 'chưa mô hình'}</span>}
      </div>
      {k.target && v !== null && (
        <div class="kt-target">
          <div class="bar"><i style={{ width: `${Math.min(100, (v / k.target.value) * 100)}%` }} class={vsTarget ? 'ok' : 'ko'} /></div>
          <span class={vsTarget ? 'ok' : 'ko'}>{vsTarget ? '✔ đạt' : '✖ chưa đạt'} mục tiêu {fmt(k.unit, k.target.value)}</span>
          <span class="small-text"> ({k.target.source})</span>
        </div>
      )}
      <Spark k={k} />
      <div class="kt-src">
        R-2: {k.rMinus2.value === null ? <span class="missing" title={k.rMinus2.source}>thiếu</span> : fmt(k.unit, k.rMinus2.value)} · R-1: {k.rMinus1.value === null ? <span class="missing" title={k.rMinus1.source}>thiếu</span> : fmt(k.unit, k.rMinus1.value)} · R0: {r0 === null ? <span class="missing">thiếu</span> : <b>{fmt(k.unit, r0)}</b>}
        <div class="small-text" title={[k.rMinus2.source, k.rMinus1.source, k.r0.source].join('\n')}>Nguồn R0: {k.r0.source}</div>
      </div>
      {k.comment && <div class="kt-comment">💬 Game: “{k.comment}”</div>}
    </div>
  );
}

const DEPTS: KpiDept[] = ['Purchasing', 'Operations', 'Sales', 'Supply Chain'];

export function DashboardTab({ data, res, baseRes }: { data: Round0Data; res: Results; baseRes: Results }) {
  const kpis = buildKpis(data, res, baseRes);
  const roi = kpis.find((k) => k.id === 'roi')!;
  const scores = roleScores(data, res, baseRes);
  const missing = kpis.flatMap((k) => [k.rMinus2, k.rMinus1, k.r0].filter((p) => p.value === null).map((p) => `${k.dept} · ${k.label}: ${p.source.replace(/^Thiếu dữ liệu: /, '')}`));
  return (
    <div class="single">
      <section class="card dash-hero">
        <div class="dh-left">
          <div class="kt-label">ROI công ty (chỉ số xếp hạng chung)</div>
          <div class="dh-roi"><AnimatedNumber value={roi.scenario ?? 0} format={(x) => pct(x, 2)} />{conservativeRoiText(res, baseRes) && <span class="kpi-extra" title={CONSERVATIVE_NOTE}> {conservativeRoiText(res, baseRes)}</span>}</div>
          <div class="kt-delta">
            {Math.abs((roi.scenario ?? 0) - (roi.r0.value ?? 0)) > 1e-7
              ? <span class={`arrow ${(roi.scenario ?? 0) > (roi.r0.value ?? 0) ? 'better' : 'worse'}`}>{(roi.scenario ?? 0) > (roi.r0.value ?? 0) ? '▲' : '▼'} {signed((roi.scenario ?? 0) - (roi.r0.value ?? 0), 'pt', 2)} so với R0 ({pct(roi.r0.value ?? 0, 2)})</span>
              : <span class="muted">= R0 đề bài {pct(roi.r0.value ?? 0, 2)}</span>}
          </div>
          <div class="small-text">ROI = Operating profit {eur(res.finance.operatingProfit)} ÷ Investment {eur(res.finance.investment)}</div>
          {roi.comment && <div class="kt-comment">💬 Game: “{roi.comment}”</div>}
        </div>
        <Spark k={roi} />
      </section>

      <div class="dash-grid">
        {DEPTS.map((dept) => (
          <section class="card dash-dept">
            <header class="card-h"><h3>{dept}</h3><span class="muted">dashboard như trong game</span></header>
            <div class="kt-grid">{kpis.filter((k) => k.dept === dept).map((k) => <Tile k={k} />)}</div>
            {(() => {
              const s = scores.find((x) => x.dept === dept)!;
              const d = s.scenario - s.r0;
              const moved = Math.abs(d) > (s.unit === 'eur' ? 0.5 : 1e-9);
              const better = (d > 0) === (s.good === 'up');
              const f = (v: number) => (s.unit === 'pct' ? pct(v, 2) : s.unit === 'eur' ? eur(v) : num(v, 4));
              return (
                <div class={`role-score ${moved ? (better ? 'better' : 'worse') : 'same'}`}>
                  <b>Điểm phòng (theo luật game):</b> <AnimatedNumber value={s.scenario} format={f} />
                  {moved ? (() => {
                    const txt = s.unit === 'pct' ? signed(d, 'pt', 2) : s.unit === 'eur' ? signed(d, 'eur') : signed(d, 'num', 4);
                    return <span class={`arrow ${txt.startsWith('±') ? 'neutral' : better ? 'better' : 'worse'}`}> {txt.startsWith('±') ? '≈' : d > 0 ? '▲' : '▼'} {txt}</span>;
                  })() : <span class="muted"> = R0</span>}
                  <span class="muted"> · {s.good === 'down' ? 'thấp là tốt' : 'cao là tốt'}</span>
                  <div class="small-text">{s.note}</div>
                </div>
              );
            })()}
          </section>
        ))}
      </div>

      <section class="card">
        <header class="card-h"><h3>Số dashboard còn thiếu trong sheet ({missing.length})</h3></header>
        <p class="muted">App KHÔNG tự điền các ô này. Muốn có đủ đường xu hướng như game, bổ sung vào sheet (gợi ý: mỗi tab phòng ban một bảng "DASHBOARD" giống tab 7 dòng 48–53: KPI | Round -2 | Round -1 | Round 0 | Nhận xét của game) rồi upload lại file.</p>
        <ul class="missing-list">{missing.map((m) => <li>{m}</li>)}</ul>
        <p class="muted">Nhận xét của game hiện chỉ có trong sheet cho dashboard Supply Chain (tab 7). Nhận xét Purchasing / Operations / Sales (như trong ảnh game) chưa có trong sheet.</p>
      </section>
    </div>
  );
}
