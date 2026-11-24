import type { ComponentChildren } from 'preact';
import type { ComponentKey, Round0Data } from '../data/types';
import type { Inputs, OpsInputs, Results, WarehouseResult } from '../model/types';
import { opsChecks } from '../model/acceptance';
import { BOTTLING, WAREHOUSE } from '../model/rules';
import { COMPONENTS } from '../model/purchasing';
import { Badge, Card, Grid, Metric, NumberField, SelectField, Table, YesNo } from './components';
import { DailyChart, LineHoursChart } from './charts';
import { eur, num, pct, signed } from './format';
import { causesFor } from './trace';

interface Props {
  data: Round0Data;
  inputs: Inputs;
  base: Inputs;
  res: Results;
  baseRes: Results;
  changed: string[];
  setOps: (patch: Partial<OpsInputs>) => void;
  resetOps: () => void;
}

const COMP_LABEL: Record<ComponentKey, string> = { Pack: 'Pack 1L', PET: 'PET', Orange: 'Orange', Mango: 'Mango', 'Vitamin C': 'Vitamin C' };

export function OpsTab({ data, inputs, base, res, baseRes, changed, setOps, resetOps }: Props) {
  const o = inputs.ops, b = base.ops;
  const R = res.ops, B = baseRes.ops;
  const r0 = data.ops.results;
  const c = (k: string) => causesFor(k, changed);
  const anyOpsChanged = changed.some((p) => p.startsWith('ops.'));

  return (
    <div class="two-col">
      {/* ===== CỘT TRÁI: QUYẾT ĐỊNH ===== */}
      <aside class="decisions">
        <div class="dec-head">
          <h2>Quyết định Operations</h2>
          <button class="btn" disabled={!anyOpsChanged} onClick={resetOps}>Reset Ops về R0</button>
        </div>

        <fieldset>
          <legend>Inbound · Kho nguyên liệu</legend>
          <div class="field">
            <span class="f-label">Raw materials inspection</span>
            <div class="checks">
              {COMPONENTS.map((k) => {
                const sup = inputs.purchasing.suppliers[k];
                return (
                  <label class={`chk${o.rmInspection[k] !== b.rmInspection[k] ? ' changed' : ''}`}>
                    <input type="checkbox" checked={o.rmInspection[k]} onChange={(e) => setOps({ rmInspection: { ...o.rmInspection, [k]: (e.currentTarget as HTMLInputElement).checked } })} />
                    {COMP_LABEL[k]} <small>({sup})</small>
                  </label>
                );
              })}
            </div>
            <span class="f-hint">+2 giờ công/dòng đơn nhận hàng; giảm hỏng máy nếu là bao bì kém <Badge basis="estimate" /></span>
          </div>
          <NumberField label="Number of pallet locations" unit="pallet" value={o.rmPalletLocations} min={0} step={10} changed={o.rmPalletLocations !== b.rmPalletLocations} hint="€200/chỗ/năm · thiếu chỗ → overflow €3/pallet/ngày" onChange={(v) => setOps({ rmPalletLocations: Math.round(v) })} />
          <NumberField label="Number of permanent employees" unit="FTE" value={o.rmFte} min={0} step={1} changed={o.rmFte !== b.rmFte} hint="€40.000/năm, 40 giờ/tuần · thiếu → thời vụ €42/giờ" onChange={(v) => setOps({ rmFte: v })} />
          <NumberField label="Intake time" unit="ngày" value={o.intakeDays} min={1} max={20} step={1} changed={o.intakeDays !== b.intakeDays} hint="Dài hơn: giờ nhận hàng dàn đều hơn (NL sẵn sàng muộn hơn — chưa mô hình)" onChange={(v) => setOps({ intakeDays: Math.round(v) })} />
        </fieldset>

        <fieldset>
          <legend>Mixing</legend>
          <SelectField label="Mixer" value={o.mixer} changed={o.mixer !== b.mixer}
            options={data.ops.mixers.map((m) => ({ value: m.name, label: `${m.name} · ${num(m.minBatchL)}–${num(m.maxBatchL)} L · €${num(m.annualFee)}/năm` }))}
            onChange={(v) => setOps({ mixer: v })} />
        </fieldset>

        <fieldset>
          <legend>Bottling</legend>
          <SelectField label="Bottling line" value={o.bottlingLine} changed={o.bottlingLine !== b.bottlingLine}
            options={data.ops.lines.map((l) => ({ value: l.name, label: `${l.name} · ${num(l.speedLph)} L/giờ · ${l.tolerance}` }))}
            onChange={(v) => setOps({ bottlingLine: v })} />
          <SelectField label="Number of shifts" value={o.shifts} changed={o.shifts !== b.shifts}
            options={[1, 2, 3, 4, 5].map((s) => ({ value: s, label: `${s} ca · ${BOTTLING.shiftHours[s]} giờ/tuần` }))}
            onChange={(v) => setOps({ shifts: v })} />
          <SelectField label="Preventive maintenance" value={o.preventiveMaintenance} changed={o.preventiveMaintenance !== b.preventiveMaintenance}
            options={[{ value: 'None', label: 'None' }, { value: 'Minimal', label: 'Minimal · 1 giờ/tuần, −30% hỏng' }, { value: 'Extensive', label: 'Extensive · 3 giờ/tuần, −50% hỏng' }]}
            onChange={(v) => setOps({ preventiveMaintenance: v as OpsInputs['preventiveMaintenance'] })} />
          <YesNo label="Solve breakdowns training" value={o.breakdownTraining} changed={o.breakdownTraining !== b.breakdownTraining} hint="€400/người · thời gian sửa −40%" onChange={(v) => setOps({ breakdownTraining: v })} />
          <YesNo label="SMED action" value={o.smed} changed={o.smed !== b.smed} hint="€20.000/năm · changeover −30%" onChange={(v) => setOps({ smed: v })} />
          <YesNo label="Increase speed" value={o.increaseSpeed} changed={o.increaseSpeed !== b.increaseSpeed} hint="€30.000/năm · +10% lít/giờ" onChange={(v) => setOps({ increaseSpeed: v })} />
        </fieldset>

        <fieldset>
          <legend>Outbound · Kho thành phẩm (DC Netherlands)</legend>
          <NumberField label="Number of pallet locations" unit="pallet" value={o.fgPalletLocations} min={0} step={10} changed={o.fgPalletLocations !== b.fgPalletLocations} hint="€200/chỗ/năm · thiếu chỗ → overflow €3/pallet/ngày" onChange={(v) => setOps({ fgPalletLocations: Math.round(v) })} />
          <NumberField label="Number of permanent employees" unit="FTE" value={o.fgFte} min={0} step={1} changed={o.fgFte !== b.fgFte} hint="€40.000/năm, 40 giờ/tuần · thiếu → thời vụ €42/giờ" onChange={(v) => setOps({ fgFte: v })} />
        </fieldset>

        <details class="ctx">
          <summary>Thông số từ phòng khác đang dùng (R0 · sửa ở M2/M3)</summary>
          <p>SC: safety stock NL {inputs.sc.components.PET.safetyStockWeeks} tuần, lot size {inputs.sc.components.PET.lotSizeWeeks} tuần · production interval {inputs.sc.products['Orange 1L'].productionIntervalDays} ngày · safety stock TP {inputs.sc.products['Orange 1L'].safetyStockWeeks} tuần · frozen {inputs.sc.frozenPeriodWeeks} tuần.</p>
          <p>NCC: {data.purchasing.contracts.map((s) => `${COMP_LABEL[s.component]} ${s.supplier} (${s.quality}, ${s.tradeUnit})`).join(' · ')}.</p>
        </details>
      </aside>

      {/* ===== CỘT PHẢI: KẾT QUẢ ===== */}
      <div class="results">
        <Card title={`Dây chuyền đóng chai — ${R.line.name}`} alert={R.line.bottleneck}
          extra={<span class="muted">{num(R.line.speedLph)} L/giờ · {R.line.regularHours} giờ ca/tuần</span>}>
          <LineHoursChart bars={[
            { name: 'R0 thật (game)', run: r0.line.run, changeover: r0.line.changeover, breakdown: r0.line.breakdown, maintenance: 0, unused: r0.line.unused, overtime: r0.line.overtime, outsourced: r0.line.outsourcedH, regular: BOTTLING.shiftHours[data.ops.decisions.shifts] },
            { name: 'Baseline mô hình', run: B.line.run, changeover: B.line.changeover, breakdown: B.line.breakdown, maintenance: B.line.maintenance, unused: B.line.unused, overtime: B.line.overtime, outsourced: B.line.outsourced, regular: B.line.regularHours },
            { name: 'Kịch bản hiện tại', run: R.line.run, changeover: R.line.changeover, breakdown: R.line.breakdown, maintenance: R.line.maintenance, unused: R.line.unused, overtime: R.line.overtime, outsourced: R.line.outsourced, regular: R.line.regularHours },
          ]} />
          <Grid>
            <Metric label="Run time" value={`${num(R.line.run, 1)} giờ/tuần`} raw={R.line.run} base={B.line.run} deltaKind="num" r0={num(r0.line.run, 1)} causes={c('run')} hint="Lít cần đóng ÷ tốc độ + giờ hao hụt start-up" />
            <Metric label="Changeover" value={`${num(R.line.changeover, 1)} giờ/tuần`} raw={R.line.changeover} base={B.line.changeover} deltaKind="num" good="down" r0={num(r0.line.changeover, 1)} basis="calibrated" causes={c('changeover')} hint={`${num(R.line.changeoversPerWeek, 1)} changeover/tuần × ${num(R.line.avgChangeoverH, 2)} giờ`} />
            <Metric label="Breakdown" value={`${num(R.line.breakdown, 1)} giờ/tuần`} raw={R.line.breakdown} base={B.line.breakdown} deltaKind="num" good="down" r0={num(r0.line.breakdown, 1)} basis="calibrated" causes={c('breakdown')} />
            <Metric label="Unused" value={`${num(R.line.unused, 1)} giờ/tuần`} raw={R.line.unused} base={B.line.unused} deltaKind="num" r0={num(r0.line.unused, 1)} basis="calibrated" causes={c('lineLoad')} />
            <Metric label="Overtime" value={`${num(R.line.overtime, 1)} giờ/tuần`} raw={R.line.overtime} base={B.line.overtime} deltaKind="num" good="down" r0={num(r0.line.overtime, 1)} basis="calibrated" alert={R.line.overtime > 0.1 * R.line.regularHours} causes={c('lineLoad')} />
            <Metric label="Production plan adherence" value={pct(R.line.planAdherence)} raw={R.line.planAdherence} base={B.line.planAdherence} deltaKind="pt" good="up" r0={pct(r0.line.planAdherence)} basis="calibrated" alert={R.line.planAdherence < 0.85} causes={c('adherence')} hint="Ảnh hưởng tới service level/doanh thu sẽ nối ở M3" />
            <Metric label="Start-up productivity loss" value={eur(R.line.startupLossEur)} raw={R.line.startupLossEur} base={B.line.startupLossEur} deltaKind="eur" good="down" r0={eur(r0.line.startupLossEur)} causes={c('startup')} hint="Số mẻ × (tỷ lệ start-up loss × tốc độ × 1 giờ) × giá vốn/đv" />
            <Metric label="Giờ tải TB / còn trống tới 168 giờ" value={`${num(R.line.needHours, 1)} / ${num(R.line.freeHours, 1)} giờ`} raw={R.line.needHours} base={B.line.needHours} deltaKind="num" good="down" causes={c('lineLoad')} hint="Còn trống = 168 − giờ tải trung bình (kể cả overtime)" />
            {R.line.outsourced > 0.05 && <Metric label="Thuê ngoài (> 168 giờ)" value={`${num(R.line.outsourced, 1)} giờ/tuần`} basis="estimate" alert />}
          </Grid>
          <details>
            <summary>Chi tiết theo SKU</summary>
            <Table head={['SKU', 'Interval (ngày)', 'Mẻ/round', 'Lít/mẻ', 'Lô trộn/mẻ', 'Availability NL (R0)', 'Plan adherence', 'Start-up loss']}
              rows={R.production.map((p) => [p.sku, p.intervalDays, num(p.batchesPerWeek * 26, 0), num(p.batchLiters), `${p.mixerLotsPerBatch} × ${num(p.mixerLotL)} L`, pct(p.availability), pct(p.adherence), eur(p.startupLossEur)])} />
          </details>
        </Card>

        <Card title={`Máy trộn — ${R.mixer.name}`} alert={R.mixer.bottleneck}>
          <Grid>
            <Metric label="Cleaning time" value={pct(R.mixer.cleaningShare)} raw={R.mixer.cleaningShare} base={B.mixer.cleaningShare} deltaKind="pt" good="down" r0={pct(r0.mixer.cleaningShare)} causes={c('mixer')} hint="Giờ vệ sinh ÷ (giờ trộn + vệ sinh); vệ sinh 1 lần mỗi lần đổi SKU" />
            <Metric label="Lô trung bình" value={`${num(R.mixer.avgLotL)} L`} raw={R.mixer.avgLotL} base={B.mixer.avgLotL} deltaKind="num" deltaDigits={0} r0={`${num(r0.mixer.avgLotL)} L`} causes={c('mixer')} />
            <Metric label="Số lô/tuần" value={num(R.mixer.lotsPerWeek, 1)} raw={R.mixer.lotsPerWeek} base={B.mixer.lotsPerWeek} deltaKind="num" causes={c('mixer')} />
            <Metric label="Giờ máy chạy/tuần" value={`${num(R.mixer.mixHours + R.mixer.cleanHours, 1)} giờ`} raw={R.mixer.mixHours + R.mixer.cleanHours} base={B.mixer.mixHours + B.mixer.cleanHours} deltaKind="num" good="down" causes={c('mixer')} hint="Trộn + vệ sinh; phí theo giờ chạy" />
            <Metric label="Tải máy trộn / giờ dây chuyền" value={pct(R.mixer.utilization, 0)} raw={R.mixer.utilization} base={B.mixer.utilization} deltaKind="pt" good="down" basis="estimate" alert={R.mixer.bottleneck} causes={c('mixer')} />
            <Metric label="Lít dư do mẻ tối thiểu" value={`${num(R.mixer.excessLitersPerWeek)} L/tuần`} raw={R.mixer.excessLitersPerWeek} base={B.mixer.excessLitersPerWeek} deltaKind="num" deltaDigits={0} good="down" alert={R.mixer.excessLitersPerWeek > 0} causes={c('mixer')} hint="Mẻ nhỏ hơn mẻ tối thiểu bị làm tròn lên → đóng chai thêm" />
          </Grid>
        </Card>

        <WarehouseCard title="Kho nguyên liệu (NL)" w={R.rm} wb={B.rm} fte={o.rmFte} r0={{ util: r0.rm.utilization, overflow: r0.rm.overflow, hours: r0.rm.hoursPerWeek, usage: r0.rm.usage, daysAbove: data.dailyStats.rmDaysAboveFixed, peak: Math.max(...data.daily.map((d) => d.rmHours)), flexEur: finR0(data, /^Inbound flexible/), ovfEur: finR0(data, /^Overflow raw/) }} causes={{ stock: c('rmStock'), hours: c('rmHours'), flex: c('rmFlex') }} labels={{ fixed: 'Việc cố định', receiving: 'Nhận hàng', inspection: 'RM inspection', issuing: 'Cấp cho sản xuất', overflowMoves: 'Chuyển overflow' }}>
          <details>
            <summary>Dòng nguyên liệu (từ quyết định SC + NCC)</summary>
            <Table head={['NL', 'NCC', 'Trade unit', 'Dùng/tuần', 'Cỡ đơn', 'Lần nhận/round', 'Tồn TB (tuần)', 'Chỗ chứa TB']}
              rows={R.components.map((f) => [COMP_LABEL[f.key], f.supplier, f.tradeUnit, num(f.usagePerWeek), num(f.orderUnits), num(f.deliveriesPerRound, 1), num(f.avgStockWeeks, 2), `${num(f.avgLocations, 1)} ${f.storage === 'tank' ? 'tank' : 'pallet'}`])} />
          </details>
        </WarehouseCard>

        <Card title="Tank yard (PulpStore, thuê ngoài)">
          <Grid>
            <Metric label="Tank trung bình / đỉnh" value={`${num(R.tankYard.avgTanks, 1)} / ${R.tankYard.peakTanks}`} r0={`${data.ops.results.tankYard.usage ?? '—'} (dùng) / ${data.ops.results.tankYard.capacity ?? '—'} (sức chứa)`} causes={c('tank')} />
            <Metric label="Chi phí tank yard" value={eur(R.tankYard.cost)} raw={R.tankYard.cost} base={B.tankYard.cost} deltaKind="eur" good="down" r0={eur(finR0(data, /tank yard/i))} basis="estimate" causes={c('tank')} hint="€25/tank/ngày (130 ngày làm việc) + €10/tank nhận + €100/tank giao cho sản xuất" />
          </Grid>
        </Card>

        <WarehouseCard title="Kho thành phẩm (TP) — DC Netherlands" w={R.fg} wb={B.fg} fte={o.fgFte} r0={{ util: r0.fg.utilization, overflow: r0.fg.overflow, hours: r0.fg.hoursPerWeek, usage: r0.fg.usage, daysAbove: data.dailyStats.fgDaysAboveFixed, peak: Math.max(...data.daily.map((d) => d.fgHours)), flexEur: finR0(data, /^Outbound flexible/), ovfEur: finR0(data, /^Overflow finished/) }} causes={{ stock: c('fgStock'), hours: c('fgHours'), flex: c('fgFlex') }} labels={{ fixed: 'Việc cố định', inbound: 'Nhập từ sản xuất', picking: 'Soạn hàng', scrap: 'Hủy hàng obsolete', overflowMoves: 'Chuyển overflow' }} stockBasis="calibrated">
          {R.fg.utilization < 0.8 && (
            <p class="note">Kho TP chỉ dùng {pct(R.fg.utilization, 0)} → đỉnh {num(R.fg.peakPallets)} pallet; thừa khoảng {num(o.fgPalletLocations - R.fg.peakPallets)} chỗ so với đỉnh (≈ {eur((o.fgPalletLocations - R.fg.peakPallets) * WAREHOUSE.palletLocationPerYear / 2)}/round).</p>
          )}
        </WarehouseCard>

        <CostCard res={res} baseRes={baseRes} />

        <Card title="Đối chiếu Round 0 (test hiệu chỉnh mục 7)">
          <p class="muted">So sánh <b>baseline mô hình</b> (quyết định R0) với số game thật. Dòng "hiệu chỉnh" dùng để tính hệ số nên khớp do cấu tạo; các dòng còn lại là dự báo độc lập.</p>
          <Table head={['Chỉ số', 'R0 thật', 'Mô hình', 'Lệch', 'Sai số cho phép', '']}
            rows={opsChecks(data, baseRes).map((k) => {
              const f = (x: number) => (k.unit === '%' ? pct(x) : k.unit === '€' ? eur(x) : num(x, k.unit === 'L' ? 0 : 1));
              return [k.label, f(k.r0), f(k.model), k.unit === '%' ? signed(k.diff, 'pt') : signed(k.diff, k.unit === '€' ? 'eur' : 'num'), k.tol.abs !== undefined ? `±${num(k.tol.abs * 100)} điểm %` : `±${num((k.tol.rel ?? 0) * 100)}%`, <span>{k.ok ? <span class="ok">✔ đạt</span> : <span class="ko">✖ lệch</span>} {k.calibrated && <Badge basis="calibrated" />}</span>];
            })} />
        </Card>
      </div>
    </div>
  );
}

