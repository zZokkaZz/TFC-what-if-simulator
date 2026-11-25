// Tab Sales (M3): ô hợp đồng từng khách (mục 1: trade unit, order deadline, CI game hiển thị — lựa chọn đọc từ tab 6
// "LỰA CHỌN HỢP ĐỒNG SALES"), SL dự kiến → penalty service level → realized revenue, neo vào số R0 (tab 2, 6).
// Chưa có ô: SL hứa, shelf life, payment term khách, promotion (các mục sau).
import type { ComponentChildren } from 'preact';
import type { Round0Data } from '../data/types';
import type { Inputs, Results, SalesCustomerTerms, SalesInputs } from '../model/types';
import type { Warning } from '../model/warnings';
import { CI_STEP_KEYS, salesOption, salesOptionChecks } from '../model/sales';
import { SALES_LIMITS } from '../sync/limits';
import { Badge, Card, Grid, Metric, NumberField, OptNumberField, SelectField, Table } from './components';
import { eur, num, pct } from './format';
import { causesFor } from './trace';
import { WarningsPanel } from './WarningsPanel';
import { RawTable } from './RawTable';
import { CONSERVATIVE_NOTE, capacityChanged } from './conservative';
import { COEFFS } from '../model/assumptions';

/** Ghi chú cạnh ô trade unit / order deadline khi chưa nhập CI game (người dùng chốt: hệ số CI trong COEFFS giữ = 0). */
export const CI_MISSING_NOTE = 'Chưa tính phần giá tăng (CI) — lựa chọn này đang trông tệ hơn thực tế. Nhập CI game hiển thị để tính đúng.';
/** Đổi điều khoản theo hướng làm CI GIẢM (vd promotion cao hơn, SL hứa thấp hơn, trade unit lớn hơn) — hệ số CI = 0 nên lựa chọn trông tốt hơn thực tế. */
export const CI_DOWN_NOTE = 'Chưa tính phần giá giảm (CI) — lựa chọn này đang trông tốt hơn thực tế. Nhập CI game hiển thị để tính đúng.';

interface Props {
  data: Round0Data;
  inputs: Inputs;
  base: Inputs;
  res: Results;
  baseRes: Results;
  changed: string[];
  setSales: (s: SalesInputs) => void;
  editable: boolean;
  lockReason?: string;
  warnings: Warning[];
}

/** Ô mang tên cột sheet: không đổi → đúng số sheet; đổi → số kịch bản (đậm, ước lượng) + "R0 …". */
function Cell({ v, r0, f }: { v: number; r0: number; f: (x: number) => string }): ComponentChildren {
  if (Math.abs(v - r0) <= 1e-9 * Math.max(1, Math.abs(r0))) return <>{f(r0)}</>;
  return <><b>{f(v)}</b> <Badge basis="estimate" /><div class="m-r0">R0 {f(r0)}</div></>;
}

