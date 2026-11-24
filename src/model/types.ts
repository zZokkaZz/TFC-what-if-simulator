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

export interface PurchasingInputs {
  /** NCC đang chọn cho từng nguyên liệu (tên như trong bảng thị trường). */
  suppliers: Record<ComponentKey, string>;
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
  ops: OpsResults;
  sc: ScResults;
  finance: FinanceResults;
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