function finR0(data: Round0Data, re: RegExp): number {
  return data.finance.lines.find((l) => re.test(l.label))?.value ?? 0;
}

interface WhProps {
  title: string;
  w: WarehouseResult;
  wb: WarehouseResult;
  fte: number;
  r0: { util: number; overflow: number; hours: number; usage: number; daysAbove: number; peak: number; flexEur: number; ovfEur: number };
  causes: { stock: ReturnType<typeof causesFor>; hours: ReturnType<typeof causesFor>; flex: ReturnType<typeof causesFor> };
  labels: Record<string, string>;
  stockBasis?: 'calibrated';
  children?: ComponentChildren;
}

function WarehouseCard({ title, w, wb, fte, r0, causes, labels, stockBasis, children }: WhProps) {
  const alert = w.overflowShare > 0.05 || w.utilization > 1;
  const hoursAlert = w.hoursPerWeek > w.fixedHoursPerWeek || w.daysAboveFixed > 10;
  return (
    <Card title={title} alert={alert || hoursAlert} extra={<span class="muted">{num(w.capacity)} pallet · {num(fte, 1)} FTE</span>}>
      <Grid>
        <Metric label="Utilization (pallet TB / sức chứa)" value={pct(w.utilization)} raw={w.utilization} base={wb.utilization} deltaKind="pt" r0={`${pct(r0.util)} (${num(r0.usage)} pallet)`} basis={stockBasis} alert={w.utilization > 1} causes={causes.stock} hint={`TB ${num(w.avgPallets)} pallet, đỉnh ${num(w.peakPallets)}`} />
        <Metric label="Overflow" value={pct(w.overflowShare)} raw={w.overflowShare} base={wb.overflowShare} deltaKind="pt" good="down" r0={pct(r0.overflow)} alert={w.overflowShare > 0.05} causes={causes.stock} hint={`TB ${num(w.avgOverflowPallets, 1)} pallet/ngày ở overflow`} />
        <Metric label="Phí overflow" value={eur(w.overflowCost)} raw={w.overflowCost} base={wb.overflowCost} deltaKind="eur" good="down" r0={eur(r0.ovfEur)} causes={causes.stock} />
        <Metric label="Giờ công cần / cố định" value={`${num(w.hoursPerWeek, 1)} / ${num(w.fixedHoursPerWeek)} giờ/tuần`} raw={w.hoursPerWeek} base={wb.hoursPerWeek} deltaKind="num" good="down" r0={`${num(r0.hours)} giờ/tuần`} alert={w.hoursPerWeek > w.fixedHoursPerWeek} causes={causes.hours} />
        <Metric label="Thời vụ (€42/giờ)" value={`${num(w.flexHours)} giờ · ${eur(w.flexCost)}`} raw={w.flexCost} base={wb.flexCost} deltaKind="eur" good="down" r0={eur(r0.flexEur)} causes={causes.flex} hint="Cộng giờ vượt giờ cố định của từng ngày" />
        <Metric label="Ngày vượt giờ cố định / đỉnh" value={`${w.daysAboveFixed} ngày · ${num(w.peakDayHours, 1)} giờ`} raw={w.daysAboveFixed} base={wb.daysAboveFixed} deltaKind="num" deltaDigits={0} good="down" r0={`${r0.daysAbove} ngày · ${num(r0.peak, 1)} giờ`} basis="estimate" causes={causes.flex} hint="Mô phỏng theo lịch đều (không ngẫu nhiên) nên đỉnh thường thấp hơn game" />
      </Grid>
      <div class="charts2">
        <div>
          <h4>Giờ công theo ngày (mô hình)</h4>
          <DailyChart values={w.daily.hours} limit={(fte * 40) / 5} unit="giờ" limitLabel="Giờ cố định/ngày" />
        </div>
        <div>
          <h4>Pallet theo ngày (mô hình)</h4>
          <DailyChart values={w.daily.pallets} limit={w.capacity} unit="pallet" limitLabel="Pallet locations" />
        </div>
      </div>
      <details>
        <summary>Giờ công theo hạng mục (giờ/tuần)</summary>
        <Table head={['Hạng mục', 'Baseline', 'Kịch bản']} rows={Object.keys(labels).map((k) => [labels[k], num(wb.hoursBreakdown[k] ?? 0, 1), num(w.hoursBreakdown[k] ?? 0, 1)])} />
      </details>
      {children}
    </Card>
  );
}

