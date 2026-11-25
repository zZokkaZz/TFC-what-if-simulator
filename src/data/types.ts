// Kiểu dữ liệu Round 0 (sinh bởi scripts/build-data.ts từ data/TFC_Round0.xlsx).
// Mọi số đều lấy từ file Excel, không gõ tay.

export type SkuKey = 'Orange 1L' | 'C-power 1L' | 'Mango 1L' | 'Orange PET' | 'C-power PET' | 'Mango PET';
export type ComponentKey = 'Pack' | 'PET' | 'Orange' | 'Mango' | 'Vitamin C';
export type Quality = 'High' | 'Middle' | 'Poor';
export type TradeUnit = 'Pallet' | 'Tank' | 'IBC' | 'Drum' | string;

export interface FinanceLine {
  group: string;
  label: string;
  value: number;
  note: string | null;
}

export interface Product {
  key: SkuKey;
  name: string;
  packaging: 'Pack' | 'PET';
  litersPerUnit: number;
  unitsPerCase: number;
  unitsPerLayer: number;
  unitsPerPallet: number;
  basePrice: number;
  bom: Record<ComponentKey, number>; // số đơn vị component / 1 đơn vị sản phẩm
  demandPerWeek: number; // đơn vị/tuần R0
}

export interface Component {
  key: ComponentKey;
  name: string;
  unit: string; // 'cái' | 'lít'
  basePrice: number;
  spec: string;
  unitsPerPallet: number | null; // bao bì: cái/pallet
  unitsPerLayer: number | null;
  liquidUnits: { drum: number; ibc: number; tank: number } | null; // lít/đơn vị chứa
  shelfLifeWeeks: number | null;
}

export interface SupplierTerms {
  component: ComponentKey;
  supplier: string;
  inUse: boolean;
  contractIndex: number;
  quality: Quality;
  leadTimeDays: number;
  certified: boolean;
  country: string;
  transport: string;
  freeCapacity: number;
  paymentTermWeeks: number;
  tradeUnit: TradeUnit;
  agreedReliability: number;
  deliveryWindow: string;
}

export interface SupplierResult {
  supplier: string;
  component: ComponentKey;
  reliability: number;
  rejection: number;
  purchaseValue: number;
  transportCost: number;
  demandPerWeek: number;
  pricePaid: number;
  orderSize: number;
  deliveriesCol: number | null;
  orderLinesCol: number | null;
  purchasedInRound: number | null;
}

export interface SupplierSpec {
  component: ComponentKey;
  supplier: string;
  inUse: boolean;
  basicContractIndex: number;
  marketContractIndex: number;
  basePrice: number;
  transportModes: string[];
  leadTimeDays: Record<string, number>;
  costPerShipment: Record<string, number>;
  costPerSmallUnit: Record<string, number>; // € / pallet, drum hoặc IBC
  costPerFull: Record<string, number>; // € / FTL hoặc tank
  freeCapacityExclTfc: number;
  freeCapacityInclTfc: number;
  startPaymentTerm: string;
  worldShare: number;
  certified: boolean;
}

export interface NegotiationOption {
  component: ComponentKey;
  tradeUnits: string[];
  qualities: string[];
  deliveryWindows: string[];
  paymentTerm: string;
  reliability: string;
  transport: string;
}

export interface Mixer {
  name: string;
  inUse: boolean;
  minBatchL: number;
  maxBatchL: number;
  annualFee: number;
  costPerRunHour: number;
  investment: number;
  mixHoursPerBatch: number;
  cleanHours: number;
}

export interface BottlingLine {
  name: string;
  inUse: boolean;
  speedLph: number;
  workersPerShift: number;
  annualFee: number;
  investment: number;
  formulaChangeoverH: number;
  sizeChangeoverH: number;
  tolerance: 'Narrow' | 'Middle' | 'Wide' | string;
  startupLoss: number;
}

export interface OpsDecisionsR0 {
  rmInspection: Record<ComponentKey, boolean>;
  rmPalletLocations: number;
  rmFte: number;
  intakeDays: number;
  mixer: string;
  preventiveMaintenance: 'None' | 'Minimal' | 'Extensive';
  breakdownTraining: boolean;
  bottlingLine: string;
  shifts: number;
  smed: boolean;
  increaseSpeed: boolean;
  fgPalletLocations: number;
  fgFte: number;
}

export interface OpsResultsR0 {
  rm: { capacity: number; usage: number; utilization: number; overflow: number; orderLinesPerWeek: number; palletsPerWeek: number; hoursPerWeek: number; flexFte: number };
  tankYard: { tankDaysPerWeek: number; capacity: number | null; usage: number | null; tanksPerWeek: number | null };
  fg: { capacity: number; usage: number; utilization: number; overflow: number; orderLinesPerWeek: number; palletsPerWeek: number; hoursPerWeek: number; flexFte: number };
  line: { name: string; run: number; changeover: number; breakdown: number; unused: number; overtime: number; planAdherence: number; startupLossEur: number; outsourcedH: number };
  mixer: { name: string; cleaningShare: number; avgLotL: number };
}

export interface CustomerContract {
  customer: string;
  stores: number;
  marketShare: number;
  valueForMoney: boolean;
  contractIndex: number;
  serviceLevelType: string;
  serviceLevel: number;
  shelfLife: number;
  orderDeadline: string;
  tradeUnit: string;
  paymentTermWeeks: number;
  promotionalPressure: string;
  promotionHorizon: string;
  skus: string;
}

