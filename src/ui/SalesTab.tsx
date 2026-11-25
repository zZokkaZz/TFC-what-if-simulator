// Tab Sales (M3, phần service level): SL dự kiến → penalty service level → realized revenue, neo vào số R0 (tab 2, 6).
// Ô quyết định hợp đồng Sales (SL hứa, shelf life, deadline, trade unit, promotion) CHƯA có.
import type { ComponentChildren } from 'preact';
import type { Round0Data } from '../data/types';
import type { Results } from '../model/types';
import type { Warning } from '../model/warnings';
import { Badge, Card, Grid, Metric, Table } from './components';
import { eur, num, pct } from './format';
import { causesFor } from './trace';
import { WarningsPanel } from './WarningsPanel';

interface Props { data: Round0Data; res: Results; baseRes: Results; changed: string[]; warnings: Warning[] }

/** Ô mang tên cột sheet: không đổi → đúng số sheet; đổi → số kịch bản (đậm, ước lượng) + "R0 …". */
function Cell({ v, r0, f }: { v: number; r0: number; f: (x: number) => string }): ComponentChildren {
  if (Math.abs(v - r0) <= 1e-9 * Math.max(1, Math.abs(r0))) return <>{f(r0)}</>;
  return <><b>{f(v)}</b> <Badge basis="estimate" /><div class="m-r0">R0 {f(r0)}</div></>;
}

export function SalesTab({ data, res, baseRes, changed, warnings }: Props) {
  const S = res.sales, SB = baseRes.sales;
  const c = causesFor('sales', changed);
  const sl = data.kpiQuick.find((k) => /^Service level outbound/.test(k.label))?.value ?? null;
  const fin = (label: string) => data.finance.lines.find((l) => l.label.normalize('NFC') === label.normalize('NFC'))?.value ?? null;
  return (
    <div class="single">
      <p class="pending">Phần <b>service level → penalty → doanh thu</b> đã nối (ước lượng). Ô quyết định hợp đồng Sales (SL hứa, shelf life, order deadline, trade unit, promotion) <b>chưa có</b> — contracted sales giữ số R0.</p>
      <WarningsPanel warnings={warnings} filterTo="Sales" title="Cảnh báo liên quan Sales" />

      <Card title="Tổng quan Sales">
        <Grid>
          <Metric label="Realized revenue" value={eur(S.realizedRevenue)} raw={S.realizedRevenue} base={SB.realizedRevenue} deltaKind="eur" good="up" r0={eur(data.finance.totals.realizedRevenue)} causes={c} hint="Contracted sales (giữ R0) + penalty service level" />
          <Metric label="Penalty service level (3 khách)" value={eur(S.penaltyTotal)} raw={S.penaltyTotal} base={SB.penaltyTotal} deltaKind="eur" good="up" r0={eur(SB.penaltyTotal)} basis="estimate" causes={c} hint="Penalty R0 từng khách × (mức thiếu SL mới ÷ mức thiếu R0)" />
          <Metric label="Service level outbound order lines" value={S.slOutbound === null ? 'thiếu dữ liệu' : pct(S.slOutbound)} raw={S.slOutbound ?? undefined} base={SB.slOutbound ?? undefined} deltaKind="pt" good="up" r0={sl === null ? 'thiếu dữ liệu' : pct(sl)} basis="estimate" causes={c} hint="Dashboard Sales (tab 1) + thay đổi TB gia quyền order lines/tuần của 3 khách" />
          <Metric label="Gross margin" value={eur(res.finance.grossMargin)} raw={res.finance.grossMargin} base={baseRes.finance.grossMargin} deltaKind="eur" good="up" r0={eur(data.finance.totals.grossMargin)} causes={c} />
        </Grid>
      </Card>

      <Card title="Theo khách hàng (hợp đồng tab 6, P&L tab 2)">
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Khách hàng</th><th>SL type</th><th>SL hứa</th><th>Service level (order lines)</th><th>Service level (pieces)</th><th>Mức thiếu so với hứa</th><th>Contracted sales (€)</th><th>Penalty service level (€)</th><th>Revenue (€)</th><th>Attained contract index</th></tr></thead>
            <tbody>
              {S.customers.map((x) => (
                <tr>
                  <td>{x.customer}</td>
                  <td>{x.serviceLevelType}</td>
                  <td>{pct(x.promised, 0)}</td>
                  <td><Cell v={x.slOrderLines} r0={x.slOrderLinesR0} f={(v) => pct(v)} /></td>
                  <td><Cell v={x.slPieces} r0={x.slPiecesR0} f={(v) => pct(v)} /></td>
                  <td><Cell v={x.shortfall} r0={x.shortfallR0} f={(v) => `${num(v * 100, 1)} điểm`} /></td>
                  <td>{num(x.contracted)} <Badge basis="r0" /></td>
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
          Penalty = penalty R0 của khách × (mức thiếu mới ÷ mức thiếu R0); đạt/vượt SL hứa → 0, <b>thưởng khi vượt chưa tính</b>. Attained CI kịch bản = attained CI R0 × (revenue mới ÷ revenue R0).
        </p>
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

      <Card title="Hợp đồng khách hàng (tab 6, nguyên văn)">
        <Table head={['Khách hàng', 'Contract index', 'SL type', 'SL hứa', 'Shelf life', 'Order deadline', 'Trade unit', 'Payment term', 'Promotion', 'SKU']}
          rows={data.sales.contracts.map((k) => [k.customer, num(k.contractIndex, 4), k.serviceLevelType, pct(k.serviceLevel, 0), pct(k.shelfLife, 0), k.orderDeadline, k.tradeUnit, `${k.paymentTermWeeks} tuần`, `${k.promotionalPressure} / ${k.promotionHorizon}`, k.skus])} />
      </Card>
      <Card title="Kết quả theo khách hàng R0 (tab 6)">
        <Table head={['Khách hàng', 'Attained CI', 'SL pieces', 'SL order lines', 'Revenue', 'Order lines/tuần', 'Pallet/tuần', 'Shelf life đạt', 'Distribution']}
          rows={data.sales.customerResults.map((r) => [r.customer, num(r.attainedContractIndex, 3), pct(r.slPieces), pct(r.slOrderLines), eur(r.revenue), num(r.orderLinesPerWeek, 1), num(r.palletsPerWeek, 1), pct(r.attainedShelfLife), eur(r.distributionCost)])} />
      </Card>
      <Card title="Kết quả theo sản phẩm R0 (tab 6)">
        <Table head={['SKU', 'Nhu cầu/tuần', 'Giá bán TB', 'GM/đv', 'SL pieces', 'SL order lines', 'Obsolete', 'Obsolete/tuần']}
          rows={data.sales.productResults.map((p) => [p.sku, num(p.demandPerWeek), `€${num(p.avgPrice, 3)}`, `€${num(p.gmPerUnit, 3)}`, pct(p.slPieces), pct(p.slOrderLines), pct(p.obsolete), eur(p.obsoletePerWeekEur)])} />
      </Card>
    </div>
  );
}