function CostCard({ res, baseRes }: { res: Results; baseRes: Results }) {
  const rows = res.ops.costs.map((cst) => {
    const bv = baseRes.ops.costs.find((x) => x.id === cst.id)?.value ?? 0;
    const d = cst.value - bv;
    return [
      <span>{cst.label} <Badge basis={cst.basis} /></span>,
      cst.group === 'production' ? 'Sản xuất' : 'Kho',
      eur(bv),
      eur(cst.value),
      Math.abs(d) < 0.5 ? '' : <span class={d < 0 ? 'good' : 'bad'}>{signed(d, 'eur')}</span>,
    ];
  });
  const tot = (r: Results) => r.ops.productionCost + r.ops.warehouseCost;
  const d = tot(res) - tot(baseRes);
  rows.push([<b>Tổng chi phí Ops</b>, '', <b>{eur(tot(baseRes))}</b>, <b>{eur(tot(res))}</b>, Math.abs(d) < 0.5 ? '' : <b class={d < 0 ? 'good' : 'bad'}>{signed(d, 'eur')}</b>]);
  rows.push([<span>Ops score = (sản xuất + kho) / doanh thu <Badge basis="r0" /></span>, '', pct(baseRes.finance.opsScore), pct(res.finance.opsScore), '']);
  return (
    <Card title="Chi phí Ops (cả round = 26 tuần)">
      <Table head={['Hạng mục', 'Nhóm', 'Baseline', 'Kịch bản', 'Δ']} rows={rows} cls="costs" />
      <p class="muted">Doanh thu giữ số R0 cho tới M3. Chi phí năm × 0,5 = chi phí 1 round.</p>
    </Card>
  );
}
