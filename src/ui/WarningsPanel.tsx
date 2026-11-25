// Bảng cảnh báo liên phòng ban: phòng gây ra → phòng bị ảnh hưởng, kèm dòng ROI đổi bao nhiêu.
import type { Warning, WDept } from '../model/warnings';
import { Card } from './components';
import { signed } from './format';

const ICON = { critical: '⛔', warn: '⚠', info: 'ℹ' } as const;

export function WarningsPanel({ warnings, title, filterTo }: { warnings: Warning[]; title: string; filterTo?: WDept }) {
  const list = filterTo ? warnings.filter((w) => w.to.includes(filterTo) || w.from === filterTo) : warnings;
  return (
    <Card title={`${title} (${list.length})`} alert={list.some((w) => w.severity === 'critical')}>
      {list.length === 0 ? <p class="muted">Không có cảnh báo.</p> : (
        <div class="warns">
          {list.map((w) => (
            <div class={`warn warn-${w.severity}`}>
              <div class="w-head">
                <span class="w-icon" aria-label={w.severity}>{ICON[w.severity]}</span>
                <b>{w.title}</b>
                <span class="w-flow">{w.from} → {w.to.join(', ')}</span>
              </div>
              <div class="w-detail">{w.detail}</div>
              {w.roi.length > 0 && (
                <div class="w-roi">
                  Dòng ROI: {w.roi.map((r) => (
                    <span class="w-line">
                      {r.label}{' '}
                      {r.delta === null
                        ? <em class="muted">({r.note ?? 'chưa mô hình'})</em>
                        : Math.abs(r.delta) < 0.5 ? <em class="muted">(±0)</em>
                          : <b class={/Stock|Interest|Overflow|flexible|Flexible|Mixer|scrap/i.test(r.label) ? (r.delta > 0 ? 'bad' : 'good') : (r.delta > 0 ? 'good' : 'bad')}>{signed(r.delta, 'eur')}</b>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
