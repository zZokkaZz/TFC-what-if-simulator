// Tab Purchasing (M3): ô quyết định NCC + ô đàm phán từng nguyên liệu (đúng lựa chọn tab 4), kết quả neo vào số R0,
// cảnh báo liên phòng ban, dữ liệu nguyên văn tab 4.
import type { ComponentChildren } from 'preact';
import type { ComponentKey, Round0Data } from '../data/types';
import type { Inputs, PurBasis, PurchasingInputs, PurchasingTerms, Results } from '../model/types';
import type { Warning } from '../model/warnings';
import { activeSupplier, defaultTerms, specOf } from '../model/purchasing';
import { PUR_LIMITS } from '../sync/limits';
import { Badge, Card, Grid, Metric, NumberField, OptNumberField, SelectField } from './components';
import { eur, num, pct } from './format';
import { causesFor } from './trace';
import { WarningsPanel } from './WarningsPanel';
import { RawTable } from './RawTable';

interface Props {
  data: Round0Data;
  inputs: Inputs;
  base: Inputs;
  res: Results;
  baseRes: Results;
  changed: string[];
  setPur: (p: PurchasingInputs) => void;
  editable: boolean;
  lockReason?: string;
  warnings: Warning[];
}

const COMP_LABEL: Record<ComponentKey, string> = { Pack: 'Pack 1L', PET: 'PET', Orange: 'Orange', Mango: 'Mango', 'Vitamin C': 'Vitamin C' };

/** Nhãn nguồn của một số Purchasing. */
function PBadge({ basis }: { basis: PurBasis }) {
  if (basis === 'sheet') return null;
  if (basis === 'game') return <span class="badge badge-game" title="Số đội nhập từ game">số game</span>;
  return <Badge basis="estimate" />;
}

/** Ô kết quả mang tên cột tab 4: không đổi → đúng số sheet; đổi → số kịch bản (đậm) + "R0 …" bên dưới. */
function Cell({ v, r0, f, basis }: { v: number; r0: number; f: (x: number) => string; basis?: PurBasis }): ComponentChildren {
  const same = Math.abs(v - r0) <= 1e-9 * Math.max(1, Math.abs(r0));
  if (same) return <>{f(r0)}</>;
  return <><b>{f(v)}</b>{basis && <> <PBadge basis={basis} /></>}<div class="m-r0">R0 {f(r0)}</div></>;
}

