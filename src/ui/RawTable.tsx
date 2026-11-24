// Bảng NGUYÊN VĂN từ sheet: tiêu đề cột và số y như file, chỉ định dạng cách hiển thị (%, phân cách nghìn).
import type { Round0Data } from '../data/types';

const PCT = /(%|reliability|rejection|availability|service level|^sl |osa|^obsoletes?$|bias|mape|adherence|cleaning|utilization|^overflow)/i;

export function fmtCell(header: string, v: string | number | null): string {
  if (v === null) return '';
  if (typeof v !== 'number') return v;
  if (!/€/.test(header) && PCT.test(header.trim()) && Math.abs(v) <= 1.5) {
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
            {t.rows.map((r) => (
              <tr class={/^tổng$/i.test(String(r[0] ?? '')) ? 'total' : ''}>{r.map((v, k) => <td>{fmtCell(t.headers[k] ?? '', v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p class="muted">{note}</p>}
    </div>
  );
}
