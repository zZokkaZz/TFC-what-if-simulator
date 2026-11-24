// Các tab chưa có quyết định trong M1: hiển thị dữ liệu Round 0 thô (M0) + P&L + giả định.
import type { Round0Data } from '../data/types';
import type { Results } from '../model/types';
import { ASSUMPTIONS } from '../model/assumptions';
import { getCalibration } from '../model/simulate';
import { Badge, Card, Table } from './components';
import { eur, num, pct, signed } from './format';

const Pending = ({ m }: { m: string }) => <p class="pending">Quyết định của phòng này sẽ sửa được ở <b>{m}</b>. Hiện hiển thị dữ liệu Round 0 thô từ file Excel.</p>;

export function SupplyChainTab({ data }: { data: Round0Data }) {
  const sc = data.supplyChain;
  return (
    <div class="single">
      <Pending m="M2" />
      <Card title="Quyết định nguyên liệu">
        <Table head={['Component', 'Safety stock (tuần)', 'Lot size (tuần)']} rows={sc.components.map((c) => [c.component, c.safetyStockWeeks, c.lotSizeWeeks])} />
      </Card>
      <Card title="Quyết định thành phẩm (DC Netherlands)">
        <Table head={['SKU', 'Production interval (ngày)', 'Safety stock (tuần)']} rows={sc.products.map((p) => [p.sku, p.productionIntervalDays, p.safetyStockWeeks])} />
        <p class="muted">Frozen period of production: {sc.frozenPeriodWeeks} tuần.</p>
      </Card>
      <Card title="Tồn kho nguyên liệu R0">
        <Table head={['Component', 'Reliability NCC', 'Tồn (tuần)', 'Giá trị tồn', 'Nhu cầu/tuần', 'Availability', 'Cỡ đơn', 'Ngày hết hàng']}
          rows={sc.componentStock.map((c) => [c.component, pct(c.supplierReliability), num(c.stockWeeks, 1), eur(c.stockValue), num(c.demandPerWeek), pct(c.availability), num(c.orderSize), data.dailyStats.stockoutDays[c.component] ?? '—'])} />
      </Card>
      <Card title="Tồn kho thành phẩm R0">
        <Table head={['SKU', 'SL pieces', 'SL order lines', 'Tồn (tuần)', 'Giá trị tồn', 'Obsolete', 'MAPE', 'Plan adherence', 'Ngày hết hàng']}
          rows={sc.productStock.map((p) => [p.sku, pct(p.slPieces), pct(p.slOrderLines), num(p.stockWeeks, 1), eur(p.stockValue), pct(p.obsolete), pct(p.mape, 0), pct(p.planAdherence), data.dailyStats.stockoutDays[p.sku] ?? '—'])} />
        <p class="muted">Tổng giá trị tồn NL + TP: {eur(sc.totalStockValue)}</p>
      </Card>
      <Card title="Nhu cầu theo tuần R0 (tuần 1–26)">
        <Table head={['SKU', 'TB/tuần', 'Độ lệch chuẩn', 'CV', 'Thấp nhất', 'Cao nhất']}
          rows={Object.keys(data.weekly.mean).map((k) => {
            const s = k as keyof typeof data.weekly.mean;
            const vals = data.weekly.weeks.filter((w) => w.week >= 1).map((w) => w.demand[s]);
            return [k, num(data.weekly.mean[s]), num(data.weekly.std[s]), pct(data.weekly.cv[s], 0), num(Math.min(...vals)), num(Math.max(...vals))];
          })} />
      </Card>
    </div>
  );
}

