// Cảnh báo liên phòng ban: so kết quả kịch bản với baseline (và với giới hạn tuyệt đối),
// mỗi cảnh báo nói rõ phòng gây ra → phòng bị ảnh hưởng, và dòng nào của bảng ROI đổi bao nhiêu.
import type { Round0Data } from '../data/types';
import type { Inputs, Results } from './types';

export type WDept = 'Ops' | 'SC' | 'Purchasing' | 'Sales' | 'Finance';

export interface RoiImpact { label: string; delta: number | null; note?: string } // delta null = chưa mô hình
export interface Warning {
  id: string;
  severity: 'critical' | 'warn' | 'info';
  from: WDept;
  to: WDept[];
  title: string;
  detail: string;
  roi: RoiImpact[];
}

const pct = (x: number, d = 1) => `${(x * 100).toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d })}%`;
const n0 = (x: number) => Math.round(x).toLocaleString('vi-VN');
const n1 = (x: number) => x.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

function changed(base: Inputs, cur: Inputs, pick: (i: Inputs) => unknown) {
  return JSON.stringify(pick(base)) !== JSON.stringify(pick(cur));
}

export function crossWarnings(data: Round0Data, base: Inputs, cur: Inputs, res: Results, baseRes: Results): Warning[] {
  const out: Warning[] = [];
  const row = (re: RegExp) => {
    const r = res.finance.rows.find((x) => re.test(x.label));
    const b = baseRes.finance.rows.find((x) => re.test(x.label));
    return r && b ? r.value - b.value : 0;
  };
  // Dấu theo ROI: chi phí tăng = xấu; ở đây trả Δ của dòng (chi phí dương), UI tô màu theo loại dòng
  const imp = (label: string, re: RegExp, note?: string): RoiImpact => ({ label, delta: row(re), note });
  const notModeled = (label: string, note: string): RoiImpact => ({ label, delta: null, note });

  const scLot = changed(base, cur, (i) => Object.values(i.sc.components).map((c) => c.lotSizeWeeks));
  const scSsRm = changed(base, cur, (i) => Object.values(i.sc.components).map((c) => c.safetyStockWeeks));
  const scInterval = changed(base, cur, (i) => Object.values(i.sc.products).map((p) => p.productionIntervalDays));
  const scSsFg = changed(base, cur, (i) => Object.values(i.sc.products).map((p) => p.safetyStockWeeks));
  const scFrozen = cur.sc.frozenPeriodWeeks !== base.sc.frozenPeriodWeeks;
  const o = res.ops, ob = baseRes.ops;

  // --- SC → Ops: kho NL ---
  if ((scLot || scSsRm) && Math.abs(o.rm.peakPallets - ob.rm.peakPallets) > 5) {
    const up = o.rm.peakPallets > ob.rm.peakPallets;
    out.push({
      id: 'sc-rm', severity: o.rm.overflowShare > 0.05 ? 'warn' : 'info', from: 'SC', to: ['Ops', 'Finance'],
      title: `${scLot ? 'Lot size' : 'Safety stock'} NL đổi → kho NL ${up ? 'đầy hơn' : 'nhẹ hơn'}`,
      detail: `Đỉnh pallet ${n0(ob.rm.peakPallets)} → ${n0(o.rm.peakPallets)} (sức chứa ${n0(o.rm.capacity)}), số ngày tràn ${ob.rm.daysOverCapacity} → ${o.rm.daysOverCapacity}, đỉnh giờ công kho NL ${n1(ob.rm.peakDayHours)} → ${n1(o.rm.peakDayHours)} giờ/ngày. ${up ? 'Ops cân nhắc thêm pallet location / FTE kho NL.' : ''}`,
      roi: [imp('Overflow raw materials warehouse', /^Overflow raw/), imp('Inbound flexible manpower', /^Inbound flexible/), imp('Interest on components', /^Interest on components/), imp('Investment: Stock', /^Stock$/)],
    });
  }
  // --- SC/Purchasing/Ops(intake) → availability NL → plan adherence ---
  for (const c of res.sc.components) {
    const b = baseRes.sc.components.find((x) => x.key === c.key)!;
    if (c.availability < b.availability - 0.005) {
      out.push({
        id: `avail-${c.key}`, severity: c.availability < 0.9 ? 'critical' : 'warn', from: 'SC', to: ['Ops', 'Sales'],
        title: `Availability ${c.key} giảm ${pct(b.availability)} → ${pct(c.availability)}`,
        detail: `Safety stock ${n1(c.safetyStockWeeks)} tuần (gợi ý ≥ ${n1(c.recommendedSsWeeks)} tuần cho 99%), lead time ${n1(c.leadTimeWeeks)} tuần, reliability NCC ${pct(c.reliability)}. Thiếu NL làm plan adherence ${pct(baseRes.ops.line.planAdherence)} → ${pct(o.line.planAdherence)} và service level TP giảm.`,
        roi: [notModeled('Penalty service level (doanh thu)', 'Sales — M3 chưa mô hình'), notModeled('Costs of scrap', 'chưa mô hình')],
      });
    }
  }
  // Vấn đề tồn tại ngay ở baseline (để "nhìn ra" R0): availability thấp
  for (const c of res.sc.components) {
    if (c.availability < 0.95 && !out.some((w) => w.id === `avail-${c.key}`)) {
      out.push({
        id: `avail-low-${c.key}`, severity: 'critical', from: 'Purchasing', to: ['SC', 'Ops', 'Sales'],
        title: `${c.key}: availability chỉ ${pct(c.availability)}${c.stockoutDaysR0 ? ` (R0 hết hàng ${c.stockoutDaysR0}/130 ngày)` : ''}`,
        detail: `NCC ${c.supplier}: lead time ${n1(c.leadTimeWeeks)} tuần, reliability ${pct(c.reliability)}. Safety stock đang ${n1(c.safetyStockWeeks)} tuần, gợi ý ≥ ${n1(c.recommendedSsWeeks)} tuần (ước lượng) — hoặc Purchasing đổi NCC nhanh/tin cậy hơn (M3).`,
        roi: [notModeled('Penalty service level', 'Sales — M3'), imp('Interest on components (nếu tăng SS)', /^Interest on components/)],
      });
    }
  }
  // --- SC → Ops: dây chuyền ---
  if (scInterval && Math.abs(o.line.changeover - ob.line.changeover) > 0.1) {
    out.push({
      id: 'sc-line', severity: o.line.bottleneck ? 'warn' : 'info', from: 'SC', to: ['Ops'],
      title: `Production interval đổi → changeover ${n1(ob.line.changeover)} → ${n1(o.line.changeover)} giờ/tuần`,
      detail: `Overtime ${n1(ob.line.overtime)} → ${n1(o.line.overtime)} giờ/tuần, plan adherence ${pct(ob.line.planAdherence)} → ${pct(o.line.planAdherence)}, start-up loss €${n0(ob.line.startupLossEur)} → €${n0(o.line.startupLossEur)}. ${o.line.bottleneck ? 'Dây chuyền thành điểm nghẽn: Ops cân nhắc thêm ca hoặc SMED.' : ''}`,
      roi: [imp('Flexible manpower (bottling)', /^Flexible manpower \(bottling\)/), imp('Mixer variable costs', /^Mixer variable/), imp('Investment: Stock', /^Stock$/)],
    });
  }
  if (o.mixer.excessLitersPerWeek > 0) {
    out.push({
      id: 'mixer-min', severity: 'warn', from: 'SC', to: ['Ops'],
      title: `Mẻ nhỏ hơn mẻ tối thiểu máy trộn → dư ${n0(o.mixer.excessLitersPerWeek)} L/tuần`,
      detail: `Production interval ngắn với máy ${o.mixer.name} (mẻ tối thiểu) làm lô bị làm tròn lên: sản xuất thừa, thêm giờ dây chuyền và tồn kho.`,
      roi: [imp('Mixer variable costs', /^Mixer variable/), imp('Flexible manpower (bottling)', /^Flexible manpower \(bottling\)/)],
    });
  }
  // --- SC → Ops: kho TP ---
  if ((scSsFg || scInterval) && Math.abs(o.fg.peakPallets - ob.fg.peakPallets) > 5) {
    out.push({
      id: 'sc-fg', severity: o.fg.daysOverCapacity > 10 ? 'warn' : 'info', from: 'SC', to: ['Ops', 'Finance'],
      title: `Tồn TP đổi → đỉnh pallet kho TP ${n0(ob.fg.peakPallets)} → ${n0(o.fg.peakPallets)}`,
      detail: `Sức chứa ${n0(o.fg.capacity)}; số ngày tràn ${ob.fg.daysOverCapacity} → ${o.fg.daysOverCapacity}. Giá trị tồn TP €${n0(baseRes.sc.stockValue.products)} → €${n0(res.sc.stockValue.products)}.`,
      roi: [imp('Overflow finished goods warehouse', /^Overflow finished/), imp('Interest on products', /^Interest on products/), imp('Investment: Stock', /^Stock$/)],
    });
  }
  // --- SC → Sales: service level & hạn dùng ---
  const slDrop = res.sc.products.filter((p) => { const b = baseRes.sc.products.find((x) => x.sku === p.sku)!; return p.slPiecesEst < b.slPiecesEst - 0.005; });
  if (slDrop.length) {
    out.push({
      id: 'sc-sl', severity: 'critical', from: 'SC', to: ['Sales'],
      title: `Service level TP dự kiến giảm ở ${slDrop.length} SKU`,
      detail: `${slDrop.map((p) => `${p.sku} ${pct(baseRes.sc.products.find((x) => x.sku === p.sku)!.slPiecesEst)} → ${pct(p.slPiecesEst)}`).join('; ')} (hứa ${pct(slDrop[0].targetServiceLevel, 0)}). ⚠ ROI hiện CHƯA trừ penalty/doanh thu mất (Sales — M3), nên ROI có thể trông tốt hơn thực tế.`,
      roi: [notModeled('Penalty service level', 'M3 — chưa tính'), notModeled('Contracted sales', 'M3 — chưa tính')],
    });
  }
  const old = res.sc.products.filter((p) => p.allowedAgeWeeks !== null && p.maxAgeWeeks > p.allowedAgeWeeks + 1e-9);
  if (old.length) {
    out.push({
      id: 'sc-age', severity: 'warn', from: 'SC', to: ['Sales', 'Ops'],
      title: `Hàng có thể quá hạn giao (${old.length} SKU)`,
      detail: `Tuổi tồn lớn nhất ≈ safety stock + chu kỳ sản xuất = ${n1(old[0].maxAgeWeeks)} tuần > ${n1(old[0].allowedAgeWeeks!)} tuần cho phép (hạn dùng ${data.productShelfLifeWeeks ?? '?'} tuần, khách đòi còn ≥ ${pct(Math.max(...data.sales.contracts.map((c) => c.shelfLife)), 0)}). Nguy cơ obsolete tăng (R0 đã 8,1%), kho TP tốn giờ hủy hàng.`,
      roi: [notModeled('Costs of scrap', 'chưa mô hình theo tuổi tồn'), notModeled('Penalty / doanh thu', 'M3')],
    });
  }
  if (scFrozen) {
    out.push({
      id: 'sc-frozen', severity: 'info', from: 'SC', to: ['Ops', 'Purchasing', 'Sales'],
      title: `Frozen period ${base.sc.frozenPeriodWeeks} → ${cur.sc.frozenPeriodWeeks} tuần`,
      detail: 'Dài hơn: lịch sản xuất ổn định hơn nhưng phản ứng chậm với nhu cầu → cần safety stock TP cao hơn (đã tính vào gợi ý SS & SL dự kiến). Tác động lên giờ dây chuyền/overtime CHƯA mô hình (ước lượng).',
      roi: [notModeled('Flexible manpower (bottling)', 'chưa mô hình theo frozen period')],
    });
  }
  // --- Tồn kho → Finance ---
  const dStock = res.sc.stockValue.total - baseRes.sc.stockValue.total;
  if (Math.abs(dStock) > 500) {
    out.push({
      id: 'stock-fin', severity: 'info', from: 'SC', to: ['Finance'],
      title: `Giá trị tồn kho ${dStock > 0 ? 'tăng' : 'giảm'} €${n0(Math.abs(dStock))}`,
      detail: `NL €${n0(baseRes.sc.stockValue.components)} → €${n0(res.sc.stockValue.components)}; TP €${n0(baseRes.sc.stockValue.products)} → €${n0(res.sc.stockValue.products)}. Investment ${dStock > 0 ? 'tăng' : 'giảm'} → ROI ${dStock > 0 ? 'giảm' : 'tăng'} (chưa tính rủi ro service level).`,
      roi: [imp('Investment: Stock', /^Stock$/), imp('Interest on components', /^Interest on components/), imp('Interest on products', /^Interest on products/)],
    });
  }
  const order = { critical: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
