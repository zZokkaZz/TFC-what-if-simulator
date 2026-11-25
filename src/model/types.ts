import type { ComponentKey, SkuKey } from '../data/types';

export type PM = 'None' | 'Minimal' | 'Extensive';

export interface OpsInputs {
  rmInspection: Record<ComponentKey, boolean>;
  rmPalletLocations: number;
  rmFte: number;
  intakeDays: number;
  mixer: string;
  preventiveMaintenance: PM;
  breakdownTraining: boolean;
  bottlingLine: string;
  shifts: number;
  smed: boolean;
  increaseSpeed: boolean;
  fgPalletLocations: number;
  fgFte: number;
}

export interface ScInputs {
  components: Record<ComponentKey, { safetyStockWeeks: number; lotSizeWeeks: number }>;
  products: Record<SkuKey, { productionIntervalDays: number; safetyStockWeeks: number }>;
  frozenPeriodWeeks: number;
}

/** Điều kiện hợp đồng của một nguyên liệu (ô đàm phán trong game, tab 4 "Lựa chọn khi đàm phán"). */
export interface PurchasingTerms {
  transport: string; // Truck / Boat (chỉ đổi được với NCC có cả hai)
  tradeUnit: string;
  quality: string;
  deliveryWindow: string;
  paymentTermWeeks: number;
  agreedReliability: number; // 0–1
  /** Số đội nhập từ game (sau đàm phán/Calculate). null = bỏ trống → dùng số trước đàm phán / ước lượng. */
  ciGame: number | null;
  reliabilityActual: number | null; // 0–1
  rejectionActual: number | null; // 0–1
}

export interface PurchasingInputs {
  /** NCC đang chọn cho từng nguyên liệu (tên như trong bảng thị trường). */
  suppliers: Record<ComponentKey, string>;
  /** Điều kiện hợp đồng từng nguyên liệu. Đổi NCC → giao diện đặt lại về điều kiện mặc định của NCC mới. */
  terms: Record<ComponentKey, PurchasingTerms>;
}

/** Sales — M3 sẽ thêm service level, shelf life… (giữ chỗ để đồng bộ theo phòng). */
export type SalesInputs = Record<string, number | string | boolean>;

export interface Inputs {
  ops: OpsInputs;
  sc: ScInputs;
  purchasing: PurchasingInputs;
  sales: SalesInputs;
}

/** Một con số kết quả có thể kèm nhãn nguồn gốc để UI gắn badge. */
export type Basis = 'rule' | 'calibrated' | 'estimate' | 'r0';

export interface SkuProduction {
  sku: SkuKey;
  demandUnits: number; // đv/tuần
  prodUnits: number; // đv/tuần (gồm phần dư cho obsolete/reject)
  prodLiters: number;
  intervalDays: number;
  batchesPerWeek: number;
  batchLiters: number;
  mixerLotsPerBatch: number;
  mixerLotL: number;
  excessLitersPerBatch: number; // do làm tròn lên mẻ tối thiểu
  availability: number; // tích availability NL (R0)
  adherence: number;
  startupLossEur: number; // cả round
}

export interface DailySeries {
  pallets: number[];
  overflow: number[];
  hours: number[];
}

export interface WarehouseResult {
  capacity: number;
  avgPallets: number;
  peakPallets: number;
  utilization: number;
  avgOverflowPallets: number;
  overflowShare: number;
  overflowCost: number;
  hoursPerWeek: number;
  hoursBreakdown: Record<string, number>; // giờ/tuần theo hạng mục
  fixedHoursPerWeek: number;
  excessHours: number; // giờ vượt giờ cố định, cộng theo ngày (cả round)
  flexHours: number; // giờ thời vụ trả tiền = giờ vượt × hệ số năng suất thời vụ
  flexCost: number;
  flexShare: number; // giờ vượt / tổng giờ công cần
  flexWarn: boolean;
  daysOverCapacity: number;
  recommendedCapacity: number; // đỉnh pallet × (1 + biên an toàn)
  costOptimalCapacity: number; // số chỗ làm (phí chỗ + phí overflow) nhỏ nhất, với chuỗi pallet hiện tại
  costAtOptimal: number; // phí chỗ + overflow tại số chỗ tối ưu (cả round)
  peakDayHours: number;
  daysAboveFixed: number;
  palletsInPerWeek: number;
  orderLinesPerWeek: number;
  daily: DailySeries;
}

