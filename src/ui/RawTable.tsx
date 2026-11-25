// Bảng NGUYÊN VĂN từ sheet: tiêu đề cột và số y như file, chỉ định dạng cách hiển thị (%, phân cách nghìn).
import type { Round0Data } from '../data/types';
import { useState } from 'preact/hooks';
import { Table } from './components';

const PCT = /(%|reliability|rejection|availability|service level|^sl |osa|^obsoletes?$|bias|mape|adherence|cleaning|utilization|^overflow)/i;

/** isPct: định dạng % đọc từ chính ô trong file; không có thông tin thì đoán theo tên cột. */
export function fmtCell(header: string, v: string | number | null, isPct?: boolean): string {
  if (v === null) return '';
  if (typeof v !== 'number') return v;
  if (isPct ?? (!/€/.test(header) && PCT.test(header.trim()) && Math.abs(v) <= 1.5)) {
    return `${(v * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  }
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 4 });
}

export function RawTable({ data, id, note }: { data: Round0Data; id: string; note?: string }) {
  const t = data.rawTables.find((x) => x.id === id);
  if (!t) return <p class="muted">Thiếu dữ liệu: file không có bảng "{id}".</p>;
  return (
    <div class="raw">
      <h4>{t.title} <span class="src">— tab {t.sheet}</span></h4>
      <div class="tbl-wrap">
        <table class="sheet raw-t">
          <thead><tr>{t.headers.map((h) => <th>{h}</th>)}</tr></thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr class={/^tổng$/i.test(String(r[0] ?? '')) ? 'total' : ''}>{r.map((v, k) => <td>{fmtCell(t.headers[k] ?? '', v, t.pct ? (t.pct[i]?.[k] ?? false) : undefined)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p class="muted">{note}</p>}
    </div>
  );
}


/** Tab 13: Round -2 so với Round 0, lọc theo nhóm (vd "Dây chuyền|Máy trộn|Kho"). */
export function HistoryTable({ data, groups, title }: { data: Round0Data; groups: RegExp; title: string }) {
  const rows = data.history.filter((h) => groups.test(h.group));
  const objects = [...new Set(rows.map((h) => `${h.group} · ${h.object}`))];
  const [obj, setObj] = useState(objects[0] ?? '');
  if (!rows.length) return <p class="muted">Thiếu dữ liệu: file không có tab 13 (lịch sử R-2 vs R0).</p>;
  const sel = rows.filter((h) => `${h.group} · ${h.object}` === obj);
  return (
    <details>
      <summary>{title} — tab 13</summary>
      <p class="muted">Game lưu R-2, R-1, R0; R-1 trùng hoàn toàn R0 nên sheet chỉ so R-2 với R0. <b>Thiếu dữ liệu quyết định của R-2</b> nên app không dùng làm mốc hiệu chỉnh.</p>
      <select value={obj} onChange={(e) => setObj((e.currentTarget as HTMLSelectElement).value)}>{objects.map((o) => <option value={o}>{o}</option>)}</select>
      <Table head={['Chỉ số (tên gốc game)', 'Round -2', 'Round 0', 'Δ (R0 − R-2)']} rows={sel.map((h) => [h.metric, fmtCell(h.metric, h.rMinus2), fmtCell(h.metric, h.r0), h.rMinus2 !== null && h.r0 !== null ? fmtCell(h.metric, Math.round((h.r0 - h.rMinus2) * 1e6) / 1e6) : ''])} />
    </details>
  );
}
