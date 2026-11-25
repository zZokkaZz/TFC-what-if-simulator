import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { checkNumber, type NumLimit } from '../sync/limits';
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
interface FieldBase { label: string; unit?: string; hint?: ComponentChildren; changed?: boolean; disabled?: boolean }

/**
 * Ô số có kiểm tra giới hạn. Gõ sai/vượt giới hạn: ô viền đỏ + dòng lỗi ngay dưới,
 * KHÔNG gửi số sai đi (bản chung giữ số hợp lệ gần nhất).
 */
export function NumberField(p: FieldBase & { value: number; limit?: NumLimit; step?: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(p.value));
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  // Số đổi từ bên ngoài (đồng đội sửa, reset) khi không đang gõ → cập nhật ô
  useEffect(() => { if (!focus) { setText(String(p.value)); setErr(null); } }, [p.value, focus]);
  return (
    <label class={`field${p.changed ? ' changed' : ''}${err ? ' invalid' : ''}`}>
      <span class="f-label">{p.label}{p.unit && <em> ({p.unit})</em>}</span>
      <input
        type="text"
        inputMode="decimal"
        disabled={p.disabled}
        value={text}
        aria-invalid={!!err}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); if (err) { setText(String(p.value)); setErr(null); } }}
        onInput={(e) => {
          const raw = (e.currentTarget as HTMLInputElement).value;
          setText(raw);
          const v = Number(raw.trim().replace(',', '.'));
          const msg = raw.trim() === '' ? 'chưa nhập số' : p.limit ? checkNumber(v, p.limit) : Number.isFinite(v) ? null : 'phải là số';
          setErr(msg);
          if (!msg) p.onChange(v);
        }}
      />
      {err && <span class="f-err">⚠ {err} — chưa lưu. Rời ô sẽ trả về {p.value.toLocaleString('vi-VN')}.</span>}
      {p.limit && !err && <span class="f-range">Cho phép {p.limit.min.toLocaleString('vi-VN')}–{p.limit.max.toLocaleString('vi-VN')}{p.limit.int ? ', số nguyên' : ''}</span>}
      {p.hint && <span class="f-hint">{p.hint}</span>}
    </label>
  );
}

/**
 * Ô số BỎ TRỐNG ĐƯỢC (vd "CI game hiển thị"): trống → null (app dùng số trước đàm phán / ước lượng, hiện ở placeholder).
 * `scale` = hệ số hiển thị (100 để nhập % mà lưu 0–1). Giới hạn `limit` tính theo đơn vị LƯU.
 */
export function OptNumberField(p: FieldBase & { value: number | null; placeholder: string; limit: NumLimit; scale?: number; onChange: (v: number | null) => void }) {
  const k = p.scale ?? 1;
  const shown = (v: number | null) => (v === null ? '' : String(Math.round(v * k * 1e6) / 1e6));
  const [text, setText] = useState(shown(p.value));
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) { setText(shown(p.value)); setErr(null); } }, [p.value, focus]);
  const lim = { ...p.limit, min: p.limit.min * k, max: p.limit.max * k };
  return (
    <label class={`field${p.changed ? ' changed' : ''}${err ? ' invalid' : ''}`}>
      <span class="f-label">{p.label}{p.unit && <em> ({p.unit})</em>}</span>
      <input
        type="text" inputMode="decimal" disabled={p.disabled} value={text} placeholder={p.placeholder} aria-invalid={!!err}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); if (err) { setText(shown(p.value)); setErr(null); } }}
        onInput={(e) => {
          const raw = (e.currentTarget as HTMLInputElement).value;
          setText(raw);
          if (raw.trim() === '') { setErr(null); p.onChange(null); return; }
          const v = Number(raw.trim().replace(',', '.'));
          const msg = checkNumber(v, lim);
          setErr(msg);
          if (!msg) p.onChange(v / k);
        }}
      />
      {err && <span class="f-err">⚠ {err} — chưa lưu.</span>}
      {!err && <span class="f-range">Bỏ trống được · cho phép {lim.min.toLocaleString('vi-VN')}–{lim.max.toLocaleString('vi-VN')}</span>}
      {p.hint && <span class="f-hint">{p.hint}</span>}
    </label>
  );
}

export function SelectField<T extends string | number>(p: FieldBase & { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label class={`field${p.changed ? ' changed' : ''}`}>
      <span class="f-label">{p.label}{p.unit && <em> ({p.unit})</em>}</span>
      <select
        disabled={p.disabled}
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