export function SalesTab({ data, inputs, base, res, baseRes, changed, setSales, editable, lockReason, warnings }: Props) {
  const S = res.sales, SB = baseRes.sales;
  const c = causesFor('sales', changed);
  const dis = !editable;
  const sa = inputs.sales, sb = base.sales;
  const anyChanged = changed.some((p) => p.startsWith('sales.'));
  const setCust = (name: string, patch: Partial<SalesCustomerTerms>) => setSales({ ...sa, customers: { ...sa.customers, [name]: { ...sa.customers[name], ...patch } } });
  const optTU = salesOption(data, 'tradeUnit'), optDL = salesOption(data, 'orderDeadline');
  const optSLT = salesOption(data, 'serviceLevelType'), optPromo = salesOption(data, 'promotionalPressure'), optHz = salesOption(data, 'promotionHorizon');
  const promoLabel = (x: string) => { const lv = optPromo?.levels?.[x]; return !lv ? x : lv.min === lv.max ? `${x} (+${num(lv.min * 100, 1)}%)` : `${x} (+${num(lv.min * 100, 1)}–${num(lv.max * 100, 1)}%)`; };
  const pctLimit = (l: typeof SALES_LIMITS.serviceLevel) => ({ ...l, min: Math.round(l.min * 100), max: Math.round(l.max * 100) });
  const opts = (xs: string[] | null | undefined, cur: string, r0: string) => [...new Set([...(xs ?? []), cur])].map((x) => ({ value: x, label: `${x}${x === r0 ? ' (R0)' : ''}` }));
  const checks = salesOptionChecks(data);
  const badChecks = checks.filter((x) => !x.same || !x.inChoices);
  const sl = data.kpiQuick.find((k) => /^Service level outbound/.test(k.label))?.value ?? null;
  const fin = (label: string) => data.finance.lines.find((l) => l.label.normalize('NFC') === label.normalize('NFC'))?.value ?? null;
  return (
    <div class="two-col">
      <aside class="decisions">
        <div class="dec-head">
          <h2>Quyết định Sales</h2>
          <button class="btn" disabled={!anyChanged || dis} onClick={() => setSales(structuredClone(sb))}>Reset Sales về R0</button>
        </div>
        {lockReason && <p class="lock">🔒 {lockReason}</p>}
        {data.sales.options.length === 0
          ? <p class="warn-text">Sheet chưa có khối "LỰA CHỌN HỢP ĐỒNG SALES" (tab 6) — thiếu dữ liệu danh sách lựa chọn; dropdown chỉ có giá trị R0.</p>
          : <p class="f-hint">Lựa chọn đọc từ tab 6 "LỰA CHỌN HỢP ĐỒNG SALES" (form Negotiate của game). Đổi điều khoản thì game đổi contract index (công thức không công bố) — bấm Calculate trong game rồi nhập <b>CI game hiển thị</b>.</p>}
        {data.sales.contracts.map((k) => {
          const t = sa.customers[k.customer], tb = sb.customers[k.customer];
          const cu = S.customers.find((x) => x.customer === k.customer)!;
          if (!t || !tb) return null;
          return (
            <fieldset>
              <legend>{k.customer}</legend>
              <div class="pur-grid">
                <SelectField label="Trade unit" value={t.tradeUnit} disabled={dis} changed={t.tradeUnit !== tb.tradeUnit} options={opts(optTU?.choices, t.tradeUnit, tb.tradeUnit)} onChange={(v) => setCust(k.customer, { tradeUnit: v })} hint="→ giờ soạn hàng kho TP (Ops)" />
                <SelectField label="Order deadline" value={t.orderDeadline} disabled={dis} changed={t.orderDeadline !== tb.orderDeadline} options={opts(optDL?.choices, t.orderDeadline, tb.orderDeadline)} onChange={(v) => setCust(k.customer, { orderDeadline: v })} hint="Chưa mô hình vào số — chỉ cảnh báo" />
                <SelectField label="Service level type" value={t.serviceLevelType} disabled={dis} changed={t.serviceLevelType !== tb.serviceLevelType} options={opts(optSLT?.choices, t.serviceLevelType, tb.serviceLevelType)} onChange={(v) => setCust(k.customer, { serviceLevelType: v })} hint="→ loại đo của mốc penalty" />
                <NumberField label="Service level" unit="%" value={Math.round(t.serviceLevel * 1e6) / 1e4} limit={pctLimit(SALES_LIMITS.serviceLevel)} step={1} disabled={dis} changed={Math.abs(t.serviceLevel - tb.serviceLevel) > 1e-9} onChange={(v) => setCust(k.customer, { serviceLevel: v / 100 })} hint="→ mốc penalty (ước lượng)" />
                <NumberField label="Shelf life" unit="%" value={Math.round(t.shelfLife * 1e6) / 1e4} limit={pctLimit(SALES_LIMITS.shelfLife)} step={1} disabled={dis} changed={Math.abs(t.shelfLife - tb.shelfLife) > 1e-9} onChange={(v) => setCust(k.customer, { shelfLife: v / 100 })} hint={`→ tuổi tồn cho phép ${data.productShelfLifeWeeks ?? '?'} tuần × (1 − shelf life) → obsolete`} />
                <NumberField label="Payment term" unit="tuần" value={t.paymentTermWeeks} limit={SALES_LIMITS.paymentTermWeeks} step={1} disabled={dis} changed={t.paymentTermWeeks !== tb.paymentTermWeeks} onChange={(v) => setCust(k.customer, { paymentTermWeeks: v })} hint="→ phải thu (AR) → Investment" />
                <SelectField label="Promotional pressure" value={t.promotionalPressure} disabled={dis} changed={t.promotionalPressure !== tb.promotionalPressure} options={opts(optPromo?.choices, t.promotionalPressure, tb.promotionalPressure).map((o) => ({ ...o, label: o.label.replace(o.value, promoLabel(o.value)) }))} onChange={(v) => setCust(k.customer, { promotionalPressure: v })} hint="→ nhu cầu (ước lượng)" />
                <SelectField label="Promotion horizon" value={t.promotionHorizon} disabled={dis} changed={t.promotionHorizon !== tb.promotionHorizon} options={opts(optHz?.choices, t.promotionHorizon, tb.promotionHorizon)} onChange={(v) => setCust(k.customer, { promotionHorizon: v })} hint="Chưa mô hình vào số — chỉ cảnh báo" />
              </div>
              {(() => {
                const up = CI_STEP_KEYS.some((x) => cu.ciSteps[x] > 0), down = CI_STEP_KEYS.some((x) => cu.ciSteps[x] < 0);
                return <>
                  {t.ciGame === null && (up || !down) && <p class={`${up ? 'warn-text' : 'muted'} small-text`}>{CI_MISSING_NOTE}</p>}
                  {t.ciGame === null && down && <p class="warn-text small-text">{CI_DOWN_NOTE}</p>}
                </>;
              })()}
              <div class="pur-grid pur-game">
                <OptNumberField label="CI game hiển thị" value={t.ciGame} limit={SALES_LIMITS.ciGame} disabled={dis} changed={t.ciGame !== tb.ciGame}
                  placeholder={`trống = ${num(cu.ciBasis === 'game' ? k.contractIndex : cu.contractIndex, 4)}`} hint={`Trống: CI R0 ${num(k.contractIndex, 4)}${cu.ciStale ? ' × hệ số ước lượng' : ''}`}
                  onChange={(v) => setCust(k.customer, { ciGame: v })} />
              </div>
              {cu.ciStale && <p class="warn-text small-text">⚠ Chưa nhập CI game: CI ước lượng {num(cu.contractIndex, 4)} (hệ số CI của mọi ô hợp đồng Sales trong COEFFS = 0 theo người dùng chốt — chưa xác minh) <Badge basis="estimate" /></p>}
            </fieldset>
          );
        })}
        {data.sales.options.filter((o) => o.key !== 'shortageRule' && o.key !== 'skus').map((o) => <p class="muted small-text"><b>{o.field}</b> (Info Center): {o.impact}</p>)}
        <p class="muted small-text">Chưa có ô: shortage rule, SKU bán cho khách (giữ R0).</p>
      </aside>

      <section class="results">
      <p class="pending">Đã nối (ước lượng, neo R0): <b>SL hứa / SL type → mốc penalty</b>, <b>shelf life → tuổi tồn → obsolete/scrap</b>, <b>promotion → nhu cầu → sản xuất, tồn kho, SL</b>, <b>payment term → phải thu → Investment</b>, <b>trade unit → giờ soạn hàng</b>, <b>CI game → contracted sales</b>. Order deadline, promotion horizon: chỉ cảnh báo. Phần giá (CI) khi đổi điều khoản: <b>chưa tính</b> (hệ số = 0) — nhập CI game.</p>
      {S.customers.some((x) => x.outOfRange) && <p class="lock">⚠ <b>Ngoài vùng dữ liệu R0:</b> {S.customers.filter((x) => x.outOfRange).map((x) => x.customer).join(', ')} — service level rơi xa R0 (mức thiếu &gt; {COEFFS.outOfRangeFactor.value.toLocaleString('vi-VN')} × R0, hệ số chưa xác minh), penalty là ngoại suy tuyến tính từ 1 điểm R0{S.customers.some((x) => x.capped) ? '; có khách bị chặn ở doanh thu 0' : ''}. Chỉ nên đọc chiều hướng, không đọc độ lớn.</p>}
      <WarningsPanel warnings={warnings} filterTo="Sales" title="Cảnh báo liên quan Sales" />

      <Card title="Tổng quan Sales">
        <Grid>
          {capacityChanged(res, baseRes) && <Metric label="Realized revenue — thận trọng" value={eur(res.conservative.realizedRevenue)} raw={res.conservative.realizedRevenue} base={SB.realizedRevenue} deltaKind="eur" good="up" basis="estimate" hint={CONSERVATIVE_NOTE} />}
          <Metric label="Realized revenue" value={eur(S.realizedRevenue)} raw={S.realizedRevenue} base={SB.realizedRevenue} deltaKind="eur" good="up" r0={eur(data.finance.totals.realizedRevenue)} causes={c} hint="Contracted sales (R0 × CI ÷ CI R0) + penalty service level" />
          <Metric label="Penalty service level (3 khách)" value={eur(S.penaltyTotal)} raw={S.penaltyTotal} base={SB.penaltyTotal} deltaKind="eur" good="up" r0={eur(SB.penaltyTotal)} basis="estimate" causes={c} hint="Penalty R0 từng khách × (mức thiếu SL mới ÷ mức thiếu R0)" />
          <Metric label="Service level outbound order lines" value={S.slOutbound === null ? 'thiếu dữ liệu' : pct(S.slOutbound)} raw={S.slOutbound ?? undefined} base={SB.slOutbound ?? undefined} deltaKind="pt" good="up" r0={sl === null ? 'thiếu dữ liệu' : pct(sl)} basis="estimate" causes={c} hint="Dashboard Sales (tab 1) + thay đổi TB gia quyền order lines/tuần của 3 khách" />
          <Metric label="Gross margin" value={eur(res.finance.grossMargin)} raw={res.finance.grossMargin} base={baseRes.finance.grossMargin} deltaKind="eur" good="up" r0={eur(data.finance.totals.grossMargin)} causes={c} />
        </Grid>
      </Card>

      <Card title="Theo khách hàng (hợp đồng tab 6, P&L tab 2)">
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Khách hàng</th><th>Contract index</th><th>Trade unit</th><th>Order deadline</th><th>SL type</th><th>SL hứa</th><th>Service level (order lines)</th><th>Service level (pieces)</th><th>Mức thiếu so với hứa</th><th>Contracted sales (€)</th><th>Penalty service level (€)</th><th>Revenue (€)</th><th>Attained contract index</th></tr></thead>
            <tbody>
              {S.customers.map((x) => (
                <tr>
                  <td>{x.customer}{x.outOfRange && <> <span class="badge badge-oor" title={`Mức thiếu SL ${num(x.shortfall * 100, 1)} điểm > ${COEFFS.outOfRangeFactor.value.toLocaleString('vi-VN')} × mức thiếu R0 (${num(x.shortfallR0 * 100, 1)} điểm): penalty ngoại suy xa điểm R0 duy nhất, kém tin cậy`}>ngoài vùng dữ liệu R0</span></>}{x.capped && <div class="warn-text small-text">penalty đã chặn = contracted (doanh thu 0)</div>}</td>
                  <td>{Math.abs(x.contractIndex - x.contractIndexR0) < 1e-12 ? num(x.contractIndexR0, 4) : <><b>{num(x.contractIndex, 4)}</b> {x.ciBasis === 'game' ? <span class="badge badge-game">số game</span> : <Badge basis="estimate" />}<div class="m-r0">R0 {num(x.contractIndexR0, 4)}</div></>}{x.ciStale && Math.abs(x.contractIndex - x.contractIndexR0) < 1e-12 && <div class="warn-text small-text">chưa nhập CI game</div>}</td>
                  <td>{x.tradeUnit === x.tradeUnitR0 ? x.tradeUnit : <><b>{x.tradeUnit}</b><div class="m-r0">R0 {x.tradeUnitR0}</div></>}</td>
                  <td>{x.orderDeadline === x.orderDeadlineR0 ? x.orderDeadline : <><b>{x.orderDeadline}</b><div class="m-r0">R0 {x.orderDeadlineR0}</div></>}</td>
                  <td>{x.serviceLevelType}</td>
                  <td>{Math.abs(x.promised - x.termsR0.serviceLevel) < 1e-9 && x.serviceLevelType === x.termsR0.serviceLevelType ? pct(x.promised, 0) : <><b>{pct(x.promised, 0)} {x.serviceLevelType}</b><div class="m-r0">R0 {pct(x.termsR0.serviceLevel, 0)} {x.termsR0.serviceLevelType}</div></>}</td>
                  <td><Cell v={x.slOrderLines} r0={x.slOrderLinesR0} f={(v) => pct(v)} /></td>
                  <td><Cell v={x.slPieces} r0={x.slPiecesR0} f={(v) => pct(v)} /></td>
                  <td><Cell v={x.shortfall} r0={x.shortfallR0} f={(v) => `${num(v * 100, 1)} điểm`} /></td>
                  <td>{Math.abs(x.contracted - x.contractedR0) < 1e-9 ? num(x.contractedR0) : <><b>{num(x.contracted)}</b> {x.ciBasis === 'game' ? <span class="badge badge-game" title="Contracted R0 × CI game ÷ CI R0">số game</span> : <Badge basis="estimate" />}<div class="m-r0">R0 {num(x.contractedR0)}</div></>}</td>
                  <td><Cell v={x.penalty} r0={x.penaltyR0} f={(v) => num(v)} /></td>
                  <td><Cell v={x.revenue} r0={x.revenueR0} f={(v) => num(v)} /></td>
                  <td><Cell v={x.attainedCi} r0={x.attainedCiR0} f={(v) => num(v, 3)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="muted small-text">
          Service level dự kiến (ước lượng) = SL R0 + thay đổi SL TP các SKU khách mua (gia quyền nhu cầu khách × SKU, tab 6). SL TP từng SKU = SL R0 − thay đổi tỷ lệ thiếu hàng (safety stock TP, production interval) + {num(S.adherenceSlope.slope, 2)} × thay đổi plan adherence
          (độ dốc hồi quy 6 SKU R0, R² = {num(S.adherenceSlope.r2, 2)}; plan adherence đã gồm availability NL và capacity dây chuyền). Frozen period: chưa mô hình.
          Penalty = penalty R0 của khách × (contracted ÷ contracted R0) × (mức thiếu mới ÷ mức thiếu R0); đạt/vượt SL hứa → 0, <b>thưởng khi vượt chưa tính</b>. Attained CI kịch bản = attained CI R0 × (revenue mới ÷ revenue R0).
          Contracted sales = R0 (tab 2) × CI ÷ CI R0 (ước lượng: nhu cầu giữ R0); CI = số game đội nhập, bỏ trống thì CI R0 × (1 + hệ số × bậc) theo COEFFS.
        </p>
      </Card>

      <Card title="Promotion, shelf life, payment term theo khách (ước lượng)">
        <Table head={['Khách hàng', 'Promotion', 'Nhu cầu (đv/tuần)', 'Shelf life → tuổi tồn cho phép', 'Payment term', 'Phải thu AR (€)']}
          rows={S.customers.map((x) => {
            const A = (s: number) => (data.productShelfLifeWeeks === null ? 'thiếu dữ liệu' : `${num(data.productShelfLifeWeeks * (1 - s), 1)} tuần`);
            const ch = (a: string, b: string) => (a === b ? a : <><b>{a}</b><div class="m-r0">R0 {b}</div></>);
            return [x.customer, ch(x.terms.promotionalPressure, x.termsR0.promotionalPressure),
              Math.abs(x.demand - x.demandR0) < 1e-9 ? num(x.demandR0) : <><b>{num(x.demand)}</b> <Badge basis="estimate" /><div class="m-r0">R0 {num(x.demandR0)}</div></>,
              ch(`${pct(x.terms.shelfLife, 0)} → ${A(x.terms.shelfLife)}`, `${pct(x.termsR0.shelfLife, 0)} → ${A(x.termsR0.shelfLife)}`),
              ch(`${x.terms.paymentTermWeeks} tuần`, `${x.termsR0.paymentTermWeeks} tuần`),
              Math.abs(x.ar - x.arR0) < 1e-6 ? <>{num(x.arR0)} <Badge basis="estimate" /></> : <><b>{num(x.ar)}</b> <Badge basis="estimate" /><div class="m-r0">R0 {num(x.arR0)}</div></>];
          })} />
        <Grid>
          <Metric label="Investment: Payment terms" value={eur(res.finance.rows.find((r) => r.label === 'Payment terms')?.value ?? 0)} raw={res.finance.rows.find((r) => r.label === 'Payment terms')?.value} base={baseRes.finance.rows.find((r) => r.label === 'Payment terms')?.value} deltaKind="eur" r0={eur(fin('Payment terms') ?? 0)} basis="estimate" causes={causesFor('payterm', changed)} hint="R0 (tab 2) + Δ phải thu khách − Δ phải trả NCC" />
          <Metric label="Costs of scrap" value={eur(res.finance.rows.find((r) => r.label === 'Costs of scrap')?.value ?? 0)} raw={res.finance.rows.find((r) => r.label === 'Costs of scrap')?.value} base={baseRes.finance.rows.find((r) => r.label === 'Costs of scrap')?.value} deltaKind="eur" good="down" r0={eur(fin('Costs of scrap') ?? 0)} basis="estimate" causes={causesFor('fgStock', changed)} hint="C2: obsolete theo tuổi tồn (shelf life, safety stock TP, interval)" />
        </Grid>
        <p class="muted small-text">
          Promotion: nhu cầu thêm = % bán thêm R0 của từng cặp khách × SKU (tab 6, đã gồm ×2 Value for money / slowmover) × (điểm giữa khoảng mức mới ÷ điểm giữa mức R0); khoảng % đọc từ câu Info Center tab 6. Biến động nhu cầu thêm do khuyến mãi: chưa mô hình.
          Shelf life: tuổi cho phép của SKU dùng shelf life <b>cao nhất</b> của các khách mua SKU đó (hạ một khách không đổi số nếu khách khác vẫn đòi cao hơn).
          AR = revenue khách ÷ 26 × payment term (ước lượng; R0 chỉ có số ròng AR − AP = 365.589 ở tab 2, AR đứng riêng: thiếu dữ liệu) — nên đổi revenue (penalty, promotion) cũng đổi AR.
        </p>
      </Card>

      <Card title="Trade unit → giờ soạn hàng kho TP (Ops)">
        <Grid>
          <Metric label="Giờ công kho TP" value={`${num(res.ops.fg.hoursPerWeek, 1)} giờ/tuần`} raw={res.ops.fg.hoursPerWeek} base={baseRes.ops.fg.hoursPerWeek} deltaKind="num" good="down" r0={`${num(data.ops.results.fg.hoursPerWeek, 0)} giờ/tuần`} causes={causesFor('fgHours', changed)} hint="Tab 5 + thay đổi mô hình (định mức luật)" />
          <Metric label="Soạn hàng (mô hình)" value={`${num(res.ops.fg.hoursBreakdown.picking ?? 0, 1)} giờ/tuần`} raw={res.ops.fg.hoursBreakdown.picking ?? 0} base={baseRes.ops.fg.hoursBreakdown.picking ?? 0} deltaKind="num" good="down" basis="estimate" causes={causesFor('fgHours', changed)} hint="10 phút/dòng đơn + 6 phút/pallet hoặc layer + 3 phút/thùng; phần lẻ TB nửa pallet/dòng soạn theo trade unit (giả định)" />
          <Metric label="Outbound flexible manpower" value={eur(res.ops.fg.flexCost)} raw={res.ops.fg.flexCost} base={baseRes.ops.fg.flexCost} deltaKind="eur" good="down" r0={eur(fin('Outbound flexible manpower') ?? baseRes.ops.fg.flexCost)} causes={causesFor('fgFlex', changed)} />
          <Metric label="Ngày vượt giờ cố định kho TP" value={`${res.ops.fg.daysAboveFixed} ngày`} raw={res.ops.fg.daysAboveFixed} base={baseRes.ops.fg.daysAboveFixed} deltaKind="num" good="down" causes={causesFor('fgHours', changed)} />
        </Grid>
        <p class="muted small-text">Số dòng đơn/tuần giữ R0 (tab 6). Trade unit còn là "mức đặt tối thiểu và bội số" (Info Center) — ảnh hưởng cỡ đơn và phí phân phối <b>chưa mô hình</b>. Order deadline: chưa mô hình vào giờ công.</p>
      </Card>

      <Card title="Kiểm chứng công thức doanh thu bằng số R0">
        <Table head={['Khách hàng', 'Contracted (tab 2)', 'Penalty (tab 2)', 'Contracted + penalty', 'Revenue (tab 6)', 'Contracted × (1 − attained CI ÷ CI)', 'Lệch so với penalty tab 2', 'Penalty ÷ contracted ÷ điểm thiếu']}
          rows={data.sales.contracts.map((k) => {
            const r = data.sales.customerResults.find((x) => x.customer === k.customer)!;
            const con = fin(`Contracted sales – ${k.customer}`), pen = fin(`Penalty service level – ${k.customer}`);
            if (con === null || pen === null) return [k.customer, 'thiếu dữ liệu', '', '', eur(r.revenue), '', '', ''];
            const idPen = -con * (1 - r.attainedContractIndex / k.contractIndex);
            const short = k.serviceLevel - r.slOrderLines;
            return [k.customer, eur(con), eur(pen), eur(con + pen), eur(r.revenue), eur(idPen), pct(idPen / pen - 1, 2), short > 0 ? `${num((-pen / con / short), 2)}% / điểm` : '—'];
          })} />
        <p class="muted small-text">Contracted + penalty = revenue tab 6 (khớp đúng). Penalty ≈ contracted × (1 − attained CI ÷ CI) (lệch &lt; 1% do CI làm tròn). Tỷ lệ penalty trên mỗi điểm thiếu <b>khác nhau giữa 3 khách</b> → không có một công thức chung; app neo theo từng khách (ước lượng).</p>
      </Card>

      <Card title="Service level theo SKU (tab 7)">
        <Table head={['SKU', 'Plan adherence', 'Service level (pieces)', 'Service level (order lines)']}
          rows={res.sc.products.map((p) => [p.sku,
            p.sheet.planAdherence.value !== null && p.sheet.planAdherence.r0 !== null ? <Cell v={p.sheet.planAdherence.value} r0={p.sheet.planAdherence.r0} f={(v) => pct(v)} /> : 'thiếu dữ liệu',
            <Cell v={p.slPiecesEst} r0={p.slPiecesR0} f={(v) => pct(v)} />,
            p.sheet.slOrderLines.value !== null && p.sheet.slOrderLines.r0 !== null ? <Cell v={p.sheet.slOrderLines.value} r0={p.sheet.slOrderLines.r0} f={(v) => pct(v)} /> : 'thiếu dữ liệu'])} />
      </Card>

      <Card title="Toàn bộ số liệu Sales trong sheet (tab 6, nguyên văn)">
        <RawTable data={data} id="sales-contracts" />
        <RawTable data={data} id="sales-cust" />
        <RawTable data={data} id="sales-prod" />
        <RawTable data={data} id="sales-cp" />
        <RawTable data={data} id="sales-dist" note="Distribution costs = tổng 3 khách (N13); app giữ số R0 trong P&L" />
        <RawTable data={data} id="sales-options" note="Danh sách dropdown của tab Sales đọc từ bảng này" />
        {data.sales.optionNotes.length > 0 && <ul class="muted small-text">{data.sales.optionNotes.map((n) => <li><b>{n.label}:</b> {n.text}</li>)}</ul>}
        {checks.length > 0 && <>
          <h4>Đối chiếu giá trị R0: khối lựa chọn ↔ bảng hợp đồng (cùng tab 6)</h4>
          {badChecks.length === 0
            ? <p class="muted small-text">Khớp cả {checks.length} ô (giờ deadline so theo nghĩa: "20.00" ở khối lựa chọn = "20:00" ở bảng hợp đồng; % so 95 = 0,95). Giá trị R0 nằm trong danh sách lựa chọn / khoảng cho phép.</p>
            : <Table head={['Khách', 'Ô', 'Khối lựa chọn', 'Bảng hợp đồng', 'Khớp', 'Trong lựa chọn']} rows={badChecks.map((x) => [x.customer, x.field, String(x.optionValue ?? 'trống'), String(x.contractValue), x.same ? 'có' : 'KHÔNG', x.inChoices ? 'có' : 'KHÔNG'])} />}
        </>}
        {data.sales.notes.length > 0 && <ul class="muted small-text">{data.sales.notes.map((n) => <li>{n}</li>)}</ul>}
      </Card>
      </section>
    </div>
  );
}
