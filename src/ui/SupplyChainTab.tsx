// Tab Supply Chain (M2): quyết định SC (sửa được theo vai trò), kết quả tồn kho/availability/service level,
// ảnh hưởng sang Ops & Finance, cảnh báo liên phòng ban, dữ liệu R0 (tab 7, 11, 12).
import { useState } from 'preact/hooks';
import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import type { Inputs, Results, ScInputs, SheetCell } from '../model/types';
import type { Warning } from '../model/warnings';
import { SC_LIMITS } from '../sync/limits';
import { Badge, Card, Grid, Metric, NumberField, Table } from './components';
import { DailyChart } from './charts';
import { eur, num, pct } from './format';
import { causesFor } from './trace';
import { WarningsPanel } from './WarningsPanel';
import { RawTable, HistoryTable } from './RawTable';

interface Props {
  data: Round0Data;
  inputs: Inputs;
  base: Inputs;
  res: Results;
  baseRes: Results;
  changed: string[];
  setSc: (sc: ScInputs) => void;
  editable: boolean;
  lockReason?: string;
  warnings: Warning[];
}

const COMP_LABEL: Record<ComponentKey, string> = { Pack: 'Pack 1L', PET: 'PET', Orange: 'Orange', Mango: 'Mango', 'Vitamin C': 'Vitamin C' };