export interface CustomerResult {
  customer: string;
  attainedContractIndex: number;
  slPieces: number;
  slOrderLines: number;
  slOrders: number;
  osa: number;
  revenue: number;
  grossMarginPerWeek: number;
  shipmentsPerWeek: number;
  orderLinesPerWeek: number;
  palletsPerWeek: number;
  daysInWarehouse: number;
  attainedShelfLife: number;
  distributionCost: number;
}

export interface ProductResult {
  sku: SkuKey;
  demandPerWeek: number;
  demandValuePerWeek: number;
  avgPrice: number;
  gmPerUnit: number;
  slPieces: number;
  slOrderLines: number;
  osa: number;
  orderLinesPerWeek: number;
  obsolete: number;
  obsoletePerWeekEur: number;
}

export interface CustomerProduct {
  customer: string;
  sku: SkuKey;
  demandPerWeek: number;
  price: number;
  attainedShelfLife: number;
  slPieces: number;
  slOrderLines: number;
  osa: number;
  promoUplift: number;
}

export interface ComponentStock {
  component: ComponentKey;
  supplierReliability: number;
  stockUnits: number;
  stockWeeks: number;
  stockValue: number;
  economicWeeks: number;
  demandPerWeek: number;
  availability: number;
  purchasedInRound: number;
  orderSize: number;
  obsoletes: number | null;
  bias: number | null;
}

export interface ProductStock {
  sku: SkuKey;
  slPieces: number;
  slOrderLines: number;
  stockWeeks: number;
  stockValue: number;
  obsolete: number;
  mape: number;
  batches: number;
  startupLossEur: number; // tổng cả round của SKU (cột ghi "per batch" nhưng cộng lại = tổng 8.435)
  planAdherence: number;
  demandPerWeek: number | null;
  economicWeeks: number | null;
  floatingStockValue: number | null;
  obsoleteValuePerWeek: number | null;
  bias: number | null;
  rejectsEur: number | null;
}

export interface DailyRow {
  day: number;
  rmWeeks: Record<ComponentKey, number>;
  fgWeeks: Record<SkuKey, number>;
  rmHours: number;
  fgHours: number;
}

export interface Round0Data {
  meta: { source: string; generatedAt: string; sheets: string[] };
  issues: { no: number; issue: string; evidence: string; owner: string; opsLink: string | null }[];
  finance: {
    lines: FinanceLine[];
    totals: { roi: number; realizedRevenue: number; purchaseValue: number; productionCosts: number; cogs: number; grossMargin: number; indirectCost: number; operatingProfit: number; investment: number };
    /** Số game in ra (cột Ghi chú tab 2, "Game: …"); khác tổng dòng sheet 1–2 € do game làm tròn từng dòng. null = thiếu dữ liệu */
    gamePrinted: { operatingProfit: number | null; indirectCost: number | null };
  };
  products: Product[];
  /** Số pallet / 1 xe tải FTL (ghi chú tab 3); null = thiếu dữ liệu */
  palletsPerFtl: number | null;
  /** Hạn dùng sản phẩm (tuần), đọc từ tiêu đề bảng tab 3; null = thiếu dữ liệu */
  productShelfLifeWeeks: number | null;
  components: Component[];
  purchasing: { contracts: SupplierTerms[]; results: SupplierResult[]; market: SupplierTerms[]; specs: SupplierSpec[]; negotiation: NegotiationOption[]; contractTransportChoice: Record<string, string | null> };
  ops: { decisions: OpsDecisionsR0; results: OpsResultsR0; mixers: Mixer[]; lines: BottlingLine[]; norms: { area: string; task: string; norm: string }[] };
  sales: { contracts: CustomerContract[]; customerResults: CustomerResult[]; productResults: ProductResult[]; customerProduct: CustomerProduct[]; notes: string[] };
  supplyChain: {
    components: { component: ComponentKey; safetyStockWeeks: number; lotSizeWeeks: number }[];
    products: { sku: SkuKey; productionIntervalDays: number; safetyStockWeeks: number }[];
    frozenPeriodWeeks: number;
    componentStock: ComponentStock[];
    productStock: ProductStock[];
    totalStockValue: number;
    dashboard: { kpi: string; rMinus2: number | null; rMinus1: number | null; r0: number | null; comment: string | null }[];
  };
  history: { group: string; object: string; metric: string; rMinus2: number | null; r0: number | null }[];
  /** Bảng nguyên văn từ sheet (để hiển thị đúng như file) */
  kpiQuick: { label: string; value: number | null; source: string }[];
  purchasingDashboard: { sourceText: string | null; rejection: number | null; reliability: number | null; rmCostShare: number | null };
  rawTables: { id: string; sheet: string; title: string; headers: string[]; rows: (string | number | null)[][]; pct?: boolean[][] }[];
  analysis: {
    components: { component: ComponentKey; orderLinesPerRound: number; obsoletes: number }[];
    products: { sku: SkuKey; rejectsEur: number; gmPerWeek: number }[];
    distributor: { name: string; cost: number; serviceLevel: number; smallPallets: number; mediumPallets: number; largePallets: number } | null;
  };
  daily: DailyRow[];
  dailyStats: { rmFixedHoursPerDay: number; fgFixedHoursPerDay: number; rmDaysAboveFixed: number; fgDaysAboveFixed: number; stockoutDays: Record<string, number> };
  weekly: { weeks: { week: number; demand: Record<SkuKey, number> }[]; mean: Record<SkuKey, number>; std: Record<SkuKey, number>; cv: Record<SkuKey, number> };
  rules: { topic: string; rule: string; opsImpact: string | null }[];
  glossary: { term: string; full: string; explain: string }[];
}
