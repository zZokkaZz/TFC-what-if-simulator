import type { ComponentChildren } from 'preact';
import type { Basis } from '../model/types';
import type { Cause } from './trace';
import { signed } from './format';

export function Badge({ basis }: { basis: Basis }) {
  if (basis === 'rule') return null;
  const map = {
    estimate: ['ước lượng', 'Giả định không có trong luật game — xem tab Giả định'],
    calibrated: ['hiệu chỉnh R0', 'Hệ số tính từ số Round 0 — chỉ số này khớp R0 do cấu tạo'],
    r0: ['số R0', 'Giữ nguyên số Round 0, chưa mô hình hóa'],
  } as const;
  const [text, title] = map[basis];
  return <span class={`badge badge-${basis}`} title={title}>{text}</span>;
}

export function Causes({ causes }: { causes: Cause[] }) {
  if (!causes.length) return null;
  return (
    <span class="causes">
      {causes.slice(0, 2).map((c) => (
        <span class={`cause cause-${c.dept}`}>← do {c.dept} đổi {c.label}</span>
      ))}
      {causes.length > 2 && <span class="cause">+{causes.length - 2}</span>}
    </span>
  );
}

export interface MetricProps {
  label: string;
  value: string;
  raw?: number;
  base?: number;
  deltaKind?: 'eur' | 'pct' | 'pt' | 'num';
  deltaDigits?: number;
  good?: 'up' | 'down';
  r0?: string;
  basis?: Basis;
  causes?: Cause[];
  alert?: boolean;
  hint?: string;
}

export function Metric(p: MetricProps) {
  const d = p.raw !== undefined && p.base !== undefined ? p.raw - p.base : 0;
  const changed = Math.abs(d) > 1e-6 * Math.max(1, Math.abs(p.base ?? 0));
  const cls = !changed || !p.good ? 'neutral' : (d > 0) === (p.good === 'up') ? 'good' : 'bad';
  return (
    <div class={`metric${p.alert ? ' alert' : ''}`} title={p.hint}>
      <div class="m-label">
        {p.label} {p.basis && <Badge basis={p.basis} />}
      </div>
      <div class="m-value">
        {p.alert && <span class="alert-icon" aria-label="điểm nghẽn">▲</span>}
        {p.value}
        {changed && p.deltaKind && <span class={`delta ${cls}`}>{signed(d, p.deltaKind, p.deltaDigits ?? 1)}</span>}
      </div>
      {p.r0 !== undefined && <div class="m-r0">R0 thật: {p.r0}</div>}
      {p.causes && <Causes causes={p.causes} />}
    </div>
  );
}

export function Card({ title, children, alert, extra }: { title: string; children: ComponentChildren; alert?: boolean; extra?: ComponentChildren }) {
  return (
    <section class={`card${alert ? ' card-alert' : ''}`}>
      <header class="card-h">
        <h3>{alert && <span class="alert-icon">▲</span>}{title}</h3>
        {extra}
      </header>
      {children}
    </section>
  );
}

export function Grid({ children }: { children: ComponentChildren }) {
  return <div class="metrics">{children}</div>;
}

// ---------- ô quyết định ----------
interface FieldBase { label: string; unit?: string; hint?: string; changed?: boolean }

export function NumberField(p: FieldBase & { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label class={`field${p.changed ? ' changed' : ''}`}>
      <span class="f-label">{p.label}{p.unit && <em> ({p.unit})</em>}</span>
      <input
        type="number"
        inputMode="decimal"
        value={p.value}
        min={p.min}
        max={p.max}
        step={p.step ?? 1}
        onInput={(e) => {
          const v = Number((e.currentTarget as HTMLInputElement).value);
          if (Number.isFinite(v)) p.onChange(Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v)));
        }}
      />
      {p.hint && <span class="f-hint">{p.hint}</span>}
    </label>
  );
}

export function SelectField<T extends string | number>(p: FieldBase & { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label class={`field${p.changed ? ' changed' : ''}`}>
      <span class="f-label">{p.label}{p.unit && <em> ({p.unit})</em>}</span>
      <select
        value={String(p.value)}
        onChange={(e) => {
          const raw = (e.currentTarget as HTMLSelectElement).value;
          const opt = p.options.find((o) => String(o.value) === raw);
          if (opt) p.onChange(opt.value);
        }}
      >
        {p.options.map((o) => <option value={String(o.value)}>{o.label}</option>)}
      </select>
      {p.hint && <span class="f-hint">{p.hint}</span>}
    </label>
  );
}

export function YesNo(p: FieldBase & { value: boolean; onChange: (v: boolean) => void }) {
  return <SelectField {...p} value={p.value ? 'yes' : 'no'} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} onChange={(v) => p.onChange(v === 'yes')} />;
}

export function Table({ head, rows, cls }: { head: ComponentChildren[]; rows: ComponentChildren[][]; cls?: string }) {
  return (
    <div class="tbl-wrap">
      <table class={cls}>
        <thead><tr>{head.map((h) => <th>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr>{r.map((c) => <td>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