export function PurchasingTab({ data }: { data: Round0Data }) {
  const p = data.purchasing;
  return (
    <div class="single">
      <Pending m="M3" />
      <Card title="Hợp đồng hiện tại">
        <Table head={['Component', 'NCC', 'Contract index', 'Quality', 'Lead time (ngày)', 'Trade unit', 'Reliability cam kết', 'Delivery window', 'Payment term (tuần)']}
          rows={p.contracts.map((s) => [s.component, s.supplier, num(s.contractIndex, 4), s.quality, s.leadTimeDays, s.tradeUnit, pct(s.agreedReliability, 0), s.deliveryWindow, s.paymentTermWeeks])} />
      </Card>
      <Card title="Kết quả NCC R0">
        <Table head={['NCC', 'Reliability thực tế', 'Rejection', 'Purchase value', 'Transport', 'Transport/purchase', 'Giá thực trả', 'Cỡ đơn']}
          rows={p.results.map((r) => [r.supplier, pct(r.reliability), pct(r.rejection), eur(r.purchaseValue), eur(r.transportCost), pct(r.transportCost / r.purchaseValue, 0), `€${num(r.pricePaid, 4)}`, num(r.orderSize)])} />
      </Card>
      <Card title={`Thị trường NCC (${p.market.length} NCC)`}>
        <Table head={['Component', 'NCC', 'Đang dùng', 'CI', 'Quality', 'Lead time', 'Cert.', 'Vận chuyển', 'Free cap.', 'Trade unit', 'Reliability', 'Window']}
          rows={p.market.map((s) => [s.component, s.supplier, s.inUse ? '●' : '', num(s.contractIndex, 4), s.quality, s.leadTimeDays, s.certified ? 'Có' : '', s.transport, pct(s.freeCapacity, 0), s.tradeUnit, pct(s.agreedReliability, 0), s.deliveryWindow])} />
      </Card>
    </div>
  );
}

export function SalesTab({ data }: { data: Round0Data }) {
  const s = data.sales;
  return (
    <div class="single">
      <Pending m="M3" />
      <Card title="Hợp đồng khách hàng">
        <Table head={['Khách hàng', 'Contract index', 'SL type', 'SL hứa', 'Shelf life', 'Order deadline', 'Trade unit', 'Payment term', 'Promotion', 'SKU']}
          rows={s.contracts.map((c) => [c.customer, num(c.contractIndex, 4), c.serviceLevelType, pct(c.serviceLevel, 0), pct(c.shelfLife, 0), c.orderDeadline, c.tradeUnit, `${c.paymentTermWeeks} tuần`, `${c.promotionalPressure} / ${c.promotionHorizon}`, c.skus])} />
      </Card>
      <Card title="Kết quả theo khách hàng R0">
        <Table head={['Khách hàng', 'Attained CI', 'SL pieces', 'SL order lines', 'Revenue', 'Order lines/tuần', 'Pallet/tuần', 'Shelf life đạt', 'Distribution']}
          rows={s.customerResults.map((c) => [c.customer, num(c.attainedContractIndex, 3), pct(c.slPieces), pct(c.slOrderLines), eur(c.revenue), num(c.orderLinesPerWeek, 1), num(c.palletsPerWeek, 1), pct(c.attainedShelfLife), eur(c.distributionCost)])} />
      </Card>
      <Card title="Kết quả theo sản phẩm R0">
        <Table head={['SKU', 'Nhu cầu/tuần', 'Giá bán TB', 'GM/đv', 'SL pieces', 'SL order lines', 'Obsolete', 'Obsolete/tuần']}
          rows={s.productResults.map((p) => [p.sku, num(p.demandPerWeek), `€${num(p.avgPrice, 3)}`, `€${num(p.gmPerUnit, 3)}`, pct(p.slPieces), pct(p.slOrderLines), pct(p.obsolete), eur(p.obsoletePerWeekEur)])} />
      </Card>
    </div>
  );
}