export interface ComponentFlow {
  key: ComponentKey;
  supplier: string;
  tradeUnit: string;
  usagePerWeek: number;
  purchasedPerWeek: number;
  orderUnits: number;
  deliveriesPerRound: number;
  avgStockUnits: number;
  avgStockWeeks: number;
  storage: 'pallet' | 'tank';
  avgLocations: number; // pallet hoặc tank
  palletsPerDelivery: number;
}

export interface CostLine {
  id: string;
  label: string;
  group: 'production' | 'warehouse';
  value: number;
  basis: Basis;
}

export interface OpsResults {
  production: SkuProduction[];
  prodFactor: number;
  line: {
    name: string;
    speedLph: number;
    regularHours: number;
    run: number;
    changeover: number;
    breakdown: number;
    maintenance: number;
    unused: number;
    overtime: number;
    outsourced: number;
    needHours: number;
    sigmaHours: number;
    changeoversPerWeek: number;
    avgChangeoverH: number;
    capacityAdherence: number;
    planAdherence: number;
    startupLossEur: number;
    freeHours: number; // 168 − nhu cầu trung bình: còn bao nhiêu giờ có thể thêm (kể cả overtime)
    bottleneck: boolean;
  };
  mixer: {
    name: string;
    lotsPerWeek: number;
    avgLotL: number;
    mixHours: number;
    cleanHours: number;
    cleaningShare: number;
    utilization: number;
    excessLitersPerWeek: number;
    bottleneck: boolean;
  };
  rm: WarehouseResult;
  fg: WarehouseResult;
  components: ComponentFlow[];
  tankYard: { avgTanks: number; peakTanks: number; tankDays: number; receipts: number; deliveries: number; cost: number };
  costs: CostLine[];
  productionCost: number;
  warehouseCost: number;
  machinesInvestment: number;
  scLink: {
    risk: Record<ComponentKey, import('./supplyChain').ComponentRisk>;
    componentAvailability: Record<ComponentKey, number>;
    rmStockRatio: Record<ComponentKey, number>;
    fgStockRatio: Record<SkuKey, number>;
  };
}

export interface FinanceRow {
  id: string;
  group: string;
  label: string;
  r0: number | null;
  value: number;
  modeled: boolean; // true: tính từ model; false: giữ số R0
  isTotal?: boolean;
  isNew?: boolean;
}

export interface FinanceResults {
  rows: FinanceRow[];
  realizedRevenue: number;
  cogs: number;
  grossMargin: number;
  indirectCost: number;
  operatingProfit: number;
  investment: number;
  roi: number;
  opsScore: number; // (chi phí sản xuất + kho) / doanh thu
  breakdown: RoiBreakdown;
}

/** Một nút trong cây phân rã ROI. `status`: modeled = tính từ model; r0 = giữ số Round 0; missing = file không có số tách riêng. */
export interface RoiNode {
  id: string;
  label: string;
  value: number | null;
  r0: number | null;
  status: 'modeled' | 'r0' | 'mixed' | 'missing';
  note?: string;
  children?: RoiNode[];
}

export interface RoiBreakdown {
  roi: number;
  operatingProfit: RoiNode;
  investment: RoiNode;
}

export interface Results {
  /** Số hiển thị: neo vào số đề bài (R0 + thay đổi do quyết định) */
  ops: OpsResults;
  /** Số mô hình thô (dùng đo độ chính xác của mô hình so với R0) */
  opsRaw: OpsResults;
  sc: ScResults;
  purchasing: PurchasingResults;
  sales: SalesResults;
  finance: FinanceResults;
}

export interface SalesCustomerResult {
  customer: string;
  contractIndex: number;
  serviceLevelType: string;
  promised: number; // SL hứa (tab 6)
  slOrderLinesR0: number;
  slOrderLines: number; // ước lượng kịch bản (= R0 khi không đổi gì)
  slPiecesR0: number;
  slPieces: number;
  shortfallR0: number; // max(0, hứa − SL R0)
  shortfall: number;
  contracted: number; // Contracted sales (tab 2) — giữ R0 (nhu cầu, giá chưa mô hình)
  penaltyR0: number; // âm, tab 2
  penalty: number; // âm
  revenueR0: number;
  revenue: number;
  attainedCiR0: number;
  attainedCi: number; // = attained CI R0 × (revenue ÷ revenue R0)
}

export interface SalesResults {
  customers: SalesCustomerResult[];
  realizedRevenue: number;
  penaltyTotal: number;
  /** Service level outbound order lines (dashboard) = R0 + (TB gia quyền order lines mới − baseline) */
  slOutbound: number | null;
  /** Độ dốc SL theo plan adherence (hồi quy 6 SKU R0) */
  adherenceSlope: { slope: number; r2: number };
}

