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
/** Chênh lệch điểm % có dấu, dấu theo số đã làm tròn (không ra "−0,00"). */
const pt2 = (x: number) => {
  const a = Math.abs(x * 100);
  const s = Number(a.toFixed(2)) === 0 ? '±' : x > 0 ? '+' : '−';
  return `${s}${a.toLocaleString('vi-VN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} điểm %`;
};

/**
 * Câu mô tả tác động của Investment lên ROI, ĐÚNG THEO DẤU của Operating profit.
 * ROI = OP ÷ Investment: OP > 0 thì Investment giảm → ROI tăng; OP < 0 (đang lỗ) thì Investment giảm → ROI XẤU ĐI
 * (cùng một khoản lỗ chia cho mẫu nhỏ hơn). "Phần do Investment" = OP kịch bản ÷ Inv kịch bản − OP kịch bản ÷ Inv baseline.
 */
export function investmentRoiNote(operatingProfit: number, investment: number, baseInvestment: number): string {
  const dInv = investment - baseInvestment;
  if (Math.abs(dInv) < 0.5 || investment <= 0 || baseInvestment <= 0) return '';
  const effect = operatingProfit / investment - operatingProfit / baseInvestment;
  const verb = dInv < 0 ? 'giảm' : 'tăng';
  if (Math.abs(operatingProfit) < 0.5) return `Investment ${verb} €${n0(Math.abs(dInv))}; Operating profit ≈ 0 nên phần này không đổi ROI.`;
  const opState = operatingProfit < 0 ? `đang âm (−€${n0(-operatingProfit)}, lỗ)` : `đang dương (€${n0(operatingProfit)})`;
  const dir = effect > 0 ? 'làm ROI tốt lên' : 'làm ROI xấu đi';
  return `Investment ${verb} €${n0(Math.abs(dInv))}. Operating profit ${opState} nên riêng phần Investment ${verb} ${dir} (${pt2(effect)}); ROI tổng xem ở thanh trên.`;
}

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
  // --- SC → Purchasing/Finance: lot size NL giảm → nhiều chuyến giao hơn (phí vận chuyển/đơn hàng CHƯA mô hình) ---
  const lotDown = res.sc.components.filter((c) => cur.sc.components[c.key].lotSizeWeeks < base.sc.components[c.key].lotSizeWeeks);
  if (lotDown.length) {
    const trips = (c: (typeof res.sc.components)[number]) => {
      const b = baseRes.sc.components.find((x) => x.key === c.key)!;
      const v = c.deliveries.value, bv = b.deliveries.value;
      return `${c.key} ${n1(base.sc.components[c.key].lotSizeWeeks)} → ${n1(cur.sc.components[c.key].lotSizeWeeks)} tuần${v !== null && bv !== null ? ` (${n1(bv)} → ${n1(v)} lần giao/round)` : ''}`;
    };
    out.push({
      id: 'sc-lot-trips', severity: 'warn', from: 'SC', to: ['Purchasing', 'Finance'],
      title: 'Giảm lot size làm tăng số chuyến giao → phí vận chuyển & phí đơn hàng tăng (ước lượng)',
      detail: `${lotDown.map(trips).join('; ')}. Phí vận chuyển (trong Purchase value) = phí R0 × tỷ lệ mô hình "phí mỗi chuyến × số chuyến + phí đơn vị" (tab 4); phí đơn hàng nhập = số R0 × tỷ lệ số chuyến — đều là ước lượng, game không công bố công thức.`,
      roi: [
        ...lotDown.map((c) => imp(`Purchase value ${c.key} (gồm vận chuyển)`, new RegExp(`\\(${c.key}\\)`))),
        imp('Inbound order lines', /^Inbound order lines$/), imp('Inbound orders', /^Inbound orders$/),
      ],
    });
  }
  // --- Purchasing: NCC, ô đàm phán, số game ---
  const purChanged = (c: string) => changed(base, cur, (i) => [i.purchasing.suppliers[c as keyof typeof i.purchasing.suppliers], i.purchasing.terms?.[c as keyof typeof i.purchasing.terms]]);
  for (const p of res.purchasing.components) {
    const pb = baseRes.purchasing.components.find((x) => x.key === p.key)!;
    const t = cur.purchasing.terms[p.key];
    const rowRe = new RegExp(`\\(${p.key}\\)`);
    if (!purChanged(p.key)) continue;
    // Giá / purchase value
    const missing: string[] = [];
    if (p.ciBasis !== 'game' && (p.ciStale || !p.isR0Supplier)) missing.push(`contract index (đang dùng ${p.contractIndex.toLocaleString('vi-VN', { maximumFractionDigits: 4 })} ${p.isR0Supplier ? 'của hợp đồng R0' : 'niêm yết thị trường'}, trước đàm phán)`);
    if (!p.isR0Supplier && t.reliabilityActual === null) missing.push(`reliability thực tế (ước lượng ${pct(p.reliability)} = cam kết − chênh lệch TB R0)`);
    if (!p.isR0Supplier && t.rejectionActual === null) missing.push(`rejection (ước lượng ${pct(p.rejection)} = mức R0 của ${p.key})`);
    out.push({
      id: `pur-${p.key}`, severity: missing.length ? 'warn' : 'info', from: 'Purchasing', to: ['SC', 'Ops', 'Finance'],
      title: `${p.key}: ${p.isR0Supplier ? 'đổi điều kiện hợp đồng' : `đổi NCC ${p.supplierR0} → ${p.supplier}`} → purchase value €${n0(pb.purchaseValue)} → €${n0(p.purchaseValue)}`,
      detail: `Giá cơ bản €${p.basePrice.toLocaleString('vi-VN')} × CI ${p.contractIndex.toLocaleString('vi-VN', { maximumFractionDigits: 4 })}; lead time ${pb.leadTimeDays} → ${p.leadTimeDays} ngày (${p.transport}); reliability ${pct(pb.reliability)} → ${pct(p.reliability)}; trade unit ${pb.tradeUnit} → ${p.tradeUnit}; phí vận chuyển €${n0(pb.transportCost)} → €${n0(p.transportCost)} (ước lượng).${missing.length ? ` ⚠ Chưa nhập số game: ${missing.join('; ')}. Bấm Calculate trong game rồi nhập ở tab Purchasing.` : ''}`,
      roi: [imp(`Purchase value ${p.key}`, rowRe), imp('Investment: Payment terms', /^Payment terms$/), imp('Investment: Stock', /^Stock$/)],
    });
    if (t.deliveryWindow !== pb.deliveryWindow) {
      const order = ['4 hours', '1 day', '2 days', '1 week'];
      const wider = order.indexOf(t.deliveryWindow) > order.indexOf(pb.deliveryWindow);
      out.push({
        id: `pur-window-${p.key}`, severity: wider ? 'warn' : 'info', from: 'Purchasing', to: ['Ops', 'SC'],
        title: `${p.key}: delivery window ${pb.deliveryWindow} → ${t.deliveryWindow}`,
        detail: wider
          ? 'Luật game: window rộng thì rẻ hơn nhưng hàng về lệch ngày nhiều hơn → khó xếp nhân công kho NL, cần safety stock NL cao hơn. CHƯA đưa vào số (game không cho độ lớn); giá chỉ đổi khi nhập CI game.'
          : 'Window hẹp hơn: hàng về đúng giờ hơn nhưng đắt hơn (nhập CI game). Tác động lên số chưa mô hình.',
        roi: [notModeled('Availability / safety stock NL', 'delivery window chưa mô hình')],
      });
    }
    if ((p.key === 'Pack' || p.key === 'PET') && p.quality !== pb.quality) {
      out.push({
        id: `pur-quality-${p.key}`, severity: 'info', from: 'Purchasing', to: ['Ops'],
        title: `${p.key}: quality ${pb.quality} → ${p.quality} → hỏng dây chuyền ${n1(baseRes.ops.line.breakdown)} → ${n1(o.line.breakdown)} giờ/tuần`,
        detail: 'Luật game: bao bì Poor gây hỏng dây chuyền. Độ lớn là ước lượng (Poor ×1,6, Middle ×1,25 so với High — chỉnh ở tab "Giả định & R0").',
        roi: [imp('Flexible manpower (bottling)', /^Flexible manpower \(bottling\)/)],
      });
    }
    if (p.key !== 'Pack' && p.key !== 'PET' && p.quality !== 'High') {
      out.push({
        id: `pur-juice-${p.key}`, severity: 'warn', from: 'Purchasing', to: ['Ops', 'Sales'],
        title: `${p.key}: quality ${p.quality}`,
        detail: 'Luật game: thành phẩm không đạt kiểm tra bị hủy. Game không cho độ lớn → CHƯA đưa vào số (Costs of scrap, service level giữ nguyên).',
        roi: [notModeled('Costs of scrap / rejects', 'quality NL nước ép chưa mô hình')],
      });
    }
    const listed = data.purchasing.market.find((m) => m.component === p.key && m.supplier === p.supplier);
    if (!p.isR0Supplier && listed && (!listed.certified || listed.freeCapacity < 0.1)) {
      out.push({
        id: `pur-risk-${p.key}`, severity: 'info', from: 'Purchasing', to: ['SC', 'Ops'],
        title: `${p.supplier}: ${[!listed.certified ? 'không certification' : '', listed.freeCapacity < 0.1 ? `free capacity ${pct(listed.freeCapacity, 0)}` : ''].filter(Boolean).join(', ')}`,
        detail: 'Luật game: free capacity thấp hoặc không certification thì NCC hay giao trễ, chất lượng không đều. Nên nhập reliability/rejection thực tế khi có số game.',
        roi: [notModeled('Reliability / rejection thực tế', 'nhập số game')],
      });
    }
    if (Math.abs(t.paymentTermWeeks - pb.paymentTermWeeks) > 1e-9) {
      out.push({
        id: `pur-pay-${p.key}`, severity: 'info', from: 'Purchasing', to: ['Finance'],
        title: `${p.key}: payment term ${pb.paymentTermWeeks} → ${t.paymentTermWeeks} tuần`,
        detail: `Phải trả NCC ước lượng = purchase value/tuần × payment term → Investment: Payment terms đổi. Payment term dài thì NCC tăng giá (CLAUDE.md) — nhập CI game sau Calculate. ${investmentRoiNote(res.finance.operatingProfit, res.finance.investment, baseRes.finance.investment)}`,
        roi: [imp('Investment: Payment terms', /^Payment terms$/)],
      });
    }
  }
  // --- SC/Purchasing/Ops(intake) → availability NL → plan adherence ---
  for (const c of res.sc.components) {
    const b = baseRes.sc.components.find((x) => x.key === c.key)!;
    if (c.availability < b.availability - 0.005) {
      out.push({
        id: `avail-${c.key}`, severity: c.availability < 0.9 ? 'critical' : 'warn', from: purChanged(c.key) ? 'Purchasing' : 'SC', to: ['Ops', 'Sales'],
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
        detail: `NCC ${c.supplier}: lead time ${n1(c.leadTimeWeeks)} tuần, reliability ${pct(c.reliability)}. Safety stock đang ${n1(c.safetyStockWeeks)} tuần, gợi ý ≥ ${n1(c.recommendedSsWeeks)} tuần (ước lượng) — hoặc Purchasing đổi NCC nhanh/tin cậy hơn (tab Purchasing).`,
        roi: [
          notModeled('Penalty service level', 'Sales — M3'),
          ...(cur.sc.components[c.key].safetyStockWeeks > base.sc.components[c.key].safetyStockWeeks ? [imp('Interest on components (do tăng SS)', /^Interest on components/)] : []),
        ],
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
    // Lít dư vẫn phải trộn & đóng chai → tiêu thụ NL tăng → cỡ đơn (lot size tuần × lượng dùng) và tồn NL tăng.
    const rmUp = res.opsRaw.components
      .map((f) => { const fb = baseRes.opsRaw.components.find((x) => x.key === f.key)!; return { key: f.key, k: fb.usagePerWeek > 0 ? f.usagePerWeek / fb.usagePerWeek - 1 : 0 }; })
      .filter((x) => x.k > 0.005);
    const availUp = res.sc.components
      .map((c) => ({ key: c.key, a: c.availability, b: baseRes.sc.components.find((x) => x.key === c.key)!.availability }))
      .filter((x) => x.a > x.b + 0.0005);
    const rmText = rmUp.length
      ? ` Lít dư vẫn tiêu thụ nguyên liệu: lượng dùng ${rmUp.map((x) => `${x.key} +${pct(x.k, 0)}`).join(', ')} → cỡ đơn và tồn NL tăng (NL €${n0(baseRes.sc.stockValue.components)} → €${n0(res.sc.stockValue.components)}).`
      : '';
    const availText = availUp.length
      ? ` Availability NL mô hình tăng (${availUp.map((x) => `${x.key} ${pct(x.b)} → ${pct(x.a)}`).join(', ')}) CHỈ vì safety stock tính bằng tuần × lượng dùng (đã gồm phần thừa) nên nhiều đơn vị hơn — ước lượng, chưa chắc game tính như vậy; không phải cải thiện từ NCC.`
      : '';
    out.push({
      id: 'mixer-min', severity: 'warn', from: scInterval ? 'SC' : 'Ops', to: scInterval ? ['Ops', 'Finance'] : ['SC', 'Finance'],
      title: `Mẻ nhỏ hơn mẻ tối thiểu máy trộn → dư ${n0(o.mixer.excessLitersPerWeek)} L/tuần`,
      detail: `Production interval ngắn với máy ${o.mixer.name} (mẻ tối thiểu) làm lô bị làm tròn lên: sản xuất thừa, thêm giờ dây chuyền và tồn kho.${rmText}${availText}`,
      roi: [imp('Mixer variable costs', /^Mixer variable/), imp('Flexible manpower (bottling)', /^Flexible manpower \(bottling\)/), imp('Interest on components', /^Interest on components/)],
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
      detail: `NL €${n0(baseRes.sc.stockValue.components)} → €${n0(res.sc.stockValue.components)}; TP €${n0(baseRes.sc.stockValue.products)} → €${n0(res.sc.stockValue.products)}. ${investmentRoiNote(res.finance.operatingProfit, res.finance.investment, baseRes.finance.investment)} (Chưa tính rủi ro service level.)`,
      roi: [imp('Investment: Stock', /^Stock$/), imp('Interest on components', /^Interest on components/), imp('Interest on products', /^Interest on products/)],
    });
  }
  const order = { critical: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