export function FinanceTab({ res, baseRes, roiR0 }: { res: Results; baseRes: Results; roiR0: number }) {
  const f = res.finance;
  const baseById = new Map(baseRes.finance.rows.map((r) => [r.id, r.value]));
  return (
    <div class="single">
      <Card title="P&L Round (mô hình M1)">
        <p class="muted">Dòng có nhãn <b>mô hình</b> tính từ quyết định Ops; dòng <Badge basis="r0" /> giữ nguyên số Round 0 (Sales, Purchasing, SC, tồn kho, payment terms sẽ mô hình ở M2–M4). Dòng đổi so với baseline được tô vàng.</p>
        <div class="tbl-wrap">
          <table class="pnl">
            <thead><tr><th>Nhóm</th><th>Dòng</th><th>R0 thật</th><th>Baseline mô hình</th><th>Kịch bản</th><th>Δ vs baseline</th></tr></thead>
            <tbody>
              {f.rows.map((r) => {
                const bv = baseById.get(r.id) ?? 0;
                const d = r.value - bv;
                const changed = Math.abs(d) > 0.5;
                return (
                  <tr class={`${r.isTotal ? 'total' : ''} ${changed ? 'changed' : ''}`}>
                    <td>{r.group}</td>
                    <td>{r.label} {!r.isTotal && (r.modeled ? <span class="badge badge-model">mô hình</span> : <Badge basis="r0" />)}</td>
                    <td>{r.r0 === null ? '' : eur(r.r0)}</td>
                    <td>{eur(bv)}</td>
                    <td>{eur(r.value)}</td>
                    <td>{changed ? <span class={(d < 0) === /revenue|margin|profit/i.test(r.label) ? 'bad' : 'good'}>{signed(d, 'eur')}</span> : ''}</td>
                  </tr>
                );
              })}
              <tr class="total"><td>TỔNG</td><td>ROI</td><td>{pct(roiR0, 2)}</td><td>{pct(baseRes.finance.roi, 2)}</td><td>{pct(f.roi, 2)}</td><td>{signed(f.roi - baseRes.finance.roi, 'pt', 2)}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function AssumptionsTab({ data }: { data: Round0Data }) {
  const cal = getCalibration(data);
  return (
    <div class="single">
      <Card title="Hệ số hiệu chỉnh (tự tính từ số Round 0)">
        <Table head={['Hệ số', 'Giá trị', 'Cách tính', 'Chỉ số khớp R0 do cấu tạo']} rows={cal.notes.map((n) => [n.label, n.value, n.derivation, n.matchesByConstruction.join(', ') || '—'])} />
      </Card>
      <Card title="Giả định ước lượng (không có trong luật game)">
        <Table head={['Giả định', 'Đang dùng', 'Vì sao là ước lượng']} rows={ASSUMPTIONS.map((a) => [a.label, a.value, a.why])} />
        <p class="muted">Chi tiết đầy đủ: file ASSUMPTIONS.md trong repo.</p>
      </Card>
      <Card title="Vấn đề Round 0 (tab 1)">
        <Table head={['#', 'Vấn đề', 'Bằng chứng', 'Phòng', 'Liên quan Ops']} rows={data.issues.map((i) => [i.no, i.issue, i.evidence, i.owner, i.opsLink ?? ''])} />
      </Card>
      <Card title="Luật game (Info Center)">
        <Table head={['Chủ đề', 'Luật', 'Ảnh hưởng tới Ops']} rows={data.rules.map((r) => [r.topic, r.rule, r.opsImpact ?? ''])} />
      </Card>
      <Card title="Định mức Operations">
        <Table head={['Khu vực', 'Công việc', 'Định mức']} rows={data.ops.norms.map((n) => [n.area, n.task, n.norm])} />
      </Card>
      <Card title="Viết tắt">
        <Table head={['Thuật ngữ', 'Đầy đủ', 'Giải thích']} rows={data.glossary.map((g) => [g.term, g.full, g.explain])} />
      </Card>
      <p class="muted">Dữ liệu: {data.meta.source} · sinh lúc {new Date(data.meta.generatedAt).toLocaleString('vi-VN')} · tab: {data.meta.sheets.join(', ')}</p>
    </div>
  );
}