/** Nguồn của một số Purchasing: sheet (= R0), game (đội nhập), estimate (ước lượng), scaled (R0 × tỷ lệ mô hình). */
export type PurBasis = 'sheet' | 'game' | 'estimate' | 'scaled';

export interface PurchasingComponentResult {
  key: ComponentKey;
  supplier: string;
  supplierR0: string;
  isR0Supplier: boolean;
  transport: string;
  tradeUnit: string;
  quality: string;
  deliveryWindow: string;
  paymentTermWeeks: number;
  leadTimeDays: number;
  basePrice: number;
  contractIndex: number;
  ciBasis: PurBasis;
  /** Điều kiện đã đổi so với mặc định của NCC nhưng chưa nhập CI game → giá đang dùng CI trước đàm phán */
  ciStale: boolean;
  reliability: number;
  reliabilityBasis: PurBasis;
  rejection: number;
  rejectionBasis: PurBasis;
  amountPurchased: number; // cả round (hiển thị: R0 × tỷ lệ mô hình)
  goodsValue: number; // giá × lượng mua
  transportCost: number;
  purchaseValue: number;
  purchaseValueR0: number;
  transportCostR0: number;
  /** Purchase value ÷ lượng mua (gồm phí vận chuyển) — như cột "Giá thực trả" tab 4 */
  pricePaid: number;
  deliveriesPerRound: number;
  /** Phải trả NCC ước lượng = purchase value/tuần × payment term (dùng cho thay đổi Investment) */
  payables: number;
}

export interface PurchasingResults {
  components: PurchasingComponentResult[];
  purchaseValue: number;
  transportCost: number;
  inboundOrderLines: number; // € (P&L)
  inboundOrders: number; // € (P&L)
  deliveriesPerRound: number;
  /** Thay đổi dòng Investment: Payment terms (AR − AP) do payment term NCC — ước lượng */
  paymentTermsDelta: number;
  /** KPI dashboard (đã neo R0 + chênh lệch) */
  kpi: { rejection: number; reliability: number; rawMaterialCosts: number; avgContractIndex: number };
}

/** Một ô hiển thị: số sheet R0, số kịch bản (= R0 khi không đổi gì), và cách ra số kịch bản. */
export interface SheetCell {
  r0: number | null;
  value: number | null;
  basis: 'sheet' | 'scaled' | 'model' | 'notModeled';
}

export interface ScComponentResult {
  key: ComponentKey;
  /** Các cột tab 7 theo đúng thứ tự sheet */
  sheet: {
    reliability: SheetCell; stockUnits: SheetCell; stockWeeks: SheetCell; stockValue: SheetCell; economicWeeks: SheetCell;
    demandPerWeek: SheetCell; obsoletes: SheetCell; availability: SheetCell; bias: SheetCell; amountPurchased: SheetCell; orderSize: SheetCell;
  };
  deliveries: SheetCell;
  supplier: string;
  safetyStockWeeks: number;
  lotSizeWeeks: number;
  orderUnits: number;
  deliveriesPerRound: number;
  avgStockWeeks: number;
  avgLocations: number;
  storage: 'pallet' | 'tank';
  stockValue: number;
  stockValueR0: number;
  availability: number;
  availabilityR0: number;
  leadTimeWeeks: number;
  reliability: number;
  recommendedSsWeeks: number;
  stockoutDaysR0: number | null;
}

export interface ScProductResult {
  sku: SkuKey;
  sheet: {
    demandPerWeek: SheetCell; slPieces: SheetCell; slOrderLines: SheetCell; stockWeeks: SheetCell; stockValue: SheetCell; economicWeeks: SheetCell;
    floatingStock: SheetCell; obsoletes: SheetCell; obsoleteValuePerWeek: SheetCell; mape: SheetCell; bias: SheetCell; batches: SheetCell;
    startupLoss: SheetCell; rejects: SheetCell; planAdherence: SheetCell;
  };
  intervalDays: number;
  safetyStockWeeks: number;
  batchesPerRound: number;
  avgStockWeeks: number;
  theoryStockWeeks: number;
  stockValue: number;
  stockValueR0: number;
  slPiecesR0: number;
  slPiecesEst: number;
  targetServiceLevel: number;
  recommendedSsWeeks: number;
  maxAgeWeeks: number;
  allowedAgeWeeks: number | null;
  obsoleteR0: number;
  stockoutDaysR0: number | null;
  componentAvailability: number;
}

export interface ScResults {
  components: ScComponentResult[];
  products: ScProductResult[];
  stockValue: { components: number; products: number; total: number; componentsR0: number; productsR0: number };
}
