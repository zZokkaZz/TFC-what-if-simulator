// Hai nguồn số R0 cho các dòng TỔNG của tab 2_Finance (CLAUDE.md mục 0, luật 4: hai số lệch → hiện cả hai, ghi rõ nguồn).
//  - "tổng dòng sheet": ô TỔNG của tab 2 (công thức cộng các dòng chi tiết) — app tính ROI từ số này.
//  - "game in": số game in ra, chép từ cột Ghi chú tab 2 ("Game: …"). Game làm tròn từng dòng nên lệch 1–2 €.
import type { Round0Data } from '../data/types';
import { eur } from './format';

export const R0_SOURCE_NOTE =
  'Tổng dòng sheet = ô TỔNG tab 2 (cộng các dòng chi tiết), app dùng số này để tính ROI. ' +
  'Game in = số game in ra (cột Ghi chú tab 2). Lệch 1–2 € vì game làm tròn từng dòng.';

type Key = 'operatingProfit' | 'indirectCost';

/** Chuỗi ngắn "R0: sheet −€306.505 · game in −€306.503"; thiếu số game → "game in: thiếu dữ liệu". */
export function r0TwoSources(data: Round0Data, key: Key): string {
  const sheet = data.finance.totals[key];
  const game = data.finance.gamePrinted?.[key] ?? null;
  return `R0: tổng dòng sheet ${eur(sheet)} · game in ${game === null ? 'thiếu dữ liệu' : eur(game)}`;
}