export function SupplyChainTab({ data, inputs, base, res, baseRes, changed, setSc, editable, lockReason, warnings }: Props) {
  const sc = inputs.sc, b = base.sc;
  const dis = !editable;
  const S = res.sc, SB = baseRes.sc;
  const c = (k: string) => causesFor(k, changed);
  const anyScChanged = changed.some((p) => p.startsWith('sc.'));
  const setComp = (k: ComponentKey, patch: Partial<ScInputs['components'][ComponentKey]>) => setSc({ ...sc, components: { ...sc.components, [k]: { ...sc.components[k], ...patch } } });
  const setProd = (k: SkuKey, patch: Partial<ScInputs['products'][SkuKey]>) => setSc({ ...sc, products: { ...sc.products, [k]: { ...sc.products[k], ...patch } } });
  const setAllComp = (patch: Partial<ScInputs['components'][ComponentKey]>) => setSc({ ...sc, components: Object.fromEntries(Object.entries(sc.components).map(([k, v]) => [k, { ...v, ...patch }])) as ScInputs['components'] });
  const setAllProd = (patch: Partial<ScInputs['products'][SkuKey]>) => setSc({ ...sc, products: Object.fromEntries(Object.entries(sc.products).map(([k, v]) => [k, { ...v, ...patch }])) as ScInputs['products'] });
  const [dailyItem, setDailyItem] = useState<string>('Vitamin C');

  const comps = Object.keys(sc.components) as ComponentKey[];
  const skus = Object.keys(sc.products) as SkuKey[];
  const o = res.ops, ob = baseRes.ops;

  return (
    <div class="two-col">
      <aside class="decisions">
        <div class="dec-head">
          <h2>Quyết định Supply Chain</h2>
          <button class="btn" disabled={!anyScChanged || dis} onClick={() => setSc(structuredClone(b))}>Reset SC về R0</button>
        </div>
        {lockReason && <p class="lock">🔒 {lockReason}</p>}

        <fieldset>
          <legend>Component (nguyên liệu)</legend>
          <div class="row gap small-text">
            Áp cho tất cả:
            <button class="btn small" disabled={dis} onClick={() => setAllComp({ safetyStockWeeks: sc.components.PET.safetyStockWeeks })}>SS = PET</button>
            <button class="btn small" disabled={dis} onClick={() => setAllComp({ lotSizeWeeks: sc.components.PET.lotSizeWeeks })}>Lot = PET</button>
          </div>
          {comps.map((k) => (
            <div class="sc-row">
              <div class="sc-name">{COMP_LABEL[k]}</div>
              <NumberField label="Safety stock" unit="tuần" value={sc.components[k].safetyStockWeeks} limit={SC_LIMITS.safetyStockWeeks} disabled={dis} changed={sc.components[k].safetyStockWeeks !== b.components[k].safetyStockWeeks} onChange={(v) => setComp(k, { safetyStockWeeks: v })} />
              <NumberField label="Lot size" unit="tuần" value={sc.components[k].lotSizeWeeks} limit={SC_LIMITS.lotSizeWeeks} disabled={dis} changed={sc.components[k].lotSizeWeeks !== b.components[k].lotSizeWeeks} onChange={(v) => setComp(k, { lotSizeWeeks: v })} />
            </div>
          ))}
          <span class="f-hint">Tính bằng tuần nhu cầu dự báo (luật game). Lot size có thể bị trade unit làm vượt.</span>
        </fieldset>

        <fieldset>
          <legend>Product (thành phẩm, DC Netherlands)</legend>
          <div class="row gap small-text">
            Áp cho tất cả:
            <button class="btn small" disabled={dis} onClick={() => setAllProd({ productionIntervalDays: sc.products['Orange 1L'].productionIntervalDays })}>Interval = Orange 1L</button>
            <button class="btn small" disabled={dis} onClick={() => setAllProd({ safetyStockWeeks: sc.products['Orange 1L'].safetyStockWeeks })}>SS = Orange 1L</button>
          </div>
          {skus.map((k) => (
            <div class="sc-row">
              <div class="sc-name">{k}</div>
              <NumberField label="Production interval" unit="ngày" value={sc.products[k].productionIntervalDays} limit={SC_LIMITS.productionIntervalDays} disabled={dis} changed={sc.products[k].productionIntervalDays !== b.products[k].productionIntervalDays} onChange={(v) => setProd(k, { productionIntervalDays: v })} />
              <NumberField label="Safety stock" unit="tuần" value={sc.products[k].safetyStockWeeks} limit={SC_LIMITS.safetyStockWeeks} disabled={dis} changed={sc.products[k].safetyStockWeeks !== b.products[k].safetyStockWeeks} onChange={(v) => setProd(k, { safetyStockWeeks: v })} />
            </div>
          ))}
          <span class="f-hint">Interval: 1 = hàng ngày, 5 = hàng tuần, 10 = 2 tuần/lần, 15 = 3 tuần/lần.</span>
        </fieldset>

        <fieldset>
          <legend>Lập kế hoạch sản xuất</legend>
          <NumberField label="Frozen period of production" unit="tuần" value={sc.frozenPeriodWeeks} limit={SC_LIMITS.frozenPeriodWeeks} disabled={dis} changed={sc.frozenPeriodWeeks !== b.frozenPeriodWeeks}
            hint={<><Badge basis="r0" /> <b class="warn-text">chưa mô hình</b>: đổi ô này không đổi số nào (gợi ý SS, service level, doanh thu, giờ dây chuyền dùng frozen R0 = {data.supplyChain.frozenPeriodWeeks} tuần).</>}
            onChange={(v) => setSc({ ...sc, frozenPeriodWeeks: v })} />
        </fieldset>
      </aside>

      <div class="results">
        <WarningsPanel warnings={warnings} title="Cảnh báo liên phòng ban" />

        <Card title="Tổng quan Supply Chain">
          <Grid>
            <Metric label="Giá trị tồn kho (NL + TP)" value={eur(S.stockValue.total)} raw={S.stockValue.total} base={SB.stockValue.total} deltaKind="eur" good="down" r0={eur(data.supplyChain.totalStockValue)} basis="calibrated" causes={c('scStock')} hint="Giá trị tồn R0 từng NL/SKU × (tồn TB mô hình ÷ tồn TB baseline) → Investment: Stock" />
            <Metric label="Tồn NL / tồn TP" value={`${eur(S.stockValue.components)} / ${eur(S.stockValue.products)}`} r0={`${eur(S.stockValue.componentsR0)} / ${eur(S.stockValue.productsR0)}`} causes={c('scStock')} />
            <Metric label="Availability NL thấp nhất" value={(() => { const m = [...S.components].sort((a, b2) => a.availability - b2.availability)[0]; return `${m.key} ${pct(m.availability)}`; })()} raw={Math.min(...S.components.map((x) => x.availability))} base={Math.min(...SB.components.map((x) => x.availability))} deltaKind="pt" good="up" basis="estimate" alert={S.components.some((x) => x.availability < 0.95)} causes={c('avail')} r0="Vitamin C 84,3%" />
            <Metric label="Plan adherence (Ops)" value={pct(o.line.planAdherence)} raw={o.line.planAdherence} base={ob.line.planAdherence} deltaKind="pt" good="up" r0={pct(data.ops.results.line.planAdherence)} causes={c('adherence')} hint="= phần năng lực dây chuyền × availability NL của SKU" />
            <Metric label="Changeover / overtime (Ops)" value={`${num(o.line.changeover, 1)} / ${num(o.line.overtime, 1)} giờ/tuần`} raw={o.line.changeover} base={ob.line.changeover} deltaKind="num" good="down" causes={c('changeover')} />
            <Metric label="Đỉnh pallet kho NL / TP (Ops)" value={`${num(o.rm.peakPallets)} / ${num(o.fg.peakPallets)}`} raw={o.rm.peakPallets + o.fg.peakPallets} base={ob.rm.peakPallets + ob.fg.peakPallets} deltaKind="num" deltaDigits={0} good="down" alert={o.rm.daysOverCapacity > 20 || o.fg.daysOverCapacity > 20} causes={c('rmStock')} hint={`Sức chứa ${num(o.rm.capacity)} / ${num(o.fg.capacity)}`} />
          </Grid>
        </Card>

        <Card title="Tồn kho nguyên liệu (thứ tự cột như tab 7)">
          <SheetLegend />
          <div class="tbl-wrap">
            <table class="sheet">
              <thead><tr>
                <th>Component</th><th>Delivery reliability (%)</th><th>Stock (pieces or liters)</th><th>Stock (weeks)</th><th>Stock value (€)</th><th>Economic inventory (weeks)</th>
                <th>Demand per week</th><th>Obsoletes (%)</th><th>Component availability (%)</th><th>Bias</th><th>Amount purchased</th><th>Order size</th>
                <th class="extra">Lần nhận/round (tab 10)</th><th class="extra">SS / Lot (tuần)</th><th class="extra">Lead time + intake</th><th class="extra">SS gợi ý (99%)</th>
              </tr></thead>
              <tbody>
                {S.components.map((x) => (
                  <tr>
                    <td><b>{COMP_LABEL[x.key]}</b><div class="small-text">{x.supplier}</div></td>
                    <Cell c={x.sheet.reliability} f={(v) => pct(v)} />
                    <Cell c={x.sheet.stockUnits} f={(v) => num(v)} />
                    <Cell c={x.sheet.stockWeeks} f={(v) => num(v, 1)} />
                    <Cell c={x.sheet.stockValue} f={eur} goodDown />
                    <Cell c={x.sheet.economicWeeks} f={(v) => num(v, 1)} />
                    <Cell c={x.sheet.demandPerWeek} f={(v) => num(v)} />
                    <Cell c={x.sheet.obsoletes} f={(v) => pct(v)} />
                    <Cell c={x.sheet.availability} f={(v) => pct(v)} goodUp alert={(x.sheet.availability.value ?? 1) < 0.95} sub={x.stockoutDaysR0 ? `R0 hết ${x.stockoutDaysR0}/130 ngày` : undefined} />
                    <Cell c={x.sheet.bias} f={(v) => `${v > 0 ? '+' : ''}${pct(v)}`} />
                    <Cell c={x.sheet.amountPurchased} f={(v) => num(v)} />
                    <Cell c={x.sheet.orderSize} f={(v) => num(v)} />
                    <Cell c={x.deliveries} f={(v) => num(v, 1)} extra />
                    <td class="extra">{num(x.safetyStockWeeks, 1)} / {num(x.lotSizeWeeks, 1)}</td>
                    <td class="extra">{num(x.leadTimeWeeks, 1)} tuần</td>
                    <td class="extra">{num(x.recommendedSsWeeks, 1)} tuần {x.safetyStockWeeks < x.recommendedSsWeeks - 0.05 && <span class="ko">▲</span>}</td>
                  </tr>
                ))}
                <tr class="total"><td>TỔNG</td><td></td><td></td><td></td><td>{eur(S.stockValue.components)}{Math.abs(S.stockValue.components - S.stockValue.componentsR0) > 1 && <div class="small-text">R0 {eur(S.stockValue.componentsR0)}</div>}</td><td colSpan={11}></td></tr>
              </tbody>
            </table>
          </div>
          <p class="muted">Availability kịch bản = số R0 − (tỷ lệ thiếu hàng mới − baseline) <Badge basis="estimate" />: tỷ lệ thiếu = số lần nhận × σ × G(z) ÷ lượng dùng, z = safety stock ÷ σ trong (lead time NCC + intake time); σ gồm biến động nhu cầu (tab 12 qua BOM) và giao trễ ((1 − reliability) × lead time); lead time = ngày ÷ 7 <Badge basis="estimate" />. Cột xám (economic inventory, obsoletes, bias) giữ số R0 — chưa mô hình.</p>
        </Card>

        <Card title="Tồn kho thành phẩm (thứ tự cột như tab 7)">
          <SheetLegend />
          <div class="tbl-wrap">
            <table class="sheet">
              <thead><tr>
                <th>Warehouse</th><th>Product</th><th>Demand per week (pieces)</th><th>Service level (pieces)</th><th>Service level (order lines)</th><th>Stock (weeks)</th><th>Stock value (€)</th>
                <th>Economic inventory (weeks)</th><th>Floating stock value (€)</th><th>Obsoletes (%)</th><th>Obsoletes value per week (€)</th><th>Forecast error (MAPE)</th><th>Bias</th>
                <th>Production batches</th><th>Start up productivity loss (€)</th><th>Rejects (value, €)</th><th>Production plan adherence (%)</th>
                <th class="extra">Interval / SS</th><th class="extra">SS gợi ý (theo SL hứa)</th><th class="extra">Tuổi tồn max / cho phép</th>
              </tr></thead>
              <tbody>
                {S.products.map((x) => (
                  <tr>
                    <td>DC Netherlands</td>
                    <td><b>{x.sku}</b></td>
                    <Cell c={x.sheet.demandPerWeek} f={(v) => num(v)} />
                    <Cell c={x.sheet.slPieces} f={(v) => pct(v)} goodUp alert={(x.sheet.slPieces.value ?? 1) < x.targetServiceLevel} sub={`hứa ${pct(x.targetServiceLevel, 0)}`} />
                    <Cell c={x.sheet.slOrderLines} f={(v) => pct(v)} />
                    <Cell c={x.sheet.stockWeeks} f={(v) => num(v, 1)} />
                    <Cell c={x.sheet.stockValue} f={eur} goodDown />
                    <Cell c={x.sheet.economicWeeks} f={(v) => num(v, 1)} />
                    <Cell c={x.sheet.floatingStock} f={eur} />
                    <Cell c={x.sheet.obsoletes} f={(v) => pct(v)} />
                    <Cell c={x.sheet.obsoleteValuePerWeek} f={eur} />
                    <Cell c={x.sheet.mape} f={(v) => pct(v)} />
                    <Cell c={x.sheet.bias} f={(v) => `${v > 0 ? '+' : ''}${pct(v)}`} />
                    <Cell c={x.sheet.batches} f={(v) => num(v, v % 1 ? 1 : 0)} />
                    <Cell c={x.sheet.startupLoss} f={eur} goodDown />
                    <Cell c={x.sheet.rejects} f={eur} />
                    <Cell c={x.sheet.planAdherence} f={(v) => pct(v)} goodUp />
                    <td class="extra">{x.intervalDays} ngày / {num(x.safetyStockWeeks, 1)} tuần</td>
                    <td class="extra">{num(x.recommendedSsWeeks, 1)} tuần</td>
                    <td class={`extra${x.allowedAgeWeeks !== null && x.maxAgeWeeks > x.allowedAgeWeeks ? ' ko' : ''}`}>{num(x.maxAgeWeeks, 1)} / {x.allowedAgeWeeks === null ? 'thiếu dữ liệu' : `${num(x.allowedAgeWeeks, 1)} tuần`}</td>
                  </tr>
                ))}
                <tr class="total"><td>TỔNG</td><td></td><td>{num(S.products.reduce((a, x) => a + (x.sheet.demandPerWeek.value ?? 0), 0))}</td><td></td><td></td><td></td><td>{eur(S.stockValue.products)}{Math.abs(S.stockValue.products - S.stockValue.productsR0) > 1 && <div class="small-text">R0 {eur(S.stockValue.productsR0)}</div>}</td><td colSpan={13}></td></tr>
              </tbody>
            </table>
          </div>
          <p class="muted">
            Cột "Start up productivity loss": game ghi "per batch" nhưng 6 SKU cộng lại = €8.434 = tổng cả round → là tổng/SKU. Service level (pieces) kịch bản = SL R0 − (tỷ lệ thiếu mới − baseline) <Badge basis="estimate" />, + 0,97 × thay đổi plan adherence (hồi quy 6 SKU R0) <Badge basis="estimate" />, đã đưa vào penalty/doanh thu (tab Sales). Service level (order lines) = số R0 + cùng thay đổi. Plan adherence kịch bản = số R0 × (mô hình mới ÷ mô hình baseline). Tuổi tồn cho phép = hạn dùng {data.productShelfLifeWeeks ?? 'thiếu dữ liệu'} tuần × (1 − shelf life khách đòi).
          </p>
        </Card>

        <Card title="Liên kết sang phòng khác">
          <Table head={['Quyết định SC', 'Ảnh hưởng', 'Phòng', 'Trạng thái trong app']} rows={[
            ['Lot size NL', 'Cỡ đơn, số lần nhận hàng, đỉnh pallet & giờ công kho NL, overflow, availability (nhiều chu kỳ hơn)', 'Ops, Finance', <span class="ok">✔ đã nối</span>],
            ['Safety stock NL', 'Pallet kho NL, giá trị tồn, lãi tồn NL, availability → plan adherence', 'Ops, Finance', <span class="ok">✔ đã nối</span>],
            ['Production interval', 'Changeover, overtime, start-up loss, máy trộn (mẻ tối thiểu), đỉnh pallet kho TP, giờ nhập kho TP, tuổi tồn', 'Ops, Finance, Sales', <span class="ok">✔ đã nối</span>],
            ['Safety stock TP', 'Pallet kho TP, giá trị tồn, lãi tồn TP, SL dự kiến, tuổi tồn/hạn dùng', 'Ops, Finance, Sales', <span>✔ kho & tồn · ✔ SL → penalty/doanh thu (ước lượng)</span>],
            ['Frozen period', '(luật: ổn định lịch sản xuất, phản ứng chậm với nhu cầu)', 'Sales, Ops, Purchasing', <span class="warn-text">chưa mô hình — không đổi số nào</span>],
            ['(từ Purchasing) NCC: lead time, reliability, trade unit, rejection', 'Availability NL, SS gợi ý, cỡ đơn, cách chứa (pallet/tank)', 'SC, Ops', <span>theo NCC & điều kiện đang chọn ở tab Purchasing</span>],
            ['(từ Sales) SL hứa, shelf life, biến động nhu cầu', 'z cho SS gợi ý, tuổi tồn cho phép, σ nhu cầu', 'SC', <span>dùng hợp đồng R0 · <span class="warn-text">đổi hợp đồng: M3</span></span>],
          ]} />
        </Card>

        <Card title="Toàn bộ số liệu Supply Chain trong sheet (nguyên văn, đúng thứ tự cột)">
          <p class="muted">Các bảng dưới đây chép <b>y như file</b> <code>{data.meta.source}</code> (đọc lúc {new Date(data.meta.generatedAt).toLocaleString('vi-VN')}), không tính toán gì. Ô trống = file để trống.</p>
          <RawTable data={data} id="sc-comp" />
          <RawTable data={data} id="sc-prod" />
          <RawTable data={data} id="sc-check" />
          <RawTable data={data} id="sc-dash" />
          <RawTable data={data} id="an-comp" note="Lưu ý: tab 10 (công cụ Analysis) làm tròn Economic inventory thành số nguyên (9 / 8 / 11 / 8 / 18) trong khi tab 7 ghi 8,7 / 7,7 / 10,8 / 7,7 / 18,4. App dùng số tab 7." />
          <RawTable data={data} id="an-prod" note="Tab 10 làm tròn Economic inventory TP (8 / 7 / 8 / 8 / 7 / 7) — tab 7 ghi 7,5 / 7,5 / 7,5 / 7,6 / 7,4 / 7,5. App dùng số tab 7." />
          <RawTable data={data} id="an-wh" />
          <h4>Tồn kho theo ngày R0 (tuần nhu cầu) <span class="src">— tab 11_R0 Theo ngày</span></h4>
          <div class="row gap">
            <select value={dailyItem} onChange={(e) => setDailyItem((e.currentTarget as HTMLSelectElement).value)}>
              {[...comps, ...skus].map((k) => <option value={k}>{k}</option>)}
            </select>
            <span class="small-text">Hết hàng R0: {data.dailyStats.stockoutDays[dailyItem] ?? 0}/130 ngày</span>
          </div>
          <DailyChart values={data.daily.filter((x) => x.day >= 1).map((x) => (comps as string[]).includes(dailyItem) ? x.rmWeeks[dailyItem as ComponentKey] : x.fgWeeks[dailyItem as SkuKey])} limit={(comps as string[]).includes(dailyItem) ? sc.components[dailyItem as ComponentKey].safetyStockWeeks : sc.products[dailyItem as SkuKey].safetyStockWeeks} unit="tuần" limitLabel="Safety stock đang đặt" />
          <RawTable data={data} id="daily-stats" />
          <details>
            <summary>Tồn kho từng ngày (130 ngày × 11 mặt hàng) — tab 11</summary>
            <div class="tbl-wrap">
              <table class="sheet raw-t">
                <thead><tr><th>Ngày</th>{comps.map((k) => <th>{k}</th>)}{skus.map((k) => <th>{k}</th>)}<th>Giờ kho NL</th><th>Giờ kho TP</th></tr></thead>
                <tbody>{data.daily.map((x) => <tr><td>{x.day}</td>{comps.map((k) => <td class={x.rmWeeks[k] === 0 ? 'ko' : ''}>{num(x.rmWeeks[k], 2)}</td>)}{skus.map((k) => <td class={x.fgWeeks[k] === 0 ? 'ko' : ''}>{num(x.fgWeeks[k], 2)}</td>)}<td>{num(x.rmHours, 2)}</td><td>{num(x.fgHours, 2)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
          <details>
            <summary>Nhu cầu theo tuần (26 tuần + thống kê) — tab 12</summary>
            <RawTable data={data} id="week" />
            <Table head={['SKU', 'TB/tuần', 'Độ lệch chuẩn', 'CV']} rows={skus.map((k) => [k, num(data.weekly.mean[k], 2), num(data.weekly.std[k], 2), pct(data.weekly.cv[k])])} />
          </details>
          <details>
            <summary>Sản phẩm, BOM, nguyên liệu — tab 3</summary>
            <RawTable data={data} id="prod-bom" />
            <RawTable data={data} id="comp-spec" />
          </details>
          <HistoryTable data={data} groups={/Nguyên liệu|Sản phẩm/i} title="Lịch sử Round -2 so với Round 0 (nguyên liệu & sản phẩm)" />
        </Card>
      </div>
    </div>
  );
}

function SheetLegend() {
  return (
    <p class="sheet-legend">
      <span class="lg-sheet">số sheet</span> = đúng số tab 7 ·{' '}
      <span class="lg-scaled">số kịch bản</span> = đổi theo quyết định (dòng nhỏ bên dưới là số R0) ·{' '}
      <span class="lg-nm">xám</span> = giữ số R0, chưa mô hình
    </p>
  );
}

function Cell({ c, f, goodUp, goodDown, alert, sub, extra }: { c: SheetCell; f: (v: number) => string; goodUp?: boolean; goodDown?: boolean; alert?: boolean; sub?: string; extra?: boolean }) {
  const cls = `${extra ? 'extra ' : ''}${c.basis === 'notModeled' ? 'nm' : ''}${alert ? ' ko' : ''}`;
  if (c.value === null) return <td class={cls} title="Thiếu dữ liệu trong file">—</td>;
  const changed = c.basis === 'scaled' || c.basis === 'model';
  const d = changed && c.r0 !== null ? c.value - c.r0 : 0;
  const tone = !changed || Math.abs(d) < 1e-9 ? '' : goodUp ? (d > 0 ? 'good' : 'bad') : goodDown ? (d < 0 ? 'good' : 'bad') : '';
  return (
    <td class={cls} title={c.basis === 'notModeled' ? 'Giữ số R0 — chưa mô hình' : changed ? 'Số kịch bản (mô hình); dòng nhỏ là số R0 trong sheet' : 'Đúng số trong sheet'}>
      {changed ? <b class={tone}>{f(c.value)}</b> : f(c.value)}
      {changed && c.r0 !== null && <div class="small-text">R0 {f(c.r0)}</div>}
      {sub && <div class="small-text">{sub}</div>}
    </td>
  );
}

