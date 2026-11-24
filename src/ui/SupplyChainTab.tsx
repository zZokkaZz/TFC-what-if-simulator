// Tab Supply Chain (M2): quyết định SC (sửa được theo vai trò), kết quả tồn kho/availability/service level,
// ảnh hưởng sang Ops & Finance, cảnh báo liên phòng ban, dữ liệu R0 (tab 7, 11, 12).
import { useState } from 'preact/hooks';
import type { ComponentKey, Round0Data, SkuKey } from '../data/types';
import type { Inputs, Results, ScInputs } from '../model/types';
import type { Warning } from '../model/warnings';
import { SC_LIMITS } from '../sync/limits';
import { Badge, Card, Grid, Metric, NumberField, Table } from './components';
import { DailyChart } from './charts';
import { eur, num, pct, signed } from './format';
import { causesFor } from './trace';
import { WarningsPanel } from './WarningsPanel';

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
            hint={<>Dùng trong gợi ý safety stock TP và service level dự kiến <Badge basis="estimate" />. Tác động lên giờ dây chuyền <span class="warn-text">chưa mô hình</span>.</>}
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

        <Card title="Nguyên liệu: tồn kho & availability">
          <Table head={['NL', 'NCC', 'SS / Lot (tuần)', 'Cỡ đơn', 'Lần nhận/round', 'Tồn TB (tuần)', 'Chỗ chứa TB', 'Giá trị tồn', 'Lead time NCC + intake', 'Reliability', 'Availability', 'SS gợi ý (99%)']}
            rows={S.components.map((x) => {
              const bx = SB.components.find((y) => y.key === x.key)!;
              return [
                COMP_LABEL[x.key], x.supplier, `${num(x.safetyStockWeeks, 1)} / ${num(x.lotSizeWeeks, 1)}`, num(x.orderUnits), num(x.deliveriesPerRound, 1), num(x.avgStockWeeks, 2),
                `${num(x.avgLocations, 1)} ${x.storage === 'tank' ? 'tank' : 'pallet'}`,
                <span>{eur(x.stockValue)}{Math.abs(x.stockValue - bx.stockValue) > 1 && <span class={`delta ${x.stockValue < bx.stockValue ? 'good' : 'bad'}`}> {signed(x.stockValue - bx.stockValue, 'eur')}</span>}</span>,
                `${num(x.leadTimeWeeks, 1)} tuần`, pct(x.reliability),
                <span class={x.availability < 0.95 ? 'ko' : ''}>{pct(x.availability)}{Math.abs(x.availability - bx.availability) > 0.0005 && <span class={`delta ${x.availability > bx.availability ? 'good' : 'bad'}`}> {signed(x.availability - bx.availability, 'pt')}</span>}{x.stockoutDaysR0 ? <div class="small-text">R0 hết {x.stockoutDaysR0}/130 ngày</div> : null}</span>,
                <span>{num(x.recommendedSsWeeks, 1)} tuần {x.safetyStockWeeks < x.recommendedSsWeeks - 0.05 && <span class="ko">▲</span>}</span>,
              ];
            })} />
          <p class="muted">Availability = số R0 − (tỷ lệ thiếu hàng mới − tỷ lệ thiếu hàng baseline) <Badge basis="estimate" />. Tỷ lệ thiếu hàng = số lần nhận × σ × G(z) ÷ lượng dùng, z = safety stock ÷ σ trong (lead time NCC + intake time); σ gồm biến động nhu cầu (tab 12, qua BOM) và giao trễ (độ lệch = (1 − reliability) × lead time). Lead time tính theo ngày lịch ÷ 7 <Badge basis="estimate" />. Lead time và reliability lấy từ NCC đang chọn (Purchasing — M3 sẽ cho đổi).</p>
        </Card>

        <Card title="Thành phẩm: tồn kho, service level, hạn dùng">
          <Table head={['SKU', 'Interval / SS', 'Mẻ/round', 'Tồn TB (tuần)', 'Giá trị tồn', 'Availability NL', 'SL pieces dự kiến', 'SS gợi ý (theo SL hứa)', 'Tuổi tồn tối đa / cho phép']}
            rows={S.products.map((x) => {
              const bx = SB.products.find((y) => y.sku === x.sku)!;
              return [
                x.sku, `${x.intervalDays} ngày / ${num(x.safetyStockWeeks, 1)} tuần`, num(x.batchesPerRound, 1), num(x.avgStockWeeks, 2),
                <span>{eur(x.stockValue)}{Math.abs(x.stockValue - bx.stockValue) > 1 && <span class={`delta ${x.stockValue < bx.stockValue ? 'good' : 'bad'}`}> {signed(x.stockValue - bx.stockValue, 'eur')}</span>}</span>,
                pct(x.componentAvailability),
                <span class={x.slPiecesEst < x.targetServiceLevel ? 'ko' : 'ok'}>{pct(x.slPiecesEst)}{Math.abs(x.slPiecesEst - bx.slPiecesEst) > 0.0005 && <span class={`delta ${x.slPiecesEst > bx.slPiecesEst ? 'good' : 'bad'}`}> {signed(x.slPiecesEst - bx.slPiecesEst, 'pt')}</span>}<div class="small-text">R0 {pct(x.slPiecesR0)} · hứa {pct(x.targetServiceLevel, 0)}</div></span>,
                `${num(x.recommendedSsWeeks, 1)} tuần`,
                <span class={x.allowedAgeWeeks !== null && x.maxAgeWeeks > x.allowedAgeWeeks ? 'ko' : ''}>{num(x.maxAgeWeeks, 1)} / {x.allowedAgeWeeks === null ? 'thiếu dữ liệu' : `${num(x.allowedAgeWeeks, 1)} tuần`}</span>,
              ];
            })} />
          <p class="muted">
            SL pieces dự kiến = SL R0 − (tỷ lệ thiếu mới − baseline) <Badge basis="estimate" />, σ trong (interval + frozen period). <b class="warn-text">Chưa đưa vào doanh thu / penalty</b> (Sales — M3), nên giảm safety stock TP hiện chỉ thấy lợi (tồn kho, lãi) mà chưa thấy thiệt.
            SL R0 thấp hơn hứa chủ yếu do plan adherence và thiếu Vitamin C, không phải do safety stock — nên SS gợi ý (theo z của SL hứa) thấp hơn SS đang đặt.
            Tuổi tồn cho phép = hạn dùng {data.productShelfLifeWeeks ?? 'thiếu dữ liệu'} tuần × (1 − shelf life khách đòi) — từ tab 3 và tab 6.
          </p>
        </Card>

        <Card title="Liên kết sang phòng khác">
          <Table head={['Quyết định SC', 'Ảnh hưởng', 'Phòng', 'Trạng thái trong app']} rows={[
            ['Lot size NL', 'Cỡ đơn, số lần nhận hàng, đỉnh pallet & giờ công kho NL, overflow, availability (nhiều chu kỳ hơn)', 'Ops, Finance', <span class="ok">✔ đã nối</span>],
            ['Safety stock NL', 'Pallet kho NL, giá trị tồn, lãi tồn NL, availability → plan adherence', 'Ops, Finance', <span class="ok">✔ đã nối</span>],
            ['Production interval', 'Changeover, overtime, start-up loss, máy trộn (mẻ tối thiểu), đỉnh pallet kho TP, giờ nhập kho TP, tuổi tồn', 'Ops, Finance, Sales', <span class="ok">✔ đã nối</span>],
            ['Safety stock TP', 'Pallet kho TP, giá trị tồn, lãi tồn TP, SL dự kiến, tuổi tồn/hạn dùng', 'Ops, Finance, Sales', <span>✔ kho & tồn · <span class="warn-text">SL → doanh thu/penalty: M3</span></span>],
            ['Frozen period', 'Gợi ý SS TP, SL dự kiến', 'Sales, Ops, Purchasing', <span class="warn-text">một phần (giờ dây chuyền chưa mô hình)</span>],
            ['(từ Purchasing) NCC: lead time, reliability, trade unit, rejection', 'Availability NL, SS gợi ý, cỡ đơn, cách chứa (pallet/tank)', 'SC, Ops', <span>dùng NCC hiện tại · <span class="warn-text">đổi NCC: M3</span></span>],
            ['(từ Sales) SL hứa, shelf life, biến động nhu cầu', 'z cho SS gợi ý, tuổi tồn cho phép, σ nhu cầu', 'SC', <span>dùng hợp đồng R0 · <span class="warn-text">đổi hợp đồng: M3</span></span>],
          ]} />
        </Card>

        <Card title="Dữ liệu R0 (tab 7, 11, 12)">
          {data.supplyChain.dashboard.length > 0 && (
            <Table head={['KPI (dashboard game)', 'Round -2', 'Round -1', 'Round 0', 'Nhận xét của game']}
              rows={data.supplyChain.dashboard.map((k) => [k.kpi, k.rMinus2 === null ? '—' : /%/.test(k.kpi) ? pct(k.rMinus2, 2) : num(k.rMinus2, 2), k.rMinus1 === null ? '—' : /%/.test(k.kpi) ? pct(k.rMinus1, 2) : num(k.rMinus1, 2), k.r0 === null ? '—' : /%/.test(k.kpi) ? pct(k.r0, 2) : num(k.r0, 2), k.comment ?? ''])} />
          )}
          <h4>Tồn kho theo ngày R0 (tuần nhu cầu) — tab 11</h4>
          <div class="row gap">
            <select value={dailyItem} onChange={(e) => setDailyItem((e.currentTarget as HTMLSelectElement).value)}>
              {[...comps, ...skus].map((k) => <option value={k}>{k}</option>)}
            </select>
            <span class="small-text">Hết hàng R0: {data.dailyStats.stockoutDays[dailyItem] ?? 0}/130 ngày</span>
          </div>
          <DailyChart values={data.daily.filter((x) => x.day >= 1).map((x) => (comps as string[]).includes(dailyItem) ? x.rmWeeks[dailyItem as ComponentKey] : x.fgWeeks[dailyItem as SkuKey])} limit={(comps as string[]).includes(dailyItem) ? sc.components[dailyItem as ComponentKey].safetyStockWeeks : sc.products[dailyItem as SkuKey].safetyStockWeeks} unit="tuần" limitLabel="Safety stock đang đặt" />
          <details>
            <summary>Tồn kho NL R0 (tab 7)</summary>
            <Table head={['Component', 'Reliability NCC', 'Tồn (tuần)', 'Giá trị tồn', 'Economic inv. (tuần)', 'Nhu cầu/tuần', 'Availability', 'Obsoletes', 'Bias', 'Đã mua', 'Cỡ đơn']}
              rows={data.supplyChain.componentStock.map((x) => [x.component, pct(x.supplierReliability), num(x.stockWeeks, 1), eur(x.stockValue), num(x.economicWeeks, 1), num(x.demandPerWeek), pct(x.availability), x.obsoletes === null ? '—' : pct(x.obsoletes), x.bias === null ? '—' : num(x.bias, 3), num(x.purchasedInRound), num(x.orderSize)])} />
          </details>
          <details>
            <summary>Tồn kho TP R0 (tab 7)</summary>
            <Table head={['SKU', 'Nhu cầu/tuần', 'SL pieces', 'SL order lines', 'Tồn (tuần)', 'Giá trị tồn', 'Floating stock', 'Obsolete', 'Obsolete/tuần', 'MAPE', 'Bias', 'Mẻ', 'Start-up loss', 'Rejects', 'Plan adherence']}
              rows={data.supplyChain.productStock.map((x) => [x.sku, x.demandPerWeek === null ? '—' : num(x.demandPerWeek), pct(x.slPieces), pct(x.slOrderLines), num(x.stockWeeks, 1), eur(x.stockValue), x.floatingStockValue === null ? '—' : eur(x.floatingStockValue), pct(x.obsolete), x.obsoleteValuePerWeek === null ? '—' : eur(x.obsoleteValuePerWeek), pct(x.mape, 0), x.bias === null ? '—' : num(x.bias, 3), x.batches, eur(x.startupLossEur), x.rejectsEur === null ? '—' : eur(x.rejectsEur), pct(x.planAdherence)])} />
          </details>
          <details>
            <summary>Nhu cầu theo tuần R0 (tab 12)</summary>
            <Table head={['SKU', 'TB/tuần', 'Độ lệch chuẩn', 'CV', 'Thấp nhất', 'Cao nhất']}
              rows={skus.map((s) => {
                const vals = data.weekly.weeks.filter((w) => w.week >= 1).map((w) => w.demand[s]);
                return [s, num(data.weekly.mean[s]), num(data.weekly.std[s]), pct(data.weekly.cv[s], 0), num(Math.min(...vals)), num(Math.max(...vals))];
              })} />
          </details>
        </Card>
      </div>
    </div>
  );
}
