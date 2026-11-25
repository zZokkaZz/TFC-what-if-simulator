// Biểu đồ SVG/HTML thuần, không thư viện. Màu theo bảng palette đã kiểm tra (xem styles.css: --s1..--s4).
import { useState } from 'preact/hooks';
import { num } from './format';

export interface LineBar {
  name: string;
  run: number;
  changeover: number;
  breakdown: number;
  maintenance: number;
  unused: number;
  overtime: number;
  outsourced: number;
  regular: number;
}

const SEGS = [
  { key: 'run', label: 'Run', cls: 's1' },
  { key: 'changeover', label: 'Changeover', cls: 's2' },
  { key: 'breakdown', label: 'Breakdown', cls: 's3' },
  { key: 'maintenance', label: 'Bảo trì (PM)', cls: 's4' },
  { key: 'unused', label: 'Unused', cls: 'sn' },
] as const;

/** Giờ dây chuyền/tuần: thanh xếp chồng, vạch đứt = giờ ca; phần vượt vạch = overtime. */
export function LineHoursChart({ bars }: { bars: LineBar[] }) {
  const [tip, setTip] = useState<string | null>(null);
  const max = Math.max(...bars.map((b) => b.run + b.changeover + b.breakdown + b.maintenance + b.unused), ...bars.map((b) => b.regular), 1) * 1.05;
  return (
    <div class="linechart">
      <div class="legend">
        {SEGS.map((s) => <span class="lg"><i class={`sw ${s.cls}`} />{s.label}</span>)}
        <span class="lg"><i class="sw-line" />Giờ ca (phần vượt = overtime)</span>
      </div>
      {bars.map((b) => {
        const total = b.run + b.changeover + b.breakdown + b.maintenance + b.unused;
        return (
          <div class="lc-row">
            <div class="lc-name">{b.name}</div>
            <div class="lc-track">
              <div class="lc-bar">
                {SEGS.map((s) => {
                  const v = b[s.key];
                  if (v <= 0.01) return null;
                  return (
                    <div
                      class={`seg ${s.cls}`}
                      style={{ width: `${(v / max) * 100}%` }}
                      onMouseEnter={() => setTip(`${b.name} · ${s.label}: ${num(v, 1)} giờ/tuần (${num((v / total) * 100, 1)}%)`)}
                      onMouseLeave={() => setTip(null)}
                      title={`${s.label}: ${num(v, 1)} giờ/tuần`}
                    />
                  );
                })}
              </div>
              <div class="lc-cap" style={{ left: `${(b.regular / max) * 100}%` }} title={`Giờ ca: ${b.regular}`} />
            </div>
            <div class="lc-total">
              {num(total, 1)} h{b.overtime > 0.05 && <span class="ot"> · OT {num(b.overtime, 1)}</span>}
              {b.outsourced > 0.05 && <span class="ot"> · thuê ngoài {num(b.outsourced, 1)}</span>}
            </div>
          </div>
        );
      })}
      <div class="tip" aria-live="polite">{tip ?? 'Rê chuột lên thanh để xem chi tiết'}</div>
      <div class="tbl-wrap">
        <table class="compact">
          <thead><tr><th>giờ/tuần</th>{SEGS.map((s) => <th>{s.label}</th>)}<th>Overtime</th><th>Giờ ca</th></tr></thead>
          <tbody>
            {bars.map((b) => (
              <tr><td>{b.name}</td>{SEGS.map((s) => <td>{num(b[s.key], 1)}</td>)}<td>{num(b.overtime, 1)}</td><td>{b.regular}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Chuỗi 130 ngày: cột theo ngày + đường ngưỡng (giờ công cố định hoặc số pallet location). */
export function DailyChart({ values, limit, unit, limitLabel, height = 120 }: { values: number[]; limit: number; unit: string; limitLabel: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 650, H = height, padL = 34, padB = 16, padT = 6;
  const max = Math.max(limit * 1.1, ...values) || 1;
  const bw = (W - padL) / values.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, max / 2, max].map((t) => Math.round(t));
  return (
    <div class="daily">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${unit} theo ngày`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} class="grid" />
            <text x={padL - 4} y={y(t) + 3} class="axis" text-anchor="end">{num(t)}</text>
          </g>
        ))}
        {values.map((v, i) => (
          <rect
            x={padL + i * bw + 0.5}
            y={y(v)}
            width={Math.max(0.5, bw - 1)}
            height={Math.max(0, H - padB - y(v))}
            rx={1}
            class={v > limit + 1e-9 ? 'bar over' : 'bar'}
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {/* vùng bắt chuột rộng hơn cột */}
        {values.map((_, i) => <rect x={padL + i * bw} y={0} width={bw} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />)}
        <line x1={padL} x2={W} y1={y(limit)} y2={y(limit)} class="limit" />
        {[0, 26, 52, 78, 104, 129].map((dd) => <text x={padL + dd * bw + (dd === 129 ? bw : 0)} y={H - 3} class="axis" text-anchor={dd === 0 ? 'start' : dd === 129 ? 'end' : 'middle'}>{dd === 129 ? 'ngày 129' : dd}</text>)}
      </svg>
      <div class="daily-foot">
        <span class="lg"><i class="sw s1" />{unit}/ngày</span>
        <span class="lg"><i class="sw over" />vượt ngưỡng</span>
        <span class="lg"><i class="sw-line solid" />{limitLabel}: {num(limit)}</span>
        <span class="tip">{hover !== null ? `Ngày ${hover}: ${num(values[hover], 1)} ${unit}` : 'Rê chuột để xem từng ngày'}</span>
      </div>
    </div>
  );
}