export function PurchasingTab({ data, inputs, base, res, baseRes, changed, setPur, editable, lockReason, warnings }: Props) {
  const pu = inputs.purchasing, b = base.purchasing;
  const dis = !editable;
  const P = res.purchasing, PB = baseRes.purchasing;
  const anyChanged = changed.some((p) => p.startsWith('purchasing.'));
  const comps = Object.keys(pu.suppliers) as ComponentKey[];
  const setTerms = (k: ComponentKey, patch: Partial<PurchasingTerms>) => setPur({ ...pu, terms: { ...pu.terms, [k]: { ...pu.terms[k], ...patch } } });
  const setSupplier = (k: ComponentKey, name: string) => setPur({ suppliers: { ...pu.suppliers, [k]: name }, terms: { ...pu.terms, [k]: defaultTerms(data, k, name) } });
  const nego = (k: ComponentKey) => data.purchasing.negotiation.find((n) => n.component === k);
  const c = (key: string) => causesFor(key, changed);
  const finRow = (re: RegExp, r: Results) => r.finance.rows.find((x) => re.test(x.label))?.value ?? 0;

  return (
    <div class="two-col">
      <aside class="decisions">
        <div class="dec-head">
          <h2>Quyết định Purchasing</h2>
          <button class="btn" disabled={!anyChanged || dis} onClick={() => setPur(structuredClone(b))}>Reset Purchasing về R0</button>
        </div>
        {lockReason && <p class="lock">🔒 {lockReason}</p>}
        <p class="f-hint">Lựa chọn đúng như game (tab 4 "Lựa chọn khi đàm phán"). Đổi NCC → các ô đặt lại về điều kiện niêm yết của NCC mới. Đổi điều kiện thì game đổi contract index — bấm Calculate trong game rồi nhập <b>CI game hiển thị</b>.</p>
        {comps.map((k) => {
          const t = pu.terms[k], tb = b.terms[k];
          const pc = P.components.find((x) => x.key === k)!;
          const n = nego(k);
          const spec = specOf(data, k, pu.suppliers[k]);
          const modes = spec?.transportModes ?? [t.transport];
          const market = data.purchasing.market.filter((m) => m.component === k);
          // Số dùng khi BỎ TRỐNG 3 ô số game (để hiện ở placeholder)
          const blank = activeSupplier({ ...inputs, purchasing: { ...pu, terms: { ...pu.terms, [k]: { ...t, ciGame: null, reliabilityActual: null, rejectionActual: null } } } }, data, k);
          const opts = (xs: string[] | undefined, cur: string) => [...new Set([...(xs ?? []), cur])].map((x) => ({ value: x, label: x }));
          return (
            <fieldset>
              <legend>{COMP_LABEL[k]}</legend>
              <SelectField label="Supplier" value={pu.suppliers[k]} disabled={dis} changed={pu.suppliers[k] !== b.suppliers[k]}
                options={market.map((m) => ({ value: m.supplier, label: `${m.supplier}${m.supplier === b.suppliers[k] ? ' (R0)' : ''} · CI ${num(m.contractIndex, 4)} · ${m.quality} · ${m.leadTimeDays} ngày` }))}
                onChange={(v) => setSupplier(k, v)} />
              <div class="pur-grid">
                <SelectField label="Transport" value={t.transport} disabled={dis || modes.length < 2} changed={t.transport !== tb.transport} options={opts(modes, t.transport)} onChange={(v) => setTerms(k, { transport: v })} />
                <SelectField label="Trade unit" value={t.tradeUnit} disabled={dis} changed={t.tradeUnit !== tb.tradeUnit} options={opts(n?.tradeUnits, t.tradeUnit)} onChange={(v) => setTerms(k, { tradeUnit: v })} />
                <SelectField label="Quality" value={t.quality} disabled={dis} changed={t.quality !== tb.quality} options={opts(n?.qualities, t.quality)} onChange={(v) => setTerms(k, { quality: v })} />
                <SelectField label="Delivery window" value={t.deliveryWindow} disabled={dis} changed={t.deliveryWindow !== tb.deliveryWindow} options={opts(n?.deliveryWindows, t.deliveryWindow)} onChange={(v) => setTerms(k, { deliveryWindow: v })} />
                <NumberField label="Payment term" unit="tuần" value={t.paymentTermWeeks} limit={PUR_LIMITS.paymentTermWeeks} step={1} disabled={dis} changed={t.paymentTermWeeks !== tb.paymentTermWeeks} onChange={(v) => setTerms(k, { paymentTermWeeks: v })} />
                <NumberField label="Agreed delivery reliability" unit="%" value={Math.round(t.agreedReliability * 1e6) / 1e4}
                  limit={{ ...PUR_LIMITS.agreedReliability, min: PUR_LIMITS.agreedReliability.min * 100, max: PUR_LIMITS.agreedReliability.max * 100 }}
                  disabled={dis} changed={t.agreedReliability !== tb.agreedReliability} onChange={(v) => setTerms(k, { agreedReliability: v / 100 })} />
              </div>
              <div class="pur-grid pur-game">
                <OptNumberField label="CI game hiển thị" value={t.ciGame} limit={PUR_LIMITS.ciGame} disabled={dis} changed={t.ciGame !== tb.ciGame}
                  placeholder={`trống = ${num(blank.contractIndex, 4)}`} hint="Trống: CI trước đàm phán (tab 4)"
                  onChange={(v) => setTerms(k, { ciGame: v })} />
                <OptNumberField label="Reliability thực tế" unit="%" scale={100} value={t.reliabilityActual} limit={PUR_LIMITS.reliabilityActual} disabled={dis} changed={t.reliabilityActual !== tb.reliabilityActual}
                  placeholder={`trống = ${pct(blank.reliability)}`} hint={blank.reliabilityBasis === 'sheet' ? 'Trống: số R0 tab 4' : 'Trống: ước lượng'}
                  onChange={(v) => setTerms(k, { reliabilityActual: v })} />
                <OptNumberField label="Rejection thực tế" unit="%" scale={100} value={t.rejectionActual} limit={PUR_LIMITS.rejectionActual} disabled={dis} changed={t.rejectionActual !== tb.rejectionActual}
                  placeholder={`trống = ${pct(blank.rejection)}`} hint={blank.rejectionBasis === 'sheet' ? 'Trống: số R0 tab 4' : 'Trống: ước lượng'}
                  onChange={(v) => setTerms(k, { rejectionActual: v })} />
              </div>
              {(pc.ciStale || (!pc.isR0Supplier && pc.ciBasis !== 'game')) && <p class="warn-text small-text">⚠ Chưa nhập CI game: giá đang dùng CI {num(pc.contractIndex, 4)} trước đàm phán <Badge basis="estimate" /></p>}
            </fieldset>
          );
        })}
      </aside>

      <section class="results">
        <WarningsPanel warnings={warnings} filterTo="Purchasing" title="Cảnh báo liên quan Purchasing" />

        <Card title="Tổng quan Purchasing">
          <Grid>
            <Metric label="Purchase value" value={eur(P.purchaseValue)} raw={P.purchaseValue} base={PB.purchaseValue} deltaKind="eur" good="down" r0={eur(data.finance.totals.purchaseValue)} causes={c('purchase')} hint="Σ (giá cơ bản × contract index × lượng mua + phí vận chuyển) — công thức kiểm chứng bằng R0 (lệch ≤ €1)" />
            <Metric label="Phí vận chuyển" value={eur(P.transportCost)} raw={P.transportCost} base={PB.transportCost} deltaKind="eur" good="down" r0={eur(data.purchasing.results.reduce((s, r) => s + r.transportCost, 0))} basis="estimate" causes={c('purchase')} hint="Phí R0 × tỷ lệ mô hình (phí mỗi chuyến × số chuyến + phí đơn vị), tab 4" />
            <Metric label="Raw material costs (% doanh thu)" value={pct(P.kpi.rawMaterialCosts)} raw={P.kpi.rawMaterialCosts} base={PB.kpi.rawMaterialCosts} deltaKind="pt" good="down" r0={data.purchasingDashboard.rmCostShare !== null ? pct(data.purchasingDashboard.rmCostShare) : 'thiếu dữ liệu'} causes={c('purchase')} hint="Purchase value ÷ realized revenue (doanh thu theo mô hình Sales)" />
            <Metric label="Rejection TB (gia quyền purchase value)" value={pct(P.kpi.rejection)} raw={P.kpi.rejection} base={PB.kpi.rejection} deltaKind="pt" good="down" r0={data.purchasingDashboard.rejection !== null ? pct(data.purchasingDashboard.rejection) : 'thiếu dữ liệu'} basis={P.components.some((x) => x.rejectionBasis === 'estimate') ? 'estimate' : undefined} causes={c('purchase')} />
            <Metric label="Delivery reliability TB" value={pct(P.kpi.reliability)} raw={P.kpi.reliability} base={PB.kpi.reliability} deltaKind="pt" good="up" r0={data.purchasingDashboard.reliability !== null ? pct(data.purchasingDashboard.reliability) : 'thiếu dữ liệu'} basis={P.components.some((x) => x.reliabilityBasis === 'estimate') ? 'estimate' : undefined} causes={c('purchase')} />
            <Metric label="Điểm phòng: contract index TB" value={num(P.kpi.avgContractIndex, 4)} raw={P.kpi.avgContractIndex} base={PB.kpi.avgContractIndex} deltaKind="num" deltaDigits={4} good="down" r0={num(PB.kpi.avgContractIndex, 4)} basis="estimate" causes={c('purchase')} hint="TB đơn giản 5 hợp đồng (game có thể tính trọng số khác)" />
            <Metric label="Inbound order lines + orders" value={eur(P.inboundOrderLines + P.inboundOrders)} raw={P.inboundOrderLines + P.inboundOrders} base={PB.inboundOrderLines + PB.inboundOrders} deltaKind="eur" good="down" r0={eur(finRow(/^Inbound order lines$/, baseRes) + finRow(/^Inbound orders$/, baseRes))} basis="estimate" causes={c('trips')} hint="Số R0 × (số chuyến giao mới ÷ baseline): ≈ €10/order line, ≈ €50/đơn suy ra từ R0" />
            <Metric label="Investment: Payment terms" value={eur(finRow(/^Payment terms$/, res))} raw={finRow(/^Payment terms$/, res)} base={finRow(/^Payment terms$/, baseRes)} deltaKind="eur" r0={eur(finRow(/^Payment terms$/, baseRes))} basis="estimate" causes={c('payterm')} hint="R0 + Δ AR − Δ AP. AP = purchase value/tuần × thời gian nợ thực (When ordering: payment term − lead time; At delivery: payment term); AR = revenue khách/tuần × payment term khách (Sales)" />
          </Grid>
        </Card>

        <Card title="Kết quả theo NCC (cột như tab 4 — kết quả thực tế)">
          <p class="muted small-text">Không đổi gì = đúng số tab 4. Đổi quyết định: số kịch bản in đậm, dòng nhỏ "R0 …" là số sheet.</p>
          <div class="tbl-wrap">
            <table>
              <thead><tr><th>Component</th><th>Nhà cung cấp</th><th>Reliability thực tế</th><th>Rejection</th><th>Purchase value (€)</th><th>Transport cost (€)</th><th>Transport / purchase</th><th>Giá thực trả (€)</th><th>Cỡ đơn hàng</th><th>Lead time (ngày)</th><th>Contract index</th></tr></thead>
              <tbody>
                {P.components.map((x) => {
                  const r0 = data.purchasing.results.find((r) => r.supplier === x.supplierR0 && r.component === x.key)!;
                  const k0 = data.purchasing.contracts.find((s) => s.component === x.key)!;
                  const sc = res.sc.components.find((s) => s.key === x.key)!;
                  return (
                    <tr class={x.isR0Supplier ? '' : 'changed'}>
                      <td>{COMP_LABEL[x.key]}</td>
                      <td>{x.isR0Supplier ? x.supplier : <><b>{x.supplier}</b><div class="m-r0">R0 {x.supplierR0}</div></>}</td>
                      <td><Cell v={x.reliability} r0={r0.reliability} f={(v) => pct(v)} basis={x.reliabilityBasis} /></td>
                      <td><Cell v={x.rejection} r0={r0.rejection} f={(v) => pct(v)} basis={x.rejectionBasis} /></td>
                      <td><Cell v={x.purchaseValue} r0={r0.purchaseValue} f={(v) => num(v)} basis="scaled" /></td>
                      <td><Cell v={x.transportCost} r0={r0.transportCost} f={(v) => num(v)} basis="estimate" /></td>
                      <td><Cell v={x.purchaseValue > 0 ? x.transportCost / x.purchaseValue : 0} r0={r0.transportCost / r0.purchaseValue} f={(v) => pct(v, 0)} basis="estimate" /></td>
                      <td><Cell v={x.pricePaid} r0={r0.pricePaid} f={(v) => num(v, 4)} /></td>
                      <td>{sc.sheet.orderSize.value !== null && sc.sheet.orderSize.r0 !== null ? <Cell v={sc.sheet.orderSize.value} r0={sc.sheet.orderSize.r0} f={(v) => num(v)} /> : 'thiếu dữ liệu'}</td>
                      <td><Cell v={x.leadTimeDays} r0={k0.leadTimeDays} f={(v) => num(v)} /> {x.transport}</td>
                      <td><Cell v={x.contractIndex} r0={k0.contractIndex} f={(v) => num(v, 4)} basis={x.ciBasis} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p class="muted small-text">Purchase value = giá cơ bản × contract index × lượng mua + phí vận chuyển (kiểm chứng: khớp cả 5 NCC R0, lệch ≤ €1). Phí vận chuyển, reliability/rejection NCC mới, CI khi chưa nhập số game: <Badge basis="estimate" /> — xem ASSUMPTIONS.md mục 15.</p>
        </Card>

        <Card title="Toàn bộ số liệu Purchasing trong sheet (tab 4, nguyên văn)">
          <RawTable data={data} id="pur-contracts" />
          <RawTable data={data} id="pur-results" />
          <RawTable data={data} id="pur-market" />
          <RawTable data={data} id="pur-specs" />
          <RawTable data={data} id="pur-nego" />
        </Card>
      </section>
    </div>
  );
}
